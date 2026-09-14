import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ElevationSampler,
  ImagerySampler,
  esriImageryUrl,
  fromLocalMetres,
  loadImage,
  loadImageSized,
  tileByteSize,
  metresPerDegLon,
  M_PER_DEG_LAT,
  tileBounds,
  tileCoords,
  tileSpanMetres,
  toLocalMetres,
  type LatLng,
} from "./geoTiles";
import { OPENFREEMAP_MAX_ZOOM, fetchVectorTile, tileToLonLat } from "./vectorTiles";

/**
 * Terrain is drawn as two concentric rings. The near ring is high zoom so the
 * ground under the train resolves to about a metre per pixel; the far ring is
 * low zoom and cheap, and carries the horizon out past the fog. The far ring
 * sits a few metres lower so the near ring always wins where they overlap,
 * instead of z-fighting along the seam.
 */
export interface TerrainLevel {
  zoom: number;
  /** Tiles either side of centre: 2 -> a 5x5 grid at that zoom. */
  ring: number;
  /** Metres to sink this level, keeping coarser rings under finer ones. */
  drop: number;
  /** Grid subdivisions per tile. A coarse ring covers more ground per tile and
   *  needs more of them, or distant hills come out faceted. */
  segments?: number;
}

/**
 * Four rings, each about four times coarser than the one inside it.
 *
 * It used to be three, and it jumped from 0.6 m/px straight to 2.4 m/px at
 * about 350 m out. From a chase camera the mid-distance IS most of the frame,
 * so that step is what the ride actually looked like - sharp under the wheels
 * and soft everywhere the eye goes. The 1.2 m/px ring in the middle is the one
 * that matters: it carries real detail out past a kilometre.
 *
 * Sixty-eight tiles all told, which is fewer than the three-ring version used
 * and spent far better. A hundred - two full rings at both sharp zooms - was
 * measurably too many: the renderer stopped answering while they loaded.
 *
 * The rings are centred ahead of the train, not on it, so the budget is spent
 * where the camera is pointing rather than behind it.
 */
export const TERRAIN_LEVELS: TerrainLevel[] = [
  { zoom: 18, ring: 1, drop: 0, segments: 12 },  // ~0.6 m/px, 410 m across
  { zoom: 17, ring: 2, drop: 2, segments: 14 },  // ~1.2 m/px, 1.4 km across
  { zoom: 15, ring: 2, drop: 5, segments: 32 },  // ~4.8 m/px, 5.5 km across
  { zoom: 12, ring: 1, drop: 9, segments: 32 },  // the horizon, 26 km across
];

/** Below this, an Esri tile is a "no imagery here" placeholder, not ground. */
const BLANK_TILE_BYTES = 4500;

/**
 * Below this, the tile carries no more real detail than the ring beneath it.
 *
 * Esri's World Imagery is aerial over the cities and satellite over the rest,
 * and its native resolution in the Cape mountains is around zoom 15. It still
 * answers 200 at zoom 18 - it just hands back an enlargement of the same
 * pixels, and a JPEG of an enlargement compresses small. Measured at Tulbagh:
 * z15 is 10.4 KB, z17 is 6.9 KB, z18 is 5.6 KB, z19 is 2.5 KB. Pretoria's z18
 * is 19.5 KB. Size is a good proxy for whether there is anything in there.
 *
 * Requesting those upsampled levels buys nothing - the same smear, in bigger
 * pixels - and costs four times the tiles per ring. Skipping them lets the ring
 * below show through, which looks identical and is a quarter of the work.
 */
const UPSAMPLED_TILE_BYTES = 7000;

const TILE_SEGMENTS = 12;

/**
 * Rings of real satellite-imagery tiles that follow the train, each tile
 * displaced by real elevation. Replaces the old single 1000-unit plane that wore
 * one zoom-4 tile - about 10 km per pixel, of the wrong hemisphere - stretched
 * across the entire country.
 */
export class TerrainStreamer {
  readonly group = new THREE.Group();
  readonly elevation = new ElevationSampler(13);
  readonly imagery = new ImagerySampler(TERRAIN_LEVELS[0].zoom);

  private tiles = new Map<string, THREE.Mesh>();
  private pending = new Set<string>();
  private origin: LatLng;
  private anisotropy = 4;
  private disposed = false;
  /** At speed the near ring is dropped: you cannot resolve 1 m/px at 4 km/s. */
  private nearDetail = true;
  /**
   * Tiles either side of centre on the sharpest ring. Two is 25 images, which
   * is the right spend when the train is doing 0.25 km/s and the rider can
   * actually see the ground; at 4x it is 25 images every few seconds for detail
   * nobody can resolve, so it drops to one.
   */
  private nearRing = TERRAIN_LEVELS[0].ring;

  constructor(origin: LatLng) {
    this.origin = origin;
  }

  setAnisotropy(value: number) {
    this.anisotropy = value;
  }

  setNearDetail(enabled: boolean) {
    this.nearDetail = enabled;
  }


  setNearRing(tiles: number) {
    this.nearRing = Math.max(1, Math.min(TERRAIN_LEVELS[0].ring, Math.round(tiles)));
  }

  /** Move every existing tile into a new local frame after a floating-origin shift. */
  setOrigin(origin: LatLng) {
    this.origin = origin;
    for (const [key, mesh] of this.tiles) this.place(mesh, key);
  }

  private static parse(key: string) {
    const [zoom, tileX, tileY] = key.split("/").map(Number);
    return { zoom, tileX, tileY };
  }

  private place(mesh: THREE.Mesh, key: string) {
    const { zoom, tileX, tileY } = TerrainStreamer.parse(key);
    const level = TERRAIN_LEVELS.find(entry => entry.zoom === zoom);
    const bounds = tileBounds(tileX, tileY, zoom);
    const centre: LatLng = [
      (bounds.latNorth + bounds.latSouth) / 2,
      (bounds.lonWest + bounds.lonEast) / 2,
    ];
    const local = toLocalMetres(centre, this.origin);
    mesh.position.set(local.x, -(level?.drop ?? 0), local.z);
  }

