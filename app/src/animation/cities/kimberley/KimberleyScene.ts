// Kimberley, built from the same real data as Pretoria.
//
// Antigravity's first pass stood the chapter on a flat 2.8 km plane with
// authored boxes. This keeps its chapter-facing API (setEraBlend, the tram, the
// Big Hole, the diamond) but grounds it: Mapzen terrain, the real OSM rail
// alignment through the station, the three real platforms and yard tracks, OSM
// buildings and streets, the heritage tramway from Market Square past the Big
// Hole, and the preserved Class 25NC on the forecourt.
//
// Two frames are in play:
//   - local: the flat projection every shared module uses. +x east, +z south,
//     origin on Kimberley station (OSM node 247327890), y above the terrain
//     datum. Terrain needs this frame: its grid is axis-aligned in lon/lat.
//   - world: `local` rotated and shifted so the train's stopping point is the
//     origin, rail level is y = 0 and the train runs along -x. The chapter's
//     camera choreography is authored in this frame, so +x is back up the line
//     towards Johannesburg and -z is the town side, where the platforms, the
//     heritage town and the Big Hole all are.
//
// `trainState.x` in the chapter is metres before the stopping point, so the
// route position is STOP_S - x.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { readRideRoute, type Coordinate } from '../../../ride-model';
import { createTrainModel, sampleTrainCoordinate } from '../../../train-model';
import { Terrain, type TerrainData } from '../../Terrain';
import { createBuildings, type BuildingData } from '../../Buildings';
import { createRoads, type RoadData } from '../../Roads';
import { createStreetLights } from '../../StreetLights';
import { createCatenary } from '../../Catenary';
import { createLineside } from '../../Lineside';
import { createVegetation } from '../../Vegetation';
import { createBirds } from '../../Birds';
import { TrainWheels, type VehiclePose } from '../../TrainWheels';
import type { createConsist } from '../../TrainConsist';

export const kimberleyMetadata = {
  name: 'Kimberley · Rails to Diamonds',
  anchor: { lat: -28.7353474, lon: 24.7698702 },
  notice: 'Kimberley Station, Heritage Time Machine & Big Hole diamond mine',
  source: 'OSM station node 247327890, platforms, yard and tramway (ODbL); Mapzen terrarium terrain; McGregor Museum historical records',
};

export interface HistoricalDepthMarker {
  year: number;
  depth01: number;
  y: number;
  label: string;
}

export const HISTORICAL_DEPTHS: HistoricalDepthMarker[] = [
  { year: 1871, depth01: 0.15, y: -28, label: '1871 · Colesberg Kopje diamond rush begins' },
  { year: 1887, depth01: 0.40, y: -72, label: '1887 · Cecil Rhodes consolidates De Beers' },
  { year: 1900, depth01: 0.67, y: -120, label: '1900 · Siege of Kimberley; mines shelter civilians' },
  { year: 1914, depth01: 0.92, y: -165, label: '1914 · Open-pit hand mining ends; 14.5 million carats extracted' },
];

export type KimberleyHeritageData = {
  station: Coordinate;
  platforms: { id: number; ref: string | null; outline: Coordinate[] }[];
  yard: { id: number; service: string | null; line: Coordinate[] }[];
  tram: { id: number; note: string | null; line: Coordinate[] }[];
  preserved: { id: number; description: string | null; line: Coordinate[] }[];
  tramStop: { name: string; outline: Coordinate[] } | null;
};

export type KimberleyData = {
  route: unknown;
  terrain: TerrainData | null;
  buildings: BuildingData | null;
  roads: RoadData | null;
  heritage: KimberleyHeritageData | null;
};

/** Everything but the route is optional: missing scenery costs detail, not the chapter. */
export async function loadKimberleyData(signal?: AbortSignal): Promise<KimberleyData> {
  const optional = <T>(url: string) => fetch(url, { signal }).then(r => r.ok ? r.json() as Promise<T> : null).catch(() => null);
  const [route, terrain, buildings, roads, heritage] = await Promise.all([
    fetch('/data/route-kimberley.geojson', { signal }).then(r => { if (!r.ok) throw new Error('Kimberley rail geometry is unavailable'); return r.json(); }),
    optional<TerrainData>('/data/kimberley-terrain.json'),
    optional<BuildingData>('/data/kimberley-buildings.json'),
    optional<RoadData>('/data/kimberley-roads.json'),
    optional<KimberleyHeritageData>('/data/kimberley-heritage.json'),
  ]);
  return { route, terrain, buildings, roads, heritage };
}

type Frame = { origin: THREE.Vector3; forward: THREE.Vector3; side: THREE.Vector3 };
export type Shot = { position: THREE.Vector3; target: THREE.Vector3 };

/** Metres past the station node where the locomotive stops: the south end of platform 1. */
const STOP_AFTER_STATION = 95;
/** Real Big Hole: 463 m across. Centre from the DEM minimum, 35 m off the OSM label node. */
const BIG_HOLE = { lon: 24.7587485, lat: -28.7395149, radius: 232 };
/** Radius of the pit wall below the rim, as (depth, radius) pairs. Yellow ground, then blue ground. */
const PIT_PROFILE: [number, number][] = [
  [0, 232], [-5, 227], [-14, 218], [-26, 209], [-34, 204], [-60, 199], [-100, 194], [-140, 190], [-175, 187], [-182, 150], [-182, 0],
];
const WATER_DEPTH = -175;
const UP = new THREE.Vector3(0, 1, 0);

/** Radius of the pit wall at a depth below the rim (y <= 0). */
export function pitRadiusAt(y: number) {
  for (let i = 1; i < PIT_PROFILE.length; i++) {
    const [y0, r0] = PIT_PROFILE[i - 1], [y1, r1] = PIT_PROFILE[i];
    if (y <= y0 && y >= y1) return THREE.MathUtils.lerp(r0, r1, (y - y0) / ((y1 - y0) || 1));
  }
  return y > 0 ? PIT_PROFILE[0][1] : PIT_PROFILE.at(-1)![1];
}