  /** Load/unload tiles so every ring stays centred on `centre`. Safe to call often. */
  async update(centre: LatLng) {
    if (this.disposed) return;

    const wanted = new Set<string>();
    let latNorth = -90;
    let latSouth = 90;
    let lonWest = 180;
    let lonEast = -180;

    const levels = this.nearDetail ? TERRAIN_LEVELS : TERRAIN_LEVELS.slice(1);
    for (const level of levels) {
      const ring = level.zoom === TERRAIN_LEVELS[0].zoom ? this.nearRing : level.ring;
      const { x, y } = tileCoords(centre[0], centre[1], level.zoom);
      const centreX = Math.floor(x);
      const centreY = Math.floor(y);
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          wanted.add(`${level.zoom}/${centreX + dx}/${centreY + dy}`);
        }
      }
      const near = tileBounds(centreX - ring, centreY - ring, level.zoom);
      const far = tileBounds(centreX + ring, centreY + ring, level.zoom);
      latNorth = Math.max(latNorth, near.latNorth);
      latSouth = Math.min(latSouth, far.latSouth);
      lonWest = Math.min(lonWest, near.lonWest);
      lonEast = Math.max(lonEast, far.lonEast);
    }

    await this.elevation.prefetch(latNorth, latSouth, lonWest, lonEast);
    if (this.disposed) return;

    /**
     * Build the new ring BEFORE discarding the old one.
     *
     * Removing stale tiles first was the white screen. On any large jump - a
     * +50 km button, or 16x speed, where the train outruns the rebuild
     * threshold every fraction of a second - nothing in the new ring overlaps
     * the old, so every tile was deleted and the scene showed bare sky until
     * roughly fifty fetches completed. Keeping the old ground until its
     * replacement exists costs a little memory for a few seconds and removes
     * the flash entirely.
     */
    const missing = [...wanted].filter(key => !this.tiles.has(key) && !this.pending.has(key));

    /**
     * Fetch in the order the rider notices. Set order is level by level and
     * then row by row, so the top-left corner of the horizon ring could land
     * before the ground beside the train. Sharpest zoom first, and within a
     * zoom, closest to the centre first: the near field fills in immediately
     * and the horizon catches up behind it.
     */
    const { x: centreTileX, y: centreTileY } = tileCoords(centre[0], centre[1], TERRAIN_LEVELS[0].zoom);
    missing.sort((a, b) => {
      const left = TerrainStreamer.parse(a);
      const right = TerrainStreamer.parse(b);
      if (left.zoom !== right.zoom) return right.zoom - left.zoom;
      const scale = (zoom: number) => 2 ** (TERRAIN_LEVELS[0].zoom - zoom);
      const rank = (t: { zoom: number; tileX: number; tileY: number }) =>
        Math.hypot(
          (t.tileX + 0.5) * scale(t.zoom) - centreTileX,
          (t.tileY + 0.5) * scale(t.zoom) - centreTileY,
        );
      return rank(left) - rank(right);
    });
    await this.runLimited(missing, 10);
    if (this.disposed) return;

    for (const [key, mesh] of [...this.tiles]) {
      if (wanted.has(key)) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
      this.tiles.delete(key);
    }
  }

  /**
   * Cap concurrent tile builds. Firing all ~50 at once saturated the connection
   * and decoded every image in the same frame, which is most of the stutter.
   */
  private async runLimited(keys: string[], limit: number) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, keys.length) }, async () => {
      while (cursor < keys.length && !this.disposed) {
        const key = keys[cursor];
        cursor += 1;
        await this.build(key);
      }
    });
    await Promise.all(workers);
  }

  private async build(key: string) {
    this.pending.add(key);
    const { zoom, tileX, tileY } = TerrainStreamer.parse(key);
    try {
      const url = esriImageryUrl(tileX, tileY, zoom);
      const image = await loadImageSized(url);
      if (this.disposed) return;
      /**
       * Every ring but the last skips tiles that carry nothing - a placeholder
       * where Esri has no imagery, or an upsampled enlargement where it has no
       * imagery at this resolution. The coarser ring below shows through, which
       * is real ground rather than a flat grey square or a stretched smear.
       */
      const isCoarsest = zoom === TERRAIN_LEVELS[TERRAIN_LEVELS.length - 1].zoom;
      const bytes = tileByteSize(url);
      if (!isCoarsest && bytes >= 0 && bytes < BLANK_TILE_BYTES) return;
      if (!isCoarsest && zoom > TERRAIN_LEVELS[TERRAIN_LEVELS.length - 1].zoom + 3
          && bytes >= 0 && bytes < UPSAMPLED_TILE_BYTES) return;

      const level = TERRAIN_LEVELS.find(entry => entry.zoom === zoom);
      const bounds = tileBounds(tileX, tileY, zoom);
      const midLat = (bounds.latNorth + bounds.latSouth) / 2;
      const midLon = (bounds.lonWest + bounds.lonEast) / 2;
      const width = (bounds.lonEast - bounds.lonWest) * metresPerDegLon(midLat);
      const depth = (bounds.latNorth - bounds.latSouth) * M_PER_DEG_LAT;

      const segments = level?.segments ?? TILE_SEGMENTS;
      const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.anisotropy;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;

      const isNear = zoom === TERRAIN_LEVELS[0].zoom;
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.97,
          metalness: 0,
          polygonOffset: isNear,
          polygonOffsetFactor: isNear ? -2 : 0,
          polygonOffsetUnits: isNear ? -2 : 0,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = isNear ? 1 : 0;
      mesh.receiveShadow = isNear;
      this.place(mesh, key);

      // After the -90 deg X rotation, geometry +y is north and geometry z is world height.
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const lat = midLat + position.getY(index) / M_PER_DEG_LAT;
        const lon = midLon + position.getX(index) / metresPerDegLon(midLat);
        position.setZ(index, this.elevation.heightAt(lat, lon));
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();

      this.tiles.set(key, mesh);
      this.group.add(mesh);
    } catch {
      // A missing tile leaves a gap the fog covers; never fatal.
    } finally {
      this.pending.delete(key);
    }
  }

  dispose() {
    this.disposed = true;
    for (const [, mesh] of this.tiles) {
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.tiles.clear();
    this.elevation.dispose();
    this.imagery.dispose();
  }
}

/**
 * Vegetation changes completely along this route, and painting jacarandas the
 * whole way was wrong: they are a Pretoria street tree, spectacular for the
 * first few kilometres and absent from the Highveld grassland, the Karoo and
 * the Cape entirely. Zones are by route km, `untilKm` exclusive upper bound.
 */
/** Metres either side of the centreline that must stay clear of planting. */
export const TRACK_CLEARANCE_M = 17;

export type VegetationKind = "jacaranda" | "bushveld" | "grassland" | "karoo" | "vineyard" | "fynbos";

export interface VegetationZone {
  untilKm: number;
  kind: VegetationKind;
  /** Metres between plantings; larger is sparser. */
  spacing: number;
  /** Metres: canopy width and height. */
  size: [number, number];
  /** Metres from track centre. */
  offset: number;
}

export const VEGETATION_ZONES: VegetationZone[] = [
  { untilKm: 18, kind: "jacaranda", spacing: 100, size: [5.4, 6.8], offset: 19 },
  { untilKm: 75, kind: "bushveld", spacing: 175, size: [5.0, 5.6], offset: 24 },
  { untilKm: 620, kind: "grassland", spacing: 320, size: [2.6, 2.0], offset: 26 },
  { untilKm: 1130, kind: "karoo", spacing: 240, size: [2.2, 1.5], offset: 20 },
  { untilKm: 1360, kind: "vineyard", spacing: 150, size: [4.0, 4.4], offset: 22 },
  { untilKm: Number.POSITIVE_INFINITY, kind: "fynbos", spacing: 130, size: [2.8, 2.4], offset: 18 },
];

export const vegetationAtKm = (km: number): VegetationZone =>
  VEGETATION_ZONES.find(zone => km < zone.untilKm) ?? VEGETATION_ZONES[VEGETATION_ZONES.length - 1];

interface FoliagePalette {
  canopy: [number, number, number];
  spread: number;
  blobs: number;
  /** 0 = ball on a stick, 1 = low sprawling clump. */
  squat: number;
  trunk: boolean;
}

const FOLIAGE: Record<VegetationKind, FoliagePalette> = {
  jacaranda: { canopy: [150, 124, 196], spread: 104, blobs: 300, squat: 0.74, trunk: true },
  bushveld: { canopy: [96, 124, 74], spread: 100, blobs: 260, squat: 0.62, trunk: true },
  grassland: { canopy: [128, 132, 88], spread: 84, blobs: 150, squat: 1.15, trunk: false },
  karoo: { canopy: [138, 134, 102], spread: 80, blobs: 130, squat: 1.3, trunk: false },
  vineyard: { canopy: [86, 116, 66], spread: 96, blobs: 220, squat: 0.9, trunk: true },
  fynbos: { canopy: [112, 126, 96], spread: 86, blobs: 170, squat: 1.2, trunk: false },
};

const foliageCache = new Map<VegetationKind, THREE.Texture>();