/** Deterministic PRNG so the rim camp is identical every run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createKimberleyScene(data: KimberleyData) {
  const root = new THREE.Group();
  root.name = 'kimberley-experience-scene';
  /** The local (projection) frame. Everything is built in here. */
  const local = new THREE.Group();
  local.name = 'kimberley-local-frame';
  root.add(local);

  const modernGroup = new THREE.Group(); modernGroup.name = 'kimberley-modern';
  const heritageGroup = new THREE.Group(); heritageGroup.name = 'kimberley-heritage';
  const bigHoleGroup = new THREE.Group(); bigHoleGroup.name = 'kimberley-big-hole';
  const tramRoot = new THREE.Group(); tramRoot.name = 'kimberley-tram-root';
  const trainRoot = new THREE.Group(); trainRoot.name = 'kimberley-train-root';
  local.add(modernGroup, heritageGroup, bigHoleGroup, tramRoot, trainRoot);

  // ---------------------------------------------------------------------------
  // Materials. Anything that fades with the time machine uses alpha hashing:
  // dithered, order-independent transparency. Antigravity's pass used ordinary
  // blended transparency, which ghosted - every translucent box showed the
  // insides of every other one.
  // ---------------------------------------------------------------------------
  const ownedMaterials = new Set<THREE.Material>();
  const ownedGeometry = new Set<THREE.BufferGeometry>();
  const disposers: (() => void)[] = [];
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, options: THREE.MeshStandardMaterialParameters = {}) => {
    const key = color + JSON.stringify(options);
    if (!cache.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...options });
      cache.set(key, material); ownedMaterials.add(material);
    }
    return cache.get(key)!;
  };
  const modernMaterials: THREE.Material[] = [];
  const heritageMaterials: THREE.Material[] = [];
  const fading = (list: THREE.Material[], color: string, options: THREE.MeshStandardMaterialParameters = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, alphaHash: true, ...options });
    ownedMaterials.add(material); list.push(material);
    return material;
  };
  const makeFading = (material: THREE.Material, list: THREE.Material[]) => {
    material.alphaHash = true; material.transparent = false; material.needsUpdate = true;
    list.push(material);
  };
  /** Materials that glow after dark, for TimeOfDay. */
  const emissive: { material: THREE.MeshStandardMaterial; colour: string; peak: number }[] = [];

  /** Batches unit boxes per material into one InstancedMesh each. */
  class Boxes {
    private batches = new Map<THREE.Material, THREE.Matrix4[]>();
    private readonly target: THREE.Object3D;
    constructor(target: THREE.Object3D) { this.target = target; }
    add(size: [number, number, number], at: THREE.Vector3, material: THREE.Material, yaw = 0, pitch = 0) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YXZ'));
      if (!this.batches.has(material)) this.batches.set(material, []);
      this.batches.get(material)!.push(new THREE.Matrix4().compose(at, q, new THREE.Vector3(...size)));
    }
    /** A box spanning two points, for rails, ropes and wires. */
    span(a: THREE.Vector3, b: THREE.Vector3, width: number, height: number, material: THREE.Material) {
      const d = b.clone().sub(a);
      const flat = Math.hypot(d.x, d.z);
      this.add([d.length(), height, width], a.clone().add(b).multiplyScalar(0.5), material, Math.atan2(-d.z, d.x), Math.atan2(d.y, flat));
    }
    build() {
      const geometry = new THREE.BoxGeometry(1, 1, 1); ownedGeometry.add(geometry);
      for (const [material, transforms] of this.batches) {
        const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
        transforms.forEach((t, i) => mesh.setMatrixAt(i, t));
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.target.add(mesh);
        disposers.push(() => mesh.dispose());
      }
      this.batches.clear();
    }
  }

  // ---------------------------------------------------------------------------
  // Projection, terrain and the rail profile.
  // ---------------------------------------------------------------------------
  const route = readRideRoute(data.route);
  const coordinates = route.geometry.coordinates;
  const model = createTrainModel(coordinates);
  const routeLength = model.cumulative.at(-1) ?? 4600;
  const origin: Coordinate = [kimberleyMetadata.anchor.lon, kimberleyMetadata.anchor.lat];
  const cosLat = Math.cos(origin[1] * Math.PI / 180);
  const flat = (lon: number, lat: number) => new THREE.Vector3((lon - origin[0]) * 111320 * cosLat, 0, -(lat - origin[1]) * 110540);

  const properties = route.properties as { stationAlongMetres?: number };
  const STATION_S = properties.stationAlongMetres ?? nearestAlong(flat(origin[0], origin[1]));
  const STOP_S = STATION_S + STOP_AFTER_STATION;
  function nearestAlong(point: THREE.Vector3) {
    let best = Infinity, along = 0;
    for (let s = 0; s <= routeLength; s += 4) {
      const p = sampleTrainCoordinate(model, s), d = flat(p[0], p[1]).distanceTo(point);
      if (d < best) { best = d; along = s; }
    }
    return along;
  }

  const terrain = data.terrain ? new Terrain(data.terrain, flat, routeLength) : null;
  if (terrain) terrain.palette = { valley: '#b0855a', ridge: '#c19a6b', rock: '#8a6a52' };
  const rawGround = (x: number, z: number) => terrain ? terrain.heightAt(x, z) : 0;

  // Stations are level. The graded profile still rolls a metre or two over the
  // 430 m of platform, which put one end of every platform under the rails; so
  // the rail is held at one level through the station and blends back out.
  const STATION_LEVEL = terrain ? terrain.railAt(STATION_S) : 0;
  const levelWeight = (s: number) => 1 - THREE.MathUtils.smoothstep(Math.abs(s - (STATION_S - 60)), 280, 560);
  const railY = (s: number) => terrain ? THREE.MathUtils.lerp(terrain.railAt(s), STATION_LEVEL, levelWeight(s)) : 0;
  const project = (s: number) => {
    const clamped = THREE.MathUtils.clamp(s, 0, routeLength);
    const p = sampleTrainCoordinate(model, clamped);
    const v = flat(p[0], p[1]);
    // Beyond the data the line carries straight on, rather than stacking up.
    if (s !== clamped) {
      const d = basis(clamped);
      v.addScaledVector(d, s - clamped);
    }
    v.y = railY(clamped);
    return v;
  };
  const basis = (s: number): THREE.Vector3 => {
    const a = THREE.MathUtils.clamp(s - 8, 0, routeLength - 16);
    const pa = sampleTrainCoordinate(model, a), pb = sampleTrainCoordinate(model, a + 16);
    return flat(pb[0], pb[1]).sub(flat(pa[0], pa[1])).setY(railY(a + 16) - railY(a)).normalize();
  };
  const sideOf = (d: THREE.Vector3) => new THREE.Vector3(-d.z, 0, d.x).normalize();

  // Pads before anything reads the ground: the station throat, then the Big Hole rim.
  const craterLocal = flat(BIG_HOLE.lon, BIG_HOLE.lat);
  if (terrain) {
    for (let s = STATION_S - 320; s <= STATION_S + 260; s += 70) {
      const p = project(s);
      terrain.addStamp({ x: p.x, z: p.z, inner: 70, outer: 130, base: STATION_LEVEL });
    }
  }
  let rimLevel = 0;
  if (terrain) {
    let total = 0;
    for (let a = 0; a < 16; a++) total += rawGround(craterLocal.x + Math.cos(a / 16 * Math.PI * 2) * (BIG_HOLE.radius + 80), craterLocal.z + Math.sin(a / 16 * Math.PI * 2) * (BIG_HOLE.radius + 80));
    rimLevel = total / 16;
    terrain.addStamp({ x: craterLocal.x, z: craterLocal.z, inner: BIG_HOLE.radius + 45, outer: BIG_HOLE.radius + 150, base: rimLevel });
    terrain.addPit({ x: craterLocal.x, z: craterLocal.z, radius: BIG_HOLE.radius + 6, floor: rimLevel - 205 });
  }
  craterLocal.y = rimLevel;
  const WORLD_START = 0, WORLD_END = Math.floor(routeLength);
  terrain?.carveRail(project, WORLD_START, WORLD_END);
  const groundAt = (x: number, z: number) => terrain ? terrain.heightAt(x, z) : 0;
  const projectLngLat = (lon: number, lat: number) => { const v = flat(lon, lat); v.y = groundAt(v.x, v.z); return v; };

  // The world transform: stop point to the origin, direction of travel to -x.
  const stopPoint = project(STOP_S);
  const travel = basis(STOP_S);
  const yaw = Math.PI - Math.atan2(-travel.z, travel.x);
  local.rotation.y = yaw;
  local.position.copy(stopPoint.clone().applyAxisAngle(UP, yaw)).negate();
  local.updateMatrix();
  root.updateMatrixWorld(true);
  const toWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(local.matrix);
  const inverse = local.matrix.clone().invert();
  const toLocal = (v: THREE.Vector3) => v.clone().applyMatrix4(inverse);
  const dirToWorld = (v: THREE.Vector3) => v.clone().applyAxisAngle(UP, yaw);

  // ---------------------------------------------------------------------------
  // Ground, formation and the main line.
  // ---------------------------------------------------------------------------
  const scenery = new Boxes(local);
  if (terrain) {
    const ground = terrain.build(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97, vertexColors: true }));
    ownedMaterials.add(ground.material as THREE.Material); ownedGeometry.add(ground.geometry);
    local.add(ground);
    const formation = terrain.buildFormation({ project, basis }, WORLD_START, WORLD_END, mat('#8c7560'));
    ownedGeometry.add(formation.geometry);
    local.add(formation);
  } else {
    scenery.add([9000, 2, 9000], new THREE.Vector3(0, -1.2, 0), mat('#9e5d3b'));
  }

  const ballast = mat('#9c8d7c'), rail = mat('#59605f', { metalness: 0.6, roughness: 0.4 }), sleeperMaterial = mat('#6f6152');
  const layTrack = (points: THREE.Vector3[], withSleepers = true) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const d = b.clone().sub(a); if (d.length() < 0.2) continue;
      const side = sideOf(d.clone().normalize());
      const heading = Math.atan2(-d.z, d.x);
      scenery.add([d.length() + 0.1, 0.18, 4.1], a.clone().add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 - 0.05), ballast, heading);
      for (const sign of [-1, 1]) scenery.span(a.clone().addScaledVector(side, sign * 0.5335).setY(a.y + 0.2), b.clone().addScaledVector(side, sign * 0.5335).setY(b.y + 0.2), 0.08, 0.15, rail);
      if (withSleepers) for (let t = 0; t < d.length(); t += 2.2) {
        scenery.add([0.25, 0.15, 2.6], a.clone().addScaledVector(d, t / d.length()).setY(THREE.MathUtils.lerp(a.y, b.y, t / d.length()) + 0.02), sleeperMaterial, heading);
      }
    }
  };
  const mainLine: THREE.Vector3[] = [];
  for (let s = WORLD_START; s <= WORLD_END; s += 10) mainLine.push(project(s));
  layTrack(mainLine);

  // ---------------------------------------------------------------------------
  // The station: real platform outlines, real yard tracks, at station level.
  // ---------------------------------------------------------------------------
  const stationFrame = { origin: project(STATION_S), forward: basis(STATION_S) };
  const stationSide = sideOf(stationFrame.forward);
  const heritage = data.heritage;
  const PLATFORM_HEIGHT = 0.95;
  const platformDeck = mat('#b7a58c'), platformEdge = mat('#e5b741'), canopyRoof = mat('#566b68'), ironwork = mat('#233838', { metalness: 0.3, roughness: 0.5 });
  const platformCentres: { centre: THREE.Vector3; length: number; width: number }[] = [];
  for (const platform of heritage?.platforms ?? []) {
    const ring = platform.outline.map(([lon, lat]) => flat(lon, lat));
    const shape = new THREE.Shape(ring.map(p => new THREE.Vector2(p.x, p.z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_HEIGHT + 1.2, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, STATION_LEVEL + PLATFORM_HEIGHT, 0);
    ownedGeometry.add(geometry);
    const mesh = new THREE.Mesh(geometry, platformDeck);
    mesh.receiveShadow = true; mesh.castShadow = true;
    local.add(mesh);
    // Measure the platform in the track frame, for its canopy.
    let minA = Infinity, maxA = -Infinity, minS = Infinity, maxS = -Infinity;
    for (const p of ring) {
      const rel = p.clone().sub(stationFrame.origin);
      const a = rel.dot(stationFrame.forward), c = rel.dot(stationSide);
      minA = Math.min(minA, a); maxA = Math.max(maxA, a); minS = Math.min(minS, c); maxS = Math.max(maxS, c);
    }
    const centre = stationFrame.origin.clone().addScaledVector(stationFrame.forward, (minA + maxA) / 2).addScaledVector(stationSide, (minS + maxS) / 2);
    platformCentres.push({ centre, length: maxA - minA, width: maxS - minS });
  }
  const heading = Math.atan2(-stationFrame.forward.z, stationFrame.forward.x);
  const deckY = STATION_LEVEL + PLATFORM_HEIGHT;
  for (const { centre, length, width } of platformCentres) {
    if (width < 2.5) continue;
    // Canopy over the middle of the platform, cast-iron columns under it.
    const canopyLength = Math.min(length * 0.6, 240);
    scenery.add([canopyLength, 0.22, Math.max(3, width - 0.8)], centre.clone().setY(deckY + 4.3), canopyRoof, heading);
    for (let a = -canopyLength / 2 + 6; a <= canopyLength / 2 - 6; a += 16) {
      const at = centre.clone().addScaledVector(stationFrame.forward, a);
      scenery.add([0.3, 4.2, 0.3], at.clone().setY(deckY + 2.1), ironwork, heading);
      scenery.add([0.4, 0.28, Math.max(2.6, width - 1.4)], at.clone().setY(deckY + 4.1), ironwork, heading);
      scenery.add([2.4, 0.12, 0.6], at.clone().addScaledVector(stationFrame.forward, 5).setY(deckY + 0.46), mat('#75482e'), heading);
    }
    for (const sign of [-1, 1]) scenery.add([length - 2, 0.03, 0.22], centre.clone().addScaledVector(stationSide, sign * (width / 2 - 0.4)).setY(deckY + 0.02), platformEdge, heading);
  }

  // Yard tracks. The main line is one of them in OSM and is already laid.
  const mainNear = (p: THREE.Vector3) => {
    let best = Infinity;
    for (const q of mainLine) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
    return best;
  };
  for (const way of heritage?.yard ?? []) {
    const points = way.line.map(([lon, lat]) => flat(lon, lat));
    const middle = points[Math.floor(points.length / 2)];
    if (mainNear(middle) < 2.5 && mainNear(points[0]) < 2.5) continue;
    // Held at station level near the station, on the ground further out.
    const placed = points.map(p => {
      const d = Math.hypot(p.x - stationFrame.origin.x, p.z - stationFrame.origin.z);
      const w = 1 - THREE.MathUtils.smoothstep(d, 300, 520);
      return p.setY(THREE.MathUtils.lerp(groundAt(p.x, p.z) + 0.3, STATION_LEVEL, w));
    });
    layTrack(placed, placed.length < 60);
  }

  // Station building: Victorian sandstone with a clock tower. OSM has its
  // footprint (a plain block 23 m west of the station node); the authored
  // building takes that footprint and replaces the generic extrusion.
  const townSide = stationSide.clone().multiplyScalar(stationSide.dot(flat(24.7638, -28.7380).sub(stationFrame.origin)) < 0 ? -1 : 1);
  const stationRecord = data.buildings?.buildings.find(b => {
    const p = flat(b.lon, b.lat);
    return Math.hypot(p.x, p.z) < 45 && p.sub(stationFrame.origin).setY(0).dot(townSide) > 0;
  }) ?? null;
  const nearest = platformCentres.reduce<(typeof platformCentres)[number] | null>((best, p) => (!best || p.centre.clone().sub(stationFrame.origin).dot(townSide) > best.centre.clone().sub(stationFrame.origin).dot(townSide) ? p : best), null);
  let buildingAt: THREE.Vector3, buildingLength = 90, buildingDepth = 20;
  if (stationRecord) {
    buildingAt = flat(stationRecord.lon, stationRecord.lat);
    let minA = Infinity, maxA = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const [east, north] of stationRecord.ring) {
      const v = new THREE.Vector3(east, 0, -north);
      minA = Math.min(minA, v.dot(stationFrame.forward)); maxA = Math.max(maxA, v.dot(stationFrame.forward));
      minC = Math.min(minC, v.dot(townSide)); maxC = Math.max(maxC, v.dot(townSide));
    }
    buildingLength = THREE.MathUtils.clamp(maxA - minA, 40, 140);
    buildingDepth = THREE.MathUtils.clamp(maxC - minC, 10, 30);
  } else {
    buildingAt = (nearest?.centre.clone() ?? stationFrame.origin.clone()).addScaledVector(townSide, (nearest?.width ?? 8) / 2 + 16);
  }
  buildingAt.setY(STATION_LEVEL);
  const sandstone = mat('#c9a77c'), stationRoof = mat('#5d6b66');
  const halfDepth = buildingDepth / 2;
  scenery.add([buildingLength, 8.5, buildingDepth], buildingAt.clone().setY(STATION_LEVEL + 4.25), sandstone, heading);
  scenery.add([buildingLength + 4, 2, buildingDepth + 2], buildingAt.clone().setY(STATION_LEVEL + 9.4), stationRoof, heading);
  scenery.add([14, 6, 14], buildingAt.clone().setY(STATION_LEVEL + 13), sandstone, heading);
  for (let a = -buildingLength / 2 + 6; a <= buildingLength / 2 - 6; a += 8) {
    scenery.add([3.2, 4.4, 0.25], buildingAt.clone().addScaledVector(stationFrame.forward, a).addScaledVector(townSide, -halfDepth - 0.1).setY(STATION_LEVEL + 3.2), mat('#2f3b3c', { roughness: 0.3 }), heading);
  }
  const stationWindows = new THREE.MeshStandardMaterial({ color: '#2c3432', roughness: 0.4 }); ownedMaterials.add(stationWindows);
  emissive.push({ material: stationWindows, colour: '#ffcf8a', peak: 1.6 });
  for (let a = -buildingLength / 2 + 5; a <= buildingLength / 2 - 5; a += 8) scenery.add([2.4, 2.6, 0.2], buildingAt.clone().addScaledVector(stationFrame.forward, a).addScaledVector(townSide, halfDepth + 0.1).setY(STATION_LEVEL + 3.4), stationWindows, heading);
  const nameBoard = makeBoard('KIMBERLEY', 'RAILS TO DIAMONDS · EST. 1871');
  if (nameBoard) {
    for (const { centre, width } of platformCentres) {
      if (width < 2.5) continue;
      const board = new THREE.Mesh(nameBoard.geometry, nameBoard.material);
      board.position.copy(centre).setY(deckY + 2.6);
      board.rotation.y = heading;
      local.add(board);
    }
  }
  function makeBoard(title: string, subtitle: string) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#1c2e2d'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#e5b741'; ctx.fillRect(0, 0, 1024, 14); ctx.fillRect(0, 242, 1024, 14);
    ctx.textAlign = 'center'; ctx.fillStyle = '#faeed2'; ctx.font = 'bold 96px serif'; ctx.fillText(title, 512, 128);
    ctx.font = '38px sans-serif'; ctx.fillStyle = '#e5b741'; ctx.fillText(subtitle, 512, 200);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    // Two faces back to back, so it reads correctly from either platform; a
    // double-sided material would show the back face mirrored.
    const front = new THREE.PlaneGeometry(8, 2), back = new THREE.PlaneGeometry(8, 2).rotateY(Math.PI);
    const geometry = mergeGeometries([front, back])!;
    front.dispose(); back.dispose();
    ownedMaterials.add(material); ownedGeometry.add(geometry);
    disposers.push(() => texture.dispose());
    return { geometry, material };
  }

  // The preserved Class 25NC no. 3411 on the forecourt, where OSM has it.
  const preserved = heritage?.preserved[0];
  if (preserved && preserved.line.length >= 2) {
    const a = flat(...preserved.line[0]), b = flat(...preserved.line.at(-1)!);
    const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
    const plinthY = groundAt(mid.x, mid.z);
    const locoHeading = Math.atan2(-dir.z, dir.x);
    const black = mat('#1e2122', { roughness: 0.6, metalness: 0.3 }), red = mat('#8e2a22');
    const at = (along: number, up: number) => mid.clone().addScaledVector(dir, along).setY(plinthY + up);
    scenery.add([28, 0.7, 3.4], at(0, 0.35), mat('#8a7f70'), locoHeading);
    layTrack([at(-14, 0.7), at(14, 0.7)], true);
    const boiler = new THREE.CylinderGeometry(1.05, 1.05, 11, 18); boiler.rotateZ(Math.PI / 2); ownedGeometry.add(boiler);
    const boilerMesh = new THREE.Mesh(boiler, black); boilerMesh.position.copy(at(3.5, 3.4)); boilerMesh.rotation.y = locoHeading; boilerMesh.castShadow = true; local.add(boilerMesh);
    scenery.add([12, 1.1, 2.9], at(3, 1.9), black, locoHeading);
    scenery.add([0.4, 1.0, 3.0], at(9.2, 1.9), red, locoHeading);
    scenery.add([0.5, 1.6, 0.6], at(8.2, 4.9), black, locoHeading);
    scenery.add([3.6, 3.4, 3.1], at(-4.2, 3.5), black, locoHeading);
    scenery.add([4, 0.3, 3.3], at(-4.2, 5.3), black, locoHeading);
    scenery.add([10, 3.2, 3.0], at(-11, 2.9), black, locoHeading);
    const driver = new THREE.CylinderGeometry(0.76, 0.76, 0.14, 18); driver.rotateX(Math.PI / 2); ownedGeometry.add(driver);
    const sideVec = sideOf(dir);
    for (const along of [-0.2, 1.8, 3.8, 5.8]) for (const sign of [-1, 1]) {
      const wheel = new THREE.Mesh(driver, red);
      wheel.position.copy(at(along, 1.5)).addScaledVector(sideVec, sign * 1.25);
      wheel.rotation.y = locoHeading; local.add(wheel);
    }
  }

  // ---------------------------------------------------------------------------
  // Present-day Kimberley: OSM buildings and streets, lights, the overhead line.
  // ---------------------------------------------------------------------------
  const city = data.buildings ? createBuildings({ ...data.buildings, buildings: data.buildings.buildings.filter(b => b !== stationRecord) }, projectLngLat, (material, colour, peak) => emissive.push({ material, colour, peak })) : null;
  if (city) {
    for (const mesh of city.meshes) {
      modernGroup.add(mesh);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) makeFading(material, modernMaterials);
    }
    disposers.push(() => city.dispose());
  }
  const roads = data.roads ? createRoads(data.roads, projectLngLat, mat('#6d6862'), fading(modernMaterials, '#d3d6d8')) : null;
  if (roads?.surface) local.add(roads.surface);
  if (roads?.traffic) modernGroup.add(roads.traffic);
  if (roads) disposers.push(() => roads.dispose());
  const streetLights = data.roads ? createStreetLights(data.roads, projectLngLat, fading(modernMaterials, '#5b625f'), { groundAt, maxLights: 500 }) : null;
  if (streetLights) {
    modernGroup.add(streetLights.group);
    emissive.push({ material: streetLights.lampMaterial, colour: '#ffbf6e', peak: 3 });
    emissive.push({ material: streetLights.poolMaterial, colour: '#ffb45e', peak: 0.55 });
    disposers.push(() => streetLights.dispose());
  }
  // Kimberley is on the electrified main line north to Johannesburg.
  const catenary = createCatenary({ project, basis }, WORLD_START, WORLD_END, fading(modernMaterials, '#57616a'), fading(modernMaterials, '#39414a'));
  modernGroup.add(catenary.group); disposers.push(() => catenary.dispose());
  const lampGreen = new THREE.MeshStandardMaterial({ color: '#1f7a42' }), lampRed = new THREE.MeshStandardMaterial({ color: '#7a1f28' });
  ownedMaterials.add(lampGreen); ownedMaterials.add(lampRed);
  emissive.push({ material: lampGreen, colour: '#3dff9a', peak: 2.6 }, { material: lampRed, colour: '#ff4a52', peak: 2.6 });
  // Not through the station: relay huts and troughing do not stand on platforms.
  for (const [from, to] of [[WORLD_START, STATION_S - 340], [STATION_S + 300, WORLD_END]]) {
    if (to - from < 50) continue;
    const lineside = createLineside({ project, basis }, from, to, { metal: mat('#5a636a'), concrete: mat('#b7b2a4'), cable: mat('#3b4148'), lampGreen, lampRed });
    local.add(lineside.group); disposers.push(() => lineside.dispose());
  }

  // Northern Cape veld: sparse dry tussocks, and camel thorn - Kimberley's tree.
  const veld = createVegetation({ project, basis }, groundAt, WORLD_START, WORLD_END, { grass: mat('#a8995e'), scrub: mat('#7b7646') }, 0.8);
  for (const mesh of veld.meshes) local.add(mesh);
  disposers.push(() => veld.dispose());
  const random = mulberry32(2871);
  const clear = (p: THREE.Vector3) =>
    Math.hypot(p.x - craterLocal.x, p.z - craterLocal.z) > BIG_HOLE.radius + 40
    && mainNear(p) > 14 && Math.hypot(p.x - stationFrame.origin.x, p.z - stationFrame.origin.z) > 160;
  const thornTrunk = new THREE.CylinderGeometry(0.28, 0.45, 4, 5), thornCrown = new THREE.SphereGeometry(1, 8, 5);
  ownedGeometry.add(thornTrunk); ownedGeometry.add(thornCrown);
  const thornSpots: THREE.Vector3[] = [];
  for (let attempt = 0; attempt < 900 && thornSpots.length < 220; attempt++) {
    const s = random() * routeLength, d = basis(s), side = sideOf(d);
    const p = project(s).addScaledVector(side, (random() < 0.5 ? -1 : 1) * (18 + random() * 420));
    if (!clear(p)) continue;
    p.y = groundAt(p.x, p.z); thornSpots.push(p);
  }
  const trunks = new THREE.InstancedMesh(thornTrunk, mat('#5a4636'), thornSpots.length);
  const crowns = new THREE.InstancedMesh(thornCrown, mat('#6f7a45'), thornSpots.length);
  const m4 = new THREE.Matrix4();
  thornSpots.forEach((p, i) => {
    const size = 0.8 + random() * 0.6;
    m4.compose(p.clone().setY(p.y + 2 * size), new THREE.Quaternion(), new THREE.Vector3(size, size, size)); trunks.setMatrixAt(i, m4);
    // Flat, wide, umbrella crowns: the camel thorn silhouette.
    m4.compose(p.clone().setY(p.y + 4.3 * size), new THREE.Quaternion().setFromAxisAngle(UP, random() * 6), new THREE.Vector3(4.2 * size, 1.1 * size, 3.8 * size)); crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
  local.add(trunks, crowns); disposers.push(() => { trunks.dispose(); crowns.dispose(); });

  // ---------------------------------------------------------------------------
  // The Big Hole. The DEM gives the site and the rim; the pit itself is
  // authored, since a 25 m grid smooths a vertical-walled mine into a bowl.
  // ---------------------------------------------------------------------------
  bigHoleGroup.position.copy(craterLocal);
  const wallPoints = PIT_PROFILE.slice().reverse().map(([y, r]) => new THREE.Vector2(r, y));
  const wall = new THREE.LatheGeometry(wallPoints, 96);
  {
    // Rock, not a turned vase: roughen the radius, and colour yellow ground
    // over hard blue ground as the real walls are.
    const position = wall.attributes.position as THREE.BufferAttribute;
    const colours = new Float32Array(position.count * 3);
    const yellow = new THREE.Color('#b8955f'), blue = new THREE.Color('#56626a'), dark = new THREE.Color('#3c4449'), c = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 1 && y < -1 && y > -179) {
        const angle = Math.atan2(z, x);
        const rough = Math.sin(angle * 23 + y * 0.21) * 2.2 + Math.sin(angle * 57 - y * 0.5) * 1.1 + Math.sin(y * 0.9) * 0.8;
        const k = (r + rough) / r;
        position.setX(i, x * k); position.setZ(i, z * k);
      }
      c.copy(yellow).lerp(blue, THREE.MathUtils.smoothstep(-y, 22, 40)).lerp(dark, THREE.MathUtils.smoothstep(-y, 120, 175) * 0.6);
      const band = 0.9 + 0.1 * Math.sin(y * 1.7);
      colours[i * 3] = c.r * band; colours[i * 3 + 1] = c.g * band; colours[i * 3 + 2] = c.b * band;
    }
    wall.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    wall.computeVertexNormals();
  }
  ownedGeometry.add(wall);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.96, side: THREE.DoubleSide });
  ownedMaterials.add(wallMaterial);
  const wallMesh = new THREE.Mesh(wall, wallMaterial); wallMesh.receiveShadow = true;
  bigHoleGroup.add(wallMesh);
  const collar = new THREE.RingGeometry(BIG_HOLE.radius - 1.5, BIG_HOLE.radius + 44, 96, 1); collar.rotateX(-Math.PI / 2); ownedGeometry.add(collar);
  const collarMesh = new THREE.Mesh(collar, mat('#a88862', { roughness: 0.98 })); collarMesh.position.y = 0.12; collarMesh.receiveShadow = true;
  bigHoleGroup.add(collarMesh);
  const water = new THREE.CircleGeometry(pitRadiusAt(WATER_DEPTH) + 3, 64); water.rotateX(-Math.PI / 2); ownedGeometry.add(water);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#1d6f73', roughness: 0.12, metalness: 0.35 }); ownedMaterials.add(waterMaterial);
  const waterMesh = new THREE.Mesh(water, waterMaterial); waterMesh.position.y = WATER_DEPTH;
  bigHoleGroup.add(waterMesh);

  const pit = new Boxes(bigHoleGroup);
  // The cantilevered viewing platform, on the museum (west) side of the rim.
  const deckAngle = Math.PI;
  const radial = (angle: number, r: number, y: number) => new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
  const deckYaw = -deckAngle;
  const steel = mat('#3a4245', { metalness: 0.6, roughness: 0.4 }), railing = mat('#d6dcdb', { metalness: 0.7, roughness: 0.3 });
  pit.add([34, 0.6, 7], radial(deckAngle, BIG_HOLE.radius - 10, 0.5), steel, deckYaw);
  for (const sign of [-1, 1]) pit.add([34, 1.1, 0.1], radial(deckAngle, BIG_HOLE.radius - 10, 1.35).add(radial(deckAngle + Math.PI / 2, sign * 3.5, 0)), railing, deckYaw);
  pit.add([0.1, 1.1, 7], radial(deckAngle, BIG_HOLE.radius - 27, 1.35), railing, deckYaw);
  pit.add([6, 12, 0.5], radial(deckAngle, BIG_HOLE.radius + 2, -6), steel, deckYaw);
  // Depth bands: one painted marker per era at the wall, where the story needs them.
  for (const marker of HISTORICAL_DEPTHS) {
    // Clear of the roughened wall, which moves up to 4 m either way.
    const r = pitRadiusAt(marker.y) - 5;
    const ring = new THREE.TorusGeometry(r, 0.35, 4, 128); ring.rotateX(Math.PI / 2); ownedGeometry.add(ring);
    const ringMaterial = new THREE.MeshStandardMaterial({ color: '#e5b741', emissive: '#e5b741', emissiveIntensity: 0.5, roughness: 0.6 });
    ownedMaterials.add(ringMaterial);
    const mesh = new THREE.Mesh(ring, ringMaterial); mesh.position.y = marker.y;
    bigHoleGroup.add(mesh);
  }
  // Present-day rim: a fence and the museum's mine village roofs.
  const fence = fading(modernMaterials, '#8b8f8a', { metalness: 0.4 });
  for (let a = 0; a < 96; a++) {
    const a0 = a / 96 * Math.PI * 2, a1 = (a + 1) / 96 * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a0 - deckAngle), Math.cos(a0 - deckAngle))) < 0.1) continue;
    pit.span(radial(a0, BIG_HOLE.radius + 6, 0.9), radial(a1, BIG_HOLE.radius + 6, 0.9), 0.05, 1.3, fence);
  }

  // ---------------------------------------------------------------------------
  // The 1870s-80s diggings, for the time machine. The rim was a ring of
  // windlasses and staging, with a web of haulage ropes running down into the
  // claims. Canvas tents and corrugated-iron shanties crowded round it.
  // ---------------------------------------------------------------------------
  const timber = fading(heritageMaterials, '#7a5434'), iron = fading(heritageMaterials, '#9aa29f', { metalness: 0.35, roughness: 0.7 });
  const canvasMat = fading(heritageMaterials, '#e7dcc2'), rope = fading(heritageMaterials, '#3b3129'), brick = fading(heritageMaterials, '#a8543f');
  const camp = new Boxes(heritageGroup);
  const rimCamp = new Boxes(bigHoleGroup);
  const tentGeometry = new THREE.ConeGeometry(2.2, 3, 4); tentGeometry.rotateY(Math.PI / 4); ownedGeometry.add(tentGeometry);
  const tentSpots: THREE.Matrix4[] = [];
  for (let i = 0; i < 44; i++) {
    const angle = i / 44 * Math.PI * 2 + (random() - 0.5) * 0.05;
    const top = radial(angle, BIG_HOLE.radius + 3, 0);
    // Windlass staging on the rim: two uprights, a beam, and a drum.
    const yawHere = -angle + Math.PI / 2;
    for (const sign of [-1, 1]) rimCamp.add([0.25, 5, 0.25], top.clone().add(radial(angle + Math.PI / 2, sign * 1.6, 2.5)), timber, yawHere);
    rimCamp.add([0.3, 0.3, 3.6], top.clone().setY(5), timber, yawHere + Math.PI / 2);
    // Haulage ropes down to the claims, three per stage.
    for (let k = 0; k < 3; k++) {
      const depth = -30 - random() * 120;
      const to = radial(angle + (k - 1) * 0.05, pitRadiusAt(depth) * (0.55 + random() * 0.25), depth);
      rimCamp.span(top.clone().setY(5), to, 0.07, 0.07, rope);
    }
    // Tents and shanties behind the staging.
    const behind = radial(angle + (random() - 0.5) * 0.06, BIG_HOLE.radius + 16 + random() * 50, 0);
    if (i % 3 === 0) {
      rimCamp.add([6, 3, 4.5], behind.clone().setY(1.5), iron, yawHere);
      rimCamp.add([6.4, 0.3, 5], behind.clone().setY(3.15), iron, yawHere);
    } else {
      tentSpots.push(new THREE.Matrix4().compose(behind.clone().setY(1.5), new THREE.Quaternion().setFromAxisAngle(UP, yawHere), new THREE.Vector3(1, 1, 1)));
    }
  }
  const tents = new THREE.InstancedMesh(tentGeometry, canvasMat, tentSpots.length);
  tentSpots.forEach((t, i) => tents.setMatrixAt(i, t)); tents.castShadow = true;
  bigHoleGroup.add(tents); disposers.push(() => tents.dispose());
  // Rim camp ground level follows the rim pad; the rim group sits at rim level.
  rimCamp.build();

  // A digger's-town street along the tramway: brick and iron shopfronts with
  // verandas, where Market Square and the old town were.
  const tramLine = heritage?.tram[0]?.line ?? [];
  const tramPoints = tramLine.map(([lon, lat]) => projectLngLat(lon, lat));
  const tramCumulative = [0];
  for (let i = 1; i < tramPoints.length; i++) tramCumulative.push(tramCumulative[i - 1] + tramPoints[i].distanceTo(tramPoints[i - 1]));
  const tramLength = tramCumulative.at(-1) ?? 0;
  const tramAt = (d: number) => {
    const target = THREE.MathUtils.clamp(d, 0, tramLength);
    let i = 1; while (i < tramCumulative.length - 1 && tramCumulative[i] < target) i++;
    const a = tramPoints[i - 1], b = tramPoints[i];
    const t = (target - tramCumulative[i - 1]) / ((tramCumulative[i] - tramCumulative[i - 1]) || 1);
    return { position: a.clone().lerp(b, t), forward: b.clone().sub(a).setY(0).normalize() };
  };
  for (let d = 30; d < tramLength - 40; d += 34) {
    const { position, forward } = tramAt(d);
    const side = sideOf(forward), h = Math.atan2(-forward.z, forward.x);
    for (const sign of [-1, 1]) {
      const front = position.clone().addScaledVector(side, sign * 16);
      if (Math.hypot(front.x - craterLocal.x, front.z - craterLocal.z) < BIG_HOLE.radius + 60 || mainNear(front) < 20) continue;
      const g = groundAt(front.x, front.z), height = 5.5 + ((d * 7) % 3);
      const body = front.clone().addScaledVector(side, sign * 6);
      camp.add([14, height, 11], body.clone().setY(g + height / 2), (d / 34) % 2 < 1 ? brick : timber, h);
      camp.add([15, 0.5, 12], body.clone().setY(g + height + 0.25), iron, h);
      camp.add([14, 0.2, 3.6], front.clone().setY(g + 3.3), iron, h);
      for (const along of [-6, 0, 6]) camp.add([0.2, 3.2, 0.2], front.clone().addScaledVector(forward, along).addScaledVector(side, -sign * 1.6).setY(g + 1.6), timber, h);
    }
  }
  camp.build();

  // ---------------------------------------------------------------------------
  // The heritage tram: the real tramway, Market Square past the Big Hole.
  // ---------------------------------------------------------------------------
  const tramRail = mat('#6f7577', { metalness: 0.6, roughness: 0.4 }), cobbles = mat('#6a5f55', { roughness: 0.98 });
  const poles = mat('#2b3232');
  const tramway = new Boxes(local);
  for (let i = 1; i < tramPoints.length; i++) {
    const a = tramPoints[i - 1], b = tramPoints[i];
    const d = b.clone().sub(a), len = Math.hypot(d.x, d.z); if (len < 0.2) continue;
    const side = sideOf(d.clone().setY(0).normalize()), h = Math.atan2(-d.z, d.x);
    tramway.add([len + 0.1, 0.12, 2.4], a.clone().add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 + 0.05), cobbles, h);
    for (const sign of [-1, 1]) tramway.span(a.clone().addScaledVector(side, sign * 0.5335).setY(a.y + 0.14), b.clone().addScaledVector(side, sign * 0.5335).setY(b.y + 0.14), 0.07, 0.06, tramRail);
  }
  const trolleyWire: THREE.Vector3[] = [];
  for (let d = 0; d <= tramLength; d += 30) {
    const { position, forward } = tramAt(d);
    const side = sideOf(forward), h = Math.atan2(-forward.z, forward.x);
    const pole = position.clone().addScaledVector(side, 3.2);
    tramway.add([0.22, 6.6, 0.22], pole.clone().setY(position.y + 3.3), poles, h);
    tramway.add([0.1, 0.1, 3.4], position.clone().addScaledVector(side, 1.6).setY(position.y + 6.2), poles, h);
    trolleyWire.push(position.clone().setY(position.y + 5.9));
  }
  for (let i = 1; i < trolleyWire.length; i++) tramway.span(trolleyWire[i - 1], trolleyWire[i], 0.03, 0.03, poles);
  tramway.build();
  if (tramLength > 0 && heritage?.tramStop) {
    const stop = heritage.tramStop.outline.map(([lon, lat]) => flat(lon, lat));
    const c = stop.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / stop.length);
    const board = makeBoard('MARKET SQUARE', 'KIMBERLEY TRAMWAY · 1887');
    if (board) {
      const mesh = new THREE.Mesh(board.geometry, board.material);
      const { forward } = tramAt(0);
      mesh.position.copy(c).setY(groundAt(c.x, c.z) + 3.2); mesh.rotation.y = Math.atan2(-forward.z, forward.x);
      local.add(mesh);
    }
    scenery.add([8, 3.2, 5], c.clone().setY(groundAt(c.x, c.z) + 1.6), mat('#caa57a'), Math.atan2(-tramAt(0).forward.z, tramAt(0).forward.x));
  }

  // The car: Kimberley's 1914 Brill-type, bottle green and cream.
  const tramCar = new THREE.Group();
  tramCar.name = 'vintage-tram-car';
  const car = new Boxes(tramCar);
  const tramGreen = mat('#194236', { roughness: 0.5 }), cream = mat('#faeed4', { roughness: 0.6 }), brass = mat('#c79c38', { metalness: 0.8, roughness: 0.25 });
  const tramGlass = new THREE.MeshStandardMaterial({ color: '#304a52', roughness: 0.15, metalness: 0.4 }); ownedMaterials.add(tramGlass);
  emissive.push({ material: tramGlass, colour: '#ffd79a', peak: 1.4 });
  car.add([9.4, 0.45, 2.4], new THREE.Vector3(0, 0.65, 0), mat('#232628', { metalness: 0.7 }));
  car.add([9.2, 1.4, 2.3], new THREE.Vector3(0, 1.55, 0), tramGreen);
  car.add([9.2, 1.1, 2.25], new THREE.Vector3(0, 2.75, 0), cream);
  for (let w = -3.2; w <= 3.2; w += 1.3) for (const side of [-1, 1]) car.add([0.9, 0.8, 0.05], new THREE.Vector3(w, 2.8, side * 1.14), tramGlass);
  car.add([9.6, 0.3, 2.5], new THREE.Vector3(0, 3.45, 0), mat('#3b4544', { roughness: 0.7 }));
  car.add([2.8, 0.35, 0.06], new THREE.Vector3(4.4, 3.25, 0), cream);
  car.span(new THREE.Vector3(-0.8, 3.6, 0), new THREE.Vector3(-3.2, 5.9, 0), 0.08, 0.08, brass);
  car.build();
  const tramWheel = new THREE.CylinderGeometry(0.38, 0.38, 0.15, 16); tramWheel.rotateX(Math.PI / 2); ownedGeometry.add(tramWheel);
  const tramWheels: THREE.Mesh[] = [];
  for (const x of [-2.4, 2.4]) for (const z of [-0.95, 0.95]) {
    const wheel = new THREE.Mesh(tramWheel, mat('#303437', { metalness: 0.8 }));
    wheel.position.set(x, 0.42, z); tramCar.add(wheel); tramWheels.push(wheel);
  }
  tramRoot.add(tramCar);

  // ---------------------------------------------------------------------------
  // The diamond, in the blue ground on the wall, where the descent ends.
  // ---------------------------------------------------------------------------
  /** Crater-local angle the descent spirals through, ending facing the diamond. */
  const DESCENT = { from: -0.35 * Math.PI, to: 0.4 * Math.PI, diamondDepth: -95 };
  const diamondAngle = DESCENT.to + 0.16;
  const diamondRoot = new THREE.Group();
  diamondRoot.name = 'diamond-discovery-node';
  diamondRoot.position.copy(radial(diamondAngle, pitRadiusAt(DESCENT.diamondDepth) - 2.6, DESCENT.diamondDepth));
  bigHoleGroup.add(diamondRoot);
  const diamondGeometry = new THREE.OctahedronGeometry(1.8, 0); ownedGeometry.add(diamondGeometry);
  const diamondMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.2, emissive: '#bdefff', emissiveIntensity: 0.95 });
  ownedMaterials.add(diamondMaterial);
  const diamondMesh = new THREE.Mesh(diamondGeometry, diamondMaterial);
  diamondRoot.add(diamondMesh);
  const diamondLight = new THREE.PointLight('#b5e5ff', 35, 60, 2);
  diamondRoot.add(diamondLight);
  const glintGeometry = new THREE.BufferGeometry();
  const glints = new Float32Array(24 * 3);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2, r = 2.6 + (i % 3) * 0.8;
    glints.set([Math.cos(angle) * r, Math.sin(i * 5) * 0.7, Math.sin(angle) * r], i * 3);
  }
  glintGeometry.setAttribute('position', new THREE.BufferAttribute(glints, 3)); ownedGeometry.add(glintGeometry);
  const glintMaterial = new THREE.PointsMaterial({ color: '#e2f7ff', size: 0.45, transparent: true, opacity: 0.85 }); ownedMaterials.add(glintMaterial);
  const glintPoints = new THREE.Points(glintGeometry, glintMaterial);
  diamondRoot.add(glintPoints);

  scenery.build();
  pit.build();

  // Birds over the diggings. Pied crows, but at this range any dark bird reads.
  const birds = createBirds(mat('#1f1f1f'), { flocks: 5, seed: 1871 });
  for (const mesh of birds.meshes) local.add(mesh);
  disposers.push(() => birds.dispose());

  // ---------------------------------------------------------------------------
  // The train. The chapter owns the consist; the scene places it on the rail.
  // ---------------------------------------------------------------------------
  type Consist = ReturnType<typeof createConsist>;
  let consist: Consist | null = null;
  let wheels: TrainWheels | null = null;
  const poses: VehiclePose[] = [];
  const offsets: number[] = [];
  function attachTrain(vehicles: Consist, underframe: THREE.Material) {
    consist = vehicles;
    // Offsets are centre-to-centre from the locomotive; measure from its nose.
    for (const vehicle of vehicles) {
      offsets.push(vehicle.offset + vehicles[0].length / 2);
      trainRoot.add(vehicle.root);
      poses.push({ position: new THREE.Vector3(), angle: 0, pitch: 0 });
    }
    wheels = new TrainWheels(vehicles.flatMap(v => v.wheelSlots), underframe);
    trainRoot.add(wheels.mesh);
  }
  /** Place the consist with the locomotive's nose `x` metres before the stop. */
  function setTrainDistance(x: number) {
    if (!consist) return;
    const head = STOP_S - x;
    consist.forEach((vehicle, i) => {
      const s = head - offsets[i], bogie = vehicle.halfBogieSpacing;
      const front = project(s + bogie), rear = project(s - bogie), d = front.clone().sub(rear);
      vehicle.root.position.copy(front.add(rear).multiplyScalar(0.5)).y += 0.58;
      vehicle.root.rotation.order = 'YXZ';
      vehicle.root.rotation.y = Math.atan2(-d.z, d.x);
      vehicle.root.rotation.z = Math.atan2(d.y, Math.hypot(d.x, d.z));
      poses[i].position.copy(vehicle.root.position);
      poses[i].angle = vehicle.root.rotation.y;
      poses[i].pitch = vehicle.root.rotation.z;
    });
    wheels?.update(poses, head);
  }

  // ---------------------------------------------------------------------------
  // World-space helpers for the chapter's cameras.
  // ---------------------------------------------------------------------------
  /** Track frame in world space at `x` metres before the stop. `side` points away from the town. */
  function railFrame(x: number): Frame {
    const s = STOP_S - x;
    const forward = dirToWorld(basis(s)).setY(0).normalize();
    let side = new THREE.Vector3(-forward.z, 0, forward.x);
    const town = toWorld(buildingAt).sub(toWorld(project(s)));
    if (side.dot(town) > 0) side.negate();
    return { origin: toWorld(project(s)), forward, side };
  }
  const craterCenter = toWorld(craterLocal);
  const crater = (angle: number, r: number, y: number) => toWorld(craterLocal.clone().add(radial(angle, r, y)));
  const marketSquare = tramPoints[0] ? toWorld(tramPoints[0]) : toWorld(stationFrame.origin);
  const shots = {
    /** High three-quarter view of the station and the arriving train. */
    arrivalWide(): Shot {
      const f = railFrame(0);
      return { position: f.origin.clone().addScaledVector(f.forward, -110).addScaledVector(f.side, 70).setY(f.origin.y + 26), target: f.origin.clone().addScaledVector(f.forward, -120).setY(f.origin.y + 2) };
    },
    /** A tracking run alongside the platform as the train draws in. */
    arrivalTrack(u: number): Shot {
      const f = railFrame(0);
      const along = THREE.MathUtils.lerp(-260, -30, u);
      return {
        position: f.origin.clone().addScaledVector(f.forward, along).addScaledVector(f.side, THREE.MathUtils.lerp(26, 11, u)).setY(f.origin.y + THREE.MathUtils.lerp(9, 4.5, u)),
        target: f.origin.clone().addScaledVector(f.forward, along + 40).setY(f.origin.y + 2.4),
      };
    },
    /** Over the station roof towards the old town and the diggings. */
    heritageWide(): Shot {
      const f = railFrame(80);
      return { position: f.origin.clone().addScaledVector(f.side, 60).setY(f.origin.y + 55), target: marketSquare.clone().lerp(craterCenter, 0.45).setY(craterCenter.y + 4) };
    },
    /** Street level on the tramway at Market Square, looking down the line to the Big Hole. */
    heritageStreet(): Shot {
      const a = tramPoints.length ? toWorld(tramAt(0).position) : marketSquare, b = tramPoints.length ? toWorld(tramAt(120).position) : craterCenter;
      const dir = b.clone().sub(a).setY(0).normalize();
      return { position: a.clone().addScaledVector(dir, -24).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(7)).setY(a.y + 4.2), target: b.clone().setY(b.y + 3) };
    },
    bigHoleReveal(): Shot {
      return { position: crater(DESCENT.from, BIG_HOLE.radius + 180, 70), target: crater(0, 0, -110) };
    },
    bigHoleCrane(): Shot {
      return { position: crater(DESCENT.from, BIG_HOLE.radius + 60, 38), target: crater(0, 0, -120) };
    },
    /** Spiral down inside the wall, ending a few tens of metres from the diamond. */
    descent(progress: number): Shot {
      const p = THREE.MathUtils.clamp(progress, 0, 1);
      const angle = THREE.MathUtils.lerp(DESCENT.from, DESCENT.to, p);
      const y = THREE.MathUtils.lerp(30, DESCENT.diamondDepth + 4, p);
      const r = THREE.MathUtils.lerp(BIG_HOLE.radius + 30, pitRadiusAt(Math.min(0, y)) - 34, THREE.MathUtils.smoothstep(p, 0, 0.35));
      const deep = crater(0, 0, -150), diamond = diamondRoot.getWorldPosition(new THREE.Vector3());
      return { position: crater(angle, r, y), target: deep.lerp(diamond, THREE.MathUtils.smoothstep(p, 0.55, 1)) };
    },
    /** Pull out over the town, looking back to the station. */
    returnHigh(): Shot {
      const station = railFrame(80).origin;
      return { position: craterCenter.clone().lerp(station, 0.45).setY(station.y + 150), target: station.clone().setY(station.y + 4) };
    },
  };
  function tramFrame(): Frame {
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(tramCar.quaternion).applyAxisAngle(UP, yaw).setY(0).normalize();
    return { origin: tramCar.getWorldPosition(new THREE.Vector3()), forward, side: new THREE.Vector3(-forward.z, 0, forward.x) };
  }

  // ---------------------------------------------------------------------------
  // Chapter controls.
  // ---------------------------------------------------------------------------
  let currentEraBlend = 0;
  function setEraBlend(blend01: number) {
    currentEraBlend = THREE.MathUtils.clamp(blend01, 0, 1);
    const modern = 1 - currentEraBlend, past = currentEraBlend;
    for (const m of modernMaterials) m.opacity = modern;
    for (const m of heritageMaterials) m.opacity = past;
    modernGroup.visible = modern > 0.01;
    heritageGroup.visible = past > 0.01;
    for (const mesh of bigHoleGroup.children) if (mesh instanceof THREE.InstancedMesh && heritageMaterials.includes(mesh.material as THREE.Material)) mesh.visible = past > 0.01;
    if (roads?.traffic) roads.traffic.visible = modern > 0.5;
  }

  let tramDistance = 0;
  function setTramProgress(progress01: number) {
    const p = THREE.MathUtils.clamp(progress01, 0, 1);
    if (!tramLength) return;
    const d = p * (tramLength - 12) + 6;
    const { position, forward } = tramAt(d);
    tramCar.position.copy(position).setY(position.y + 0.12);
    tramCar.rotation.y = Math.atan2(-forward.z, forward.x);
    for (const wheel of tramWheels) wheel.rotation.z = -d / 0.38;
    tramDistance = d;
  }

  const cameraLocal = new THREE.Vector3();
  let flash = 0;
  /** A burst of light from the diamond, decaying over about half a second. */
  function flashDiamond() { flash = 1; }
  function update(time: number, dt: number, camera?: THREE.Camera) {
    diamondMesh.rotation.y += dt * 1.4;
    diamondMesh.rotation.x = Math.sin(time * 2) * 0.2;
    glintPoints.rotation.y -= dt * 0.9;
    flash = Math.max(0, flash - dt * 2);
    diamondLight.intensity = 25 + Math.sin(time * 6) * 12 + flash * 60;
    roads?.update(time);
    if (camera) {
      cameraLocal.copy(toLocal(camera.position));
      birds.update(time, cameraLocal, groundAt);
    }
  }

  function dispose() {
    for (const dispose of disposers) dispose();
    wheels?.dispose();
    ownedGeometry.forEach(g => g.dispose());
    ownedMaterials.forEach(m => m.dispose());
    root.clear();
  }

  setEraBlend(0);
  setTramProgress(0);
  tramRoot.visible = false;

  return {
    root,
    modernGroup,
    heritageGroup,
    bigHoleGroup,
    tramRoot,
    tramCar,
    trainRoot,
    diamondRoot,
    craterCenter,
    emissive,
    shots,
    railFrame,
    tramFrame,
    attachTrain,
    setTrainDistance,
    /** Metres of track either side of the stop that the train can use. */
    trainRange: { min: STOP_S - routeLength + 20, max: STOP_S - 20 },
    groundAtWorld(x: number, z: number) { const p = toLocal(new THREE.Vector3(x, 0, z)); return toWorld(p.setY(groundAt(p.x, p.z))).y; },
    get tramDistance() { return tramDistance; },
    setEraBlend,
    setTramProgress,
    flashDiamond,
    update,
    dispose,
    get eraBlend() { return currentEraBlend; },
  };
}

export type KimberleyWorld = ReturnType<typeof createKimberleyScene>;