/** Alpha-mapped foliage sprite for a vegetation kind, drawn once and reused. */
export function createFoliageTexture(kind: VegetationKind): THREE.Texture {
  const cached = foliageCache.get(kind);
  if (cached) return cached;
  const palette = FOLIAGE[kind];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 256, 256);
    if (palette.trunk) {
      context.strokeStyle = "#5a4636";
      context.lineCap = "round";
      context.lineWidth = 13;
      context.beginPath();
      context.moveTo(128, 256);
      context.lineTo(128, 150);
      context.stroke();
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(128, 172);
      context.lineTo(94, 128);
      context.moveTo(128, 168);
      context.lineTo(164, 126);
      context.stroke();
    }
    const centreY = palette.trunk ? 104 : 196;
    for (let blob = 0; blob < palette.blobs; blob += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() ** 0.55 * palette.spread;
      const cx = 128 + Math.cos(angle) * radius;
      const cy = centreY + Math.sin(angle) * radius * (palette.trunk ? 0.74 : 0.34) * palette.squat;
      const edge = radius / palette.spread;
      const shade = 0.82 + Math.random() * 0.3;
      const [r, g, b] = palette.canopy;
      context.fillStyle = `rgba(${Math.floor(r * shade)}, ${Math.floor(g * shade)}, ${Math.floor(b * shade)}, ${0.95 - edge * 0.35})`;
      context.beginPath();
      context.arc(cx, cy, 7 + Math.random() * 13, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  foliageCache.set(kind, texture);
  return texture;
}

export function createCanopyTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 256, 256);
    // Trunk and two limbs, so the tree reads as a tree edge-on rather than a blob.
    context.strokeStyle = "#5a4636";
    context.lineCap = "round";
    context.lineWidth = 13;
    context.beginPath();
    context.moveTo(128, 256);
    context.lineTo(128, 150);
    context.stroke();
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(128, 172);
    context.lineTo(94, 128);
    context.moveTo(128, 168);
    context.lineTo(164, 126);
    context.stroke();
    // Blossom cluster: jacarandas are dusty lavender, not electric purple.
    for (let blob = 0; blob < 300; blob += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() ** 0.55 * 104;
      const cx = 128 + Math.cos(angle) * radius;
      const cy = 104 + Math.sin(angle) * radius * 0.74;
      const edge = radius / 104;
      const tone = 150 + Math.floor(Math.random() * 46);
      const red = Math.floor(tone * 0.74);
      const green = Math.floor(tone * 0.62);
      const blue = Math.min(255, tone + 34);
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${0.95 - edge * 0.35})`;
      context.beginPath();
      context.arc(cx, cy, 7 + Math.random() * 13, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Rounds the resampled centreline into something a train could actually take.
 *
 * The OSM "connected candidate" is a graph shortest path, and through a station
 * throat it hops between parallel yard tracks - measured at up to 17 degrees of
 * heading change per 25 m sample, an 84 m radius. Real main line is 300 m plus.
 * Left raw, the carriages step sideways off each kink and the set reads as a
 * staircase of disconnected boxes. A few binomial passes (3-tap, endpoints
 * pinned) smooth the hops out while leaving genuine curves intact.
 */
export function smoothPolyline(points: THREE.Vector3[], iterations = 8): THREE.Vector3[] {
  if (points.length < 3) return points;
  let current = points.map(point => point.clone());
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = current.map(point => point.clone());
    for (let index = 1; index < current.length - 1; index += 1) {
      next[index]
        .copy(current[index - 1])
        .add(current[index + 1])
        .addScaledVector(current[index], 2)
        .multiplyScalar(0.25);
    }
    current = next;
  }
  return current;
}

/**
 * A low ballast ribbon laid flat along the track. The previous version used a
 * 2.4 m-radius TubeGeometry, which at eye height filled half the screen and read
 * as a brown dirt road running into the distance.
 */
/**
 * The ballast is what you actually see of the track from any distance.
 *
 * The rails themselves are 26 cm of steel - sub-pixel from two hundred metres
 * back - so the line only reads because of the pale stone bed under it. At 3.8 m
 * wide and near-black it disappeared entirely against the dark green of the
 * Cape mountains, and the track went with it. A real formation is five or six
 * metres across and the stone is light grey; at that width and colour the line
 * is legible over any ground.
 */
export function createBallastRibbon(points: THREE.Vector3[], halfWidth = 2.8, drop = 0.42) {
  const vertices = new Float32Array(points.length * 6);
  const uvs = new Float32Array(points.length * 4);
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  points.forEach((point, index) => {
    const next = points[Math.min(index + 1, points.length - 1)];
    const previous = points[Math.max(index - 1, 0)];
    tangent.copy(next).sub(previous).setY(0).normalize();
    side.set(-tangent.z, 0, tangent.x).multiplyScalar(halfWidth);
    const base = index * 6;
    vertices[base] = point.x + side.x;
    vertices[base + 1] = point.y - drop;
    vertices[base + 2] = point.z + side.z;
    vertices[base + 3] = point.x - side.x;
    vertices[base + 4] = point.y - drop;
    vertices[base + 5] = point.z - side.z;
    uvs[index * 4] = 0;
    uvs[index * 4 + 1] = index;
    uvs[index * 4 + 2] = 1;
    uvs[index * 4 + 3] = index;
    if (index < points.length - 1) {
      const v = index * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x9d9589, roughness: 1, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Crossed alpha-mapped planes rather than purple dodecahedrons. Sized in metres -
 * the old trees were 1.45 world units across, which at the old scale was a
 * canopy 1.1 km wide, one of the things that made the world read as a toy.
 */
export function createTreeBelt(
  samples: THREE.Vector3[],
  material: THREE.MeshStandardMaterial,
  zone: VegetationZone,
  /**
   * One stable number per sample, used for the jitter. Pass the sample's
   * position along the ROUTE, not its index in this array: the index changes
   * every time the window is rebuilt, and a tree that moves whenever the
   * corridor is rebuilt is the thing that made the ride look like it was
   * glitching.
   */
  seeds?: number[],
): THREE.InstancedMesh | null {
  const perSide = 2;
  const count = samples.length * perSide * 2;
  if (!count) return null;
  const trees = new THREE.InstancedMesh(new THREE.PlaneGeometry(zone.size[0], zone.size[1]), material, count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  let index = 0;
  samples.forEach((point, sampleIndex) => {
    for (let slot = 0; slot < perSide; slot += 1) {
      const side = slot % 2 ? -1 : 1;
      const seed = seeds?.[sampleIndex] ?? sampleIndex;
      const jitter = (((seed * 37 + slot * 11) % 23) + 23) % 23 - 11;
      // Never inside the swept corridor - rails, ballast, masts and the train
      // itself all live within about 8 m of the centreline.
      const offset = Math.max(TRACK_CLEARANCE_M, zone.offset + jitter * 0.9);
      position.set(
        point.x + side * offset,
        point.y + zone.size[1] / 2 - 0.4,
        point.z + jitter * 1.5,
      );
      for (const turn of [0, Math.PI / 2]) {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
        matrix.compose(position, quaternion, scale);
        trees.setMatrixAt(index, matrix);
        index += 1;
      }
    }
  });
  trees.count = index;
  trees.instanceMatrix.needsUpdate = true;
  return trees;
}

export interface BuildingFootprint {
  ring: LatLng[];
  height: number;
  /** Metres above ground the structure starts, for parts on a podium. */
  base?: number;
}

/**
 * Building footprints from OpenFreeMap vector tiles.
 *
 * Replaces the Overpass fetch, which is blocked at the egress proxy on every
 * network this project can reach. OpenFreeMap needs no key and no billing, and
 * its `building` layer already carries render_height / render_min_height, so
 * the heights come from OSM rather than being guessed.
 */
export async function fetchBuildingsFromTiles(
  centre: LatLng,
  radiusM: number,
  signal?: AbortSignal,
): Promise<BuildingFootprint[]> {
  const zoom = OPENFREEMAP_MAX_ZOOM;
  const latSpan = radiusM / M_PER_DEG_LAT;
  const lonSpan = radiusM / metresPerDegLon(centre[0]);
  const topLeft = tileCoords(centre[0] + latSpan, centre[1] - lonSpan, zoom);
  const bottomRight = tileCoords(centre[0] - latSpan, centre[1] + lonSpan, zoom);

  const jobs: Promise<BuildingFootprint[]>[] = [];
  for (let tx = Math.floor(topLeft.x); tx <= Math.floor(bottomRight.x); tx += 1) {
    for (let ty = Math.floor(topLeft.y); ty <= Math.floor(bottomRight.y); ty += 1) {
      jobs.push(
        fetchVectorTile(zoom, tx, ty)
          .then(layers => {
            if (signal?.aborted) return [];
            const layer = layers.get("building");
            if (!layer) return [];
            const found: BuildingFootprint[] = [];
            for (const feature of layer.features) {
              const outer = feature.rings[0];
              if (!outer || outer.length < 4) continue;
              const ring: LatLng[] = outer.map(point => {
                const [lon, lat] = tileToLonLat(point, layer.extent, zoom, tx, ty);
                return [lat, lon] as LatLng;
              });
              const centroidLat = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
              const centroidLon = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
              const northing = (centroidLat - centre[0]) * M_PER_DEG_LAT;
              const easting = (centroidLon - centre[1]) * metresPerDegLon(centre[0]);
              if (Math.hypot(northing, easting) > radiusM) continue;

              const rendered = Number(feature.properties.render_height ?? 0);
              const base = Number(feature.properties.render_min_height ?? 0);
              found.push({
                ring,
                // OSM leaves most buildings untagged and OpenMapTiles then emits
                // render_height 1, which would carpet the scene in ankle-high
                // slabs. Fall back to a storey count implied by footprint size.
                // OSM occasionally carries a height in the wrong unit or from a
                // mast on the roof. Anything over about forty storeys on a
                // footprint this size is a data error, not a tower.
                height: Math.min(rendered > 2.5 ? rendered : estimateHeight(ring), 150),
                base: Number.isFinite(base) ? base : 0,
              });
            }
            return found;
          })
          .catch(() => []),
      );
    }
  }
  const batches = await Promise.all(jobs);
  return batches.flat().slice(0, 1200);
}

/** Rough storey count from footprint area: sheds are low, towers are not. */
function estimateHeight(ring: LatLng[]): number {
  let area = 0;
  const lonScale = metresPerDegLon(ring[0][0]);
  for (let index = 0; index < ring.length - 1; index += 1) {
    const x1 = ring[index][1] * lonScale;
    const y1 = ring[index][0] * M_PER_DEG_LAT;
    const x2 = ring[index + 1][1] * lonScale;
    const y2 = ring[index + 1][0] * M_PER_DEG_LAT;
    area += x1 * y2 - x2 * y1;
  }
  const footprint = Math.abs(area) / 2;
  if (footprint < 60) return 3.2;
  if (footprint < 250) return 5.5;
  if (footprint < 1200) return 7.5;
  return 10;
}

/**
 * Extrudes footprints in the local metric frame, tinting each roof with the
 * satellite pixel above it so the rooftops match the photo underneath instead of
 * every building being the same beige.
 */
export function createBuildings(
  footprints: BuildingFootprint[],
  origin: LatLng,
  elevation: ElevationSampler,
  imagery: ImagerySampler,
): THREE.Group {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  for (const footprint of footprints) {
    const shape = new THREE.Shape();
    let centroidLat = 0;
    let centroidLon = 0;
    footprint.ring.forEach((point, index) => {
      const local = toLocalMetres(point, origin);
      // The shape is extruded along +z then laid flat, so shape-y maps to -z.
      if (index === 0) shape.moveTo(local.x, -local.z);
      else shape.lineTo(local.x, -local.z);
      centroidLat += point[0];
      centroidLon += point[1];
    });
    shape.closePath();
    centroidLat /= footprint.ring.length;
    centroidLon /= footprint.ring.length;

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: footprint.height,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, elevation.heightAt(centroidLat, centroidLon) + (footprint.base ?? 0), 0);

    /**
     * Roof colour was sampled from the satellite pixel directly above each
     * building - which turned out to be camouflage. Painting a roof with the
     * exact photo it sits on makes the extrusion invisible from any overhead
     * angle, which is why the buildings read as flat even though they are real
     * 3D geometry. Sample it, then push it well away from the ground it was
     * taken from: lighter, desaturated, so the massing separates from the
     * terrain while still belonging to the same scene.
     */
    const sampled = imagery.colourAt(centroidLat, centroidLon);
    const base = sampled
      ? new THREE.Color(sampled[0], sampled[1], sampled[2])
      : new THREE.Color(0x9a9186);
    const roofColour = base.clone().lerp(new THREE.Color(0xd8d2c8), 0.65);
    const wallColour = base.clone().lerp(new THREE.Color(0xfaf7f2), 0.78).multiplyScalar(0.94);

    /**
     * One mesh per building was up to twelve hundred draw calls in a town, each
     * with its own pair of materials - and a town is exactly where the ride was
     * hitching. The colours that used to be two materials become a vertex colour
     * attribute instead, so every building in range merges into a single mesh
     * that still has per-building roof and wall shading.
     *
     * ExtrudeGeometry emits group 0 for the caps and group 1 for the walls.
     */
    const count = geometry.attributes.position.count;
    const colours = new Float32Array(count * 3);
    for (const part of geometry.groups) {
      const colour = part.materialIndex === 0 ? roofColour : wallColour;
      const end = part.start + part.count;
      for (let index = part.start; index < end && index < count; index += 1) {
        colours[index * 3] = colour.r;
        colours[index * 3 + 1] = colour.g;
        colours[index * 3 + 2] = colour.b;
      }
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.clearGroups();
    geometry.deleteAttribute("uv");
    parts.push(geometry);
  }

  if (!parts.length) return group;
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) return group;

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

// ── Roads ───────────────────────────────────────────────────────────────────

export interface RoadLine {
  path: LatLng[];
  halfWidth: number;
}

/**
 * Metres either side of a road centreline, by OpenMapTiles class. A town with
 * no roads in it reads as a field of loose boxes; the street grid is what makes
 * the massing look like a place.
 */
const ROAD_HALF_WIDTH: Record<string, number> = {
  motorway: 7.5,
  trunk: 6.5,
  primary: 5.5,
  secondary: 4.5,
  tertiary: 3.8,
  minor: 3.0,
  service: 2.2,
  track: 2.0,
};

/** Road centrelines from the same OpenFreeMap tiles the buildings come from. */
export async function fetchRoadsFromTiles(
  centre: LatLng,
  radiusM: number,
  signal?: AbortSignal,
): Promise<RoadLine[]> {
  const zoom = OPENFREEMAP_MAX_ZOOM;
  const latSpan = radiusM / M_PER_DEG_LAT;
  const lonSpan = radiusM / metresPerDegLon(centre[0]);
  const topLeft = tileCoords(centre[0] + latSpan, centre[1] - lonSpan, zoom);
  const bottomRight = tileCoords(centre[0] - latSpan, centre[1] + lonSpan, zoom);

  const jobs: Promise<RoadLine[]>[] = [];
  for (let tx = Math.floor(topLeft.x); tx <= Math.floor(bottomRight.x); tx += 1) {
    for (let ty = Math.floor(topLeft.y); ty <= Math.floor(bottomRight.y); ty += 1) {
      jobs.push(
        fetchVectorTile(zoom, tx, ty)
          .then(layers => {
            if (signal?.aborted) return [];
            const layer = layers.get("transportation");
            if (!layer) return [];
            const found: RoadLine[] = [];
            for (const feature of layer.features) {
              if (feature.geometryType !== 2) continue;
              const klass = String(feature.properties.class ?? "");
              const halfWidth = ROAD_HALF_WIDTH[klass];
              // Rail is drawn by the corridor builder; ferries and paths are noise.
              if (!halfWidth) continue;
              // A road on a bridge or in a tunnel is not at ground level, and
              // draping it on the DEM puts it through whatever it crosses.
              if (feature.properties.brunnel) continue;
              for (const ring of feature.rings) {
                if (ring.length < 2) continue;
                const path: LatLng[] = ring.map(point => {
                  const [lon, lat] = tileToLonLat(point, layer.extent, zoom, tx, ty);
                  return [lat, lon] as LatLng;
                });
                const northing = (path[0][0] - centre[0]) * M_PER_DEG_LAT;
                const easting = (path[0][1] - centre[1]) * metresPerDegLon(centre[0]);
                if (Math.hypot(northing, easting) > radiusM * 1.6) continue;
                found.push({ path, halfWidth });
              }
            }
            return found;
          })
          .catch(() => []),
      );
    }
  }
  const batches = await Promise.all(jobs);
  return batches.flat().slice(0, 900);
}

/**
 * Roads as flat ribbons draped on the elevation model, merged into one mesh.
 *
 * They sit a little above the ground and use a polygon offset, because they are
 * co-planar with the satellite imagery by construction - the photo already shows
 * the road, and the geometry has to win that depth fight cleanly rather than
 * shimmer against it.
 */
export function createRoads(
  roads: RoadLine[],
  origin: LatLng,
  elevation: ElevationSampler,
): THREE.Group {
  const group = new THREE.Group();
  const positions: number[] = [];
  const normals: number[] = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (const road of roads) {
    const points = road.path.map(point => {
      const local = toLocalMetres(point, origin);
      return new THREE.Vector3(local.x, elevation.heightAt(point[0], point[1]) + 0.1, local.z);
    });
    if (points.length < 2) continue;

    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    points.forEach((point, index) => {
      const next = points[Math.min(index + 1, points.length - 1)];
      const previous = points[Math.max(index - 1, 0)];
      tangent.copy(next).sub(previous).setY(0);
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
      tangent.normalize();
      side.set(-tangent.z, 0, tangent.x).multiplyScalar(road.halfWidth);
      left.push(point.clone().add(side));
      right.push(point.clone().sub(side));
    });

    for (let index = 0; index < points.length - 1; index += 1) {
      const a = left[index];
      const b = right[index];
      const c = left[index + 1];
      const d = right[index + 1];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      positions.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
      for (let vertex = 0; vertex < 6; vertex += 1) normals.push(0, 1, 0);
    }
  }

  if (!positions.length) return group;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x3c3d40,
      roughness: 0.96,
      metalness: 0.02,
      // A gentle offset. At -4 the ribbon won the depth test against the rails
      // themselves at grazing angles, which made the track disappear under it.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

/**
 * Overhead line equipment: steel masts either side on a regular span, a cross
 * arm over the track, and the contact wire itself. Without these the corridor
 * reads as a dirt path with two shiny stripes rather than an electrified main
 * line.
 */
export function createCatenary(
  track: THREE.Vector3[],
  spanSamples: number,
  /** Shifts the mast pattern so it lands on the same absolute distances every rebuild. */
  offset = 0,
): THREE.Group {
  const group = new THREE.Group();
  const anchors = track.filter((_, index) => (index + offset) % spanSamples === 0);
  if (anchors.length < 2) return group;

  const steel = new THREE.MeshStandardMaterial({ color: 0x545b61, metalness: 0.82, roughness: 0.36 });
  const masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.2, 8.2, 6), steel, anchors.length * 2);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), steel, anchors.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const firstAnchor = track.findIndex((_, index) => (index + offset) % spanSamples === 0);
  anchors.forEach((point, index) => {
    const source = firstAnchor + index * spanSamples;
    const next = track[Math.min(source + 1, track.length - 1)];
    const previous = track[Math.max(source - 1, 0)];
    tangent.copy(next).sub(previous).setY(0).normalize();
    side.set(-tangent.z, 0, tangent.x);

    for (const hand of [-1, 1]) {
      position.copy(point).addScaledVector(side, hand * 3.5);
      position.y += 4.1;
      matrix.compose(position, new THREE.Quaternion(), unit);
      masts.setMatrixAt(index * 2 + (hand === 1 ? 1 : 0), matrix);
    }

    position.copy(point).setY(point.y + 7.4);
    quaternion.setFromAxisAngle(up, Math.atan2(tangent.x, tangent.z));
    matrix.compose(position, quaternion, unit);
    arms.setMatrixAt(index, matrix);
  });
  masts.instanceMatrix.needsUpdate = true;
  arms.instanceMatrix.needsUpdate = true;
  masts.castShadow = true;
  group.add(masts, arms);

  // Contact wire, sagging slightly between supports.
  const wirePoints = track.map((point, index) => {
    const phase = ((index + offset) % spanSamples) / spanSamples;
    const sag = Math.sin(phase * Math.PI) * 0.18;
    return point.clone().setY(point.y + 6.1 - sag);
  });
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePoints), wirePoints.length, 0.035, 4, false),
    new THREE.MeshStandardMaterial({ color: 0x6d5b44, metalness: 0.7, roughness: 0.5 }),
  );
  group.add(wire);
  return group;
}

/** A trackside sign whose text can be rewritten each frame as the distance closes. */
export function createBillboard(title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 200;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, sizeAttenuation: false }),
  );
  sprite.scale.set(0.27, 0.084, 1);

  let lastCaption = "";
  const draw = (caption: string, note: string) => {
    if (!context || caption === lastCaption) return;
    lastCaption = caption;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(8, 28, 56, 0.94)";
    context.beginPath();
    context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 18);
    context.fill();
    context.strokeStyle = "rgba(244, 189, 79, 0.95)";
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = "#f4bd4f";
    context.font = "700 32px sans-serif";
    context.fillText(`> ${title.toUpperCase()}`, 34, 70);
    context.fillStyle = "#fffaf0";
    context.font = "600 24px sans-serif";
    context.fillText(caption, 34, 118);
    context.fillStyle = "rgba(255, 250, 240, 0.62)";
    context.font = "500 18px sans-serif";
    context.fillText(note, 34, 158);
    texture.needsUpdate = true;
  };

  return { sprite, draw };
}

/**
 * A reusable place-name label, set quietly in the landscape.
 *
 * There are over three hundred places on this route and only ever a couple in
 * view, so these are a pool: a marker is handed whichever place is nearest and
 * redraws its canvas only when that changes. Building one sprite per place
 * would mean three hundred canvases and three hundred textures at mount.
 *
 * The landmark billboards are deliberately loud - a bordered card with a
 * distance readout, for the handful of things worth interrupting the view for.
 * There are a lot more towns than landmarks, and giving each of them the same
 * treatment would paper the window shut. This is the opposite: letterspaced
 * caps and a hairline rule on no panel at all, so a name reads against the
 * ground the way a map label does and then gets out of the way.
 */
export function createPlaceMarker() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      sizeAttenuation: false,
    }),
  );
  sprite.scale.set(0.2, 0.05, 1);
  sprite.renderOrder = 6;

  let last = "";
  const draw = (name: string, station: boolean) => {
    const key = `${name}|${station}`;
    if (!context || key === last) return;
    last = key;
    const label = name.toUpperCase().split("").join("\u2009");
    context.clearRect(0, 0, canvas.width, canvas.height);

    // A soft shadow rather than a plate: legible over bright ground and dark
    // ground alike, without putting a rectangle in front of the view.
    context.textAlign = "center";
    context.shadowColor = "rgba(4, 12, 24, 0.85)";
    context.shadowBlur = 12;
    context.fillStyle = station ? "#f4bd4f" : "rgba(255, 252, 246, 0.93)";
    context.font = `${station ? 700 : 600} ${label.length > 34 ? 24 : 32}px sans-serif`;
    context.fillText(label, canvas.width / 2, 62);

    context.shadowBlur = 8;
    context.strokeStyle = station ? "rgba(244, 189, 79, 0.75)" : "rgba(255, 252, 246, 0.5)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(canvas.width / 2 - 74, 84);
    context.lineTo(canvas.width / 2 + 74, 84);
    context.stroke();
    texture.needsUpdate = true;
  };

  return { sprite, draw };
}

/** Convenience: lat/lon of a point given in the local metric frame. */
export const localToLatLng = (point: THREE.Vector3, origin: LatLng) =>
  fromLocalMetres(point.x, point.z, origin);

export { tileSpanMetres };

/**
 * A stylised modern commuter EMU. Livery is selectable (Gautrain by default);
 * Johannesburg corridor sets: rounded cab, dark glazing band, blue skirt, four
 * cars that articulate independently so the set bends through curves.
 *
 * Built procedurally on purpose. `/assets/train.glb` is still loaded first and
 * wins when present - that path was failing silently before, because the file
 * has never been in the repository.
 */
export const CAR_LENGTH_M = 23.5;
/**
 * Slightly LESS than the body length, so the ends overlap by twenty centimetres
 * at the centreline. On a curve the outside of a coupling opens up - rigid
 * bodies on a bend always do - and a 20 cm gap on the straight became a
 * half-metre split through a bend. Overlapping closes it without the ends ever
 * being coplanar, so nothing z-fights.
 */
export const CAR_PITCH_M = 23.3;

const GLASS = 0x1b2733;
const UNDERFRAME = 0x2b3138;

/** Liveries, so the set can match whichever operator the route belongs to. */
export interface Livery {
  body: number;
  skirt: number;
  stripe: number;
  accent: number;
}

export const LIVERIES = {
  /** Gautrain Electrostar: silver-grey bodyshell, gold band, deep blue skirt. */
  gautrain: { body: 0xc9ced4, skirt: 0x16325c, stripe: 0xc8a24a, accent: 0xc8a24a },
  /** PRASA Metrorail X'Trapolis Mega: white bodyshell, blue skirt and cab. */
  metrorail: { body: 0xeef2f6, skirt: 0x14639f, stripe: 0x3ea6dd, accent: 0x3ea6dd },
} as const satisfies Record<string, Livery>;

export type LiveryName = keyof typeof LIVERIES;

function createCar(isCab: boolean, livery: Livery): THREE.Group {
  const car = new THREE.Group();
  // The bodyshell is modelled along +X, but three.js yaw from
  // Math.atan2(tangent.x, tangent.z) aligns local +Z with the direction of
  // travel. Without this the whole set rides broadside to the rails - 3.8 m of
  // carriage every 24 m, which looked exactly like a train torn into pieces.
  const body = new THREE.Group();
  body.rotation.y = -Math.PI / 2;
  car.add(body);
  const halfLength = CAR_LENGTH_M / 2;

  const shell = new THREE.Mesh(
    new THREE.CapsuleGeometry(1.5, CAR_LENGTH_M - 3, 6, 20),
    new THREE.MeshStandardMaterial({ color: livery.body, roughness: 0.34, metalness: 0.3 }),
  );
  shell.rotation.z = Math.PI / 2;
  shell.scale.set(1, 1, 0.95);
  shell.position.y = 2.5;
  shell.castShadow = true;
  body.add(shell);

  const glazing = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_LENGTH_M - 2.2, 1.15, 2.98),
    new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.55 }),
  );
  glazing.position.y = 3.05;
  body.add(glazing);

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_LENGTH_M - 1.4, 1.05, 2.92),
    new THREE.MeshStandardMaterial({ color: livery.skirt, roughness: 0.42, metalness: 0.18 }),
  );
  skirt.position.y = 1.42;
  skirt.castShadow = true;
  body.add(skirt);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_LENGTH_M - 1.6, 0.34, 2.96),
    new THREE.MeshStandardMaterial({ color: livery.stripe, roughness: 0.36, metalness: 0.45 }),
  );
  stripe.position.y = 2.12;
  body.add(stripe);

  const bogieMaterial = new THREE.MeshStandardMaterial({ color: UNDERFRAME, roughness: 0.72, metalness: 0.45 });
  for (const offset of [-halfLength + 4.2, halfLength - 4.2]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.82, 2.5), bogieMaterial);
    bogie.position.set(offset, 0.72, 0);
    bogie.castShadow = true;
    body.add(bogie);
    for (const side of [-1.07, 1.07]) {
      for (const axle of [-1.15, 1.15]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 14), bogieMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(offset + axle, 0.44, side);
        body.add(wheel);
      }
    }
  }

  // Gangway bellows so the set reads as one train rather than four floating cars.
  const gangway = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.1, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.85, metalness: 0.1 }),
  );
  gangway.position.set(-halfLength - 0.25, 2.6, 0);
  body.add(gangway);

  if (isCab) {
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(1.46, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: livery.accent, roughness: 0.32, metalness: 0.4 }),
    );
    nose.rotation.z = -Math.PI / 2;
    nose.scale.set(1.5, 1, 0.95);
    nose.position.set(halfLength - 1.3, 2.5, 0);
    nose.castShadow = true;
    body.add(nose);

    const windscreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.2, 2.3),
      new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.1, metalness: 0.6 }),
    );
    windscreen.position.set(halfLength - 0.5, 3.2, 0);
    windscreen.rotation.z = -0.22;
    body.add(windscreen);

    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffe9ae, emissiveIntensity: 1.4 });
    for (const side of [-0.95, 0.95]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampMaterial);
      lamp.position.set(halfLength + 0.05, 1.75, side);
      body.add(lamp);
    }
  } else {
    const pantograph = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.09, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x8b9095, metalness: 0.8, roughness: 0.3 }),
    );
    pantograph.position.set(0, 4.55, 0);
    pantograph.rotation.z = 0.16;
    body.add(pantograph);
  }

  return car;
}

export function createCommuterTrain(carCount = 4, livery: LiveryName = "gautrain") {
  const group = new THREE.Group();
  const cars: THREE.Group[] = [];
  const palette = LIVERIES[livery];
  for (let index = 0; index < carCount; index += 1) {
    const car = createCar(index === 0, palette);
    cars.push(car);
    group.add(car);
  }
  return { group, cars };
}

// ── Bridges and tunnels ─────────────────────────────────────────────────────

export type BrunnelKind = "bridge" | "tunnel" | null;

export interface BrunnelRun {
  kind: Exclude<BrunnelKind, null>;
  /** Inclusive index range into the track sample array. */
  from: number;
  to: number;
}

/** Group consecutive samples sharing a brunnel tag into runs. */
export function brunnelRuns(brunnel: BrunnelKind[], minSamples = 2): BrunnelRun[] {
  const runs: BrunnelRun[] = [];
  let start = -1;
  for (let index = 0; index <= brunnel.length; index += 1) {
    const kind = brunnel[index] ?? null;
    const previous = index > 0 ? brunnel[index - 1] : null;
    if (kind !== previous) {
      if (previous && start >= 0 && index - start >= minSamples) {
        runs.push({ kind: previous, from: start, to: index - 1 });
      }
      start = kind ? index : -1;
    }
  }
  return runs;
}

/**
 * Viaduct decks with piers dropped to the ground beneath.
 *
 * Bridges are the moment a rail journey stops looking like a line on a texture:
 * the ground falls away and the track keeps going. The brunnel tags come
 * straight from OSM, so these sit where real structures are rather than being
 * scattered for effect.
 */
export function createBridgeDecks(
  track: THREE.Vector3[],
  runs: BrunnelRun[],
  groundAt: (point: THREE.Vector3) => number,
): THREE.Group {
  const group = new THREE.Group();
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x9d9992, roughness: 0.82, metalness: 0.05 });
  const pierMaterial = new THREE.MeshStandardMaterial({ color: 0x8b8880, roughness: 0.88, metalness: 0.04 });
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (const run of runs) {
    if (run.kind !== "bridge") continue;
    const points = track.slice(run.from, run.to + 1);
    if (points.length < 2) continue;

    // Deck: a flat slab a little wider than the ballast, sitting just under rail.
    const vertices: number[] = [];
    const indices: number[] = [];
    points.forEach((point, index) => {
      const next = points[Math.min(index + 1, points.length - 1)];
      const previous = points[Math.max(index - 1, 0)];
      tangent.copy(next).sub(previous).setY(0).normalize();
      side.set(-tangent.z, 0, tangent.x).multiplyScalar(3.1);
      vertices.push(point.x + side.x, point.y - 0.55, point.z + side.z);
      vertices.push(point.x - side.x, point.y - 0.55, point.z - side.z);
      if (index < points.length - 1) {
        const v = index * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    });
    const deck = new THREE.BufferGeometry();
    deck.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    deck.setIndex(indices);
    deck.computeVertexNormals();
    const deckMesh = new THREE.Mesh(deck, deckMaterial);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    // Piers every few samples, only where there is a real drop to the ground.
    const pierEvery = Math.max(1, Math.round(points.length / 6));
    for (let index = 0; index < points.length; index += pierEvery) {
      const point = points[index];
      const ground = groundAt(point);
      const height = point.y - 0.55 - ground;
      if (height < 2.5) continue;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, height, 2.2), pierMaterial);
      pier.position.set(point.x, ground + height / 2, point.z);
      pier.castShadow = true;
      group.add(pier);
    }
  }
  return group;
}

/**
 * Tunnel portals, built like the real ones.
 *
 * The old version was a three-metre torus and a dark disc - a hoop beside the
 * track that read as nothing at all. A Cape main-line bore is about seven
 * metres wide and six high, set in a masonry headwall that is cut into the
 * hillside, with wing walls running back either side to hold the cutting open.
 * That is what this builds, at the right size, so a tunnel mouth looks like a
 * tunnel mouth from the cab and from two hundred metres back.
 *
 * The line itself stays on the surface through the bore - see the corridor
 * builder for why - so these mark where the real tunnel begins and ends rather
 * than swallowing the train.
 */
export function createTunnelPortals(track: THREE.Vector3[], runs: BrunnelRun[]): THREE.Group {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.95, metalness: 0.02 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x877f74, roughness: 0.88, metalness: 0.03 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: 1, metalness: 0 });
  const tangent = new THREE.Vector3();

  const BORE_HALF_WIDTH = 3.6;
  const BORE_HEIGHT = 6.2;
  const WALL_THICKNESS = 1.6;

  for (const run of runs) {
    if (run.kind !== "tunnel") continue;
    for (const end of [run.from, run.to]) {
      const point = track[end];
      if (!point) continue;
      const next = track[Math.min(end + 1, track.length - 1)];
      const previous = track[Math.max(end - 1, 0)];
      tangent.copy(next).sub(previous).setY(0);
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
      tangent.normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      // The headwall faces the approach, so the far end is turned about.
      const facing = end === run.to ? yaw + Math.PI : yaw;

      const portal = new THREE.Group();
      portal.position.set(point.x, point.y, point.z);
      portal.rotation.set(0, facing, 0);

      /**
       * The headwall is built as four pieces around the opening rather than one
       * slab with a hole in it - two jambs, a lintel above, and the arch - which
       * keeps it to plain boxes and a half-cylinder and avoids CSG entirely.
       */
      const jambWidth = 2.4;
      for (const hand of [-1, 1]) {
        const jamb = new THREE.Mesh(
          new THREE.BoxGeometry(jambWidth, BORE_HEIGHT, WALL_THICKNESS),
          stone,
        );
        jamb.position.set(hand * (BORE_HALF_WIDTH + jambWidth / 2), BORE_HEIGHT / 2, 0);
        jamb.castShadow = true;
        jamb.receiveShadow = true;
        portal.add(jamb);
      }

      const lintelHeight = 3.4;
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry((BORE_HALF_WIDTH + jambWidth) * 2, lintelHeight, WALL_THICKNESS),
        stone,
      );
      lintel.position.set(0, BORE_HEIGHT + BORE_HALF_WIDTH * 0.5 + lintelHeight / 2, 0);
      lintel.castShadow = true;
      portal.add(lintel);

      // The arch over the opening: a half ring standing in the headwall plane.
      const arch = new THREE.Mesh(
        new THREE.RingGeometry(BORE_HALF_WIDTH, BORE_HALF_WIDTH + jambWidth, 24, 1, 0, Math.PI),
        rim,
      );
      arch.position.set(0, BORE_HEIGHT, 0);
      arch.castShadow = true;
      portal.add(arch);

      // Voussoir band picking out the arch, the way a stone portal is built.
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(BORE_HALF_WIDTH + 0.35, 0.45, 8, 20, Math.PI),
        rim,
      );
      band.position.set(0, BORE_HEIGHT, WALL_THICKNESS / 2);
      portal.add(band);

      /**
       * The bore itself: a short length of dark tube running back into the
       * hillside, so the opening reads as a hole with depth rather than a
       * painted disc. Inside-out, because we only ever see it from outside.
       */
      const bore = new THREE.Mesh(
        new THREE.CylinderGeometry(BORE_HALF_WIDTH, BORE_HALF_WIDTH, 26, 16, 1, true),
        dark,
      );
      bore.material.side = THREE.BackSide;
      bore.rotation.set(Math.PI / 2, 0, 0);
      bore.position.set(0, BORE_HEIGHT * 0.62, -13 - WALL_THICKNESS);
      portal.add(bore);

      const back = new THREE.Mesh(new THREE.CircleGeometry(BORE_HALF_WIDTH, 16), dark);
      back.position.set(0, BORE_HEIGHT * 0.62, -26);
      portal.add(back);

      // Wing walls, splayed back into the cutting either side of the headwall.
      for (const hand of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9, BORE_HEIGHT * 0.85, 14), stone);
        wing.position.set(
          hand * (BORE_HALF_WIDTH + jambWidth + 0.4),
          BORE_HEIGHT * 0.42,
          7,
        );
        wing.rotation.y = hand * 0.22;
        wing.castShadow = true;
        portal.add(wing);
      }

      group.add(portal);
    }
  }
  return group;
}

/** Is a given track sample inside a tunnel run? Used to darken the ride. */
export function insideTunnel(runs: BrunnelRun[], sampleIndex: number): boolean {
  return runs.some(run => run.kind === "tunnel" && sampleIndex >= run.from && sampleIndex <= run.to);
}
