// Beaufort West, in the Great Karoo, from real data.
//
// Built the way Kimberley is (see ../kimberley/KimberleyScene.ts): Mapzen
// terrain, the OSM rail alignment through the station, OSM platforms, yard,
// buildings and streets, and the shared scenery modules. What is particular to
// Beaufort West follows the plan in the "Beaufort West" folder:
//   - a wide terrain skirt, so the Nuweveld escarpment stands behind the town;
//   - the Karoo palette: grey-brown ground, olive-grey bossies, pale roofs;
//   - OSM-anchored landmarks (NG Kerk, the museum, the Anglo-Boer War
//     blockhouse, two more NG congregations) and the SANParks-published park
//     gate, each with its source and confidence for click-to-inspect;
//   - illustrative herds, drifting dust, and a starfield for Karoo nights.
//
// Frames, as for Kimberley: `local` is the shared flat projection (+x east,
// +z south, origin on the station node); `world` puts the stopping point at
// the origin with rail level at y = 0 and the train running along -x.
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
import { createWildlife } from './Wildlife';

export const beaufortWestMetadata = {
  name: 'Beaufort West · Heart of the Karoo',
  anchor: { lat: -32.35184, lon: 22.57692 },
  source: 'OSM station node 8148099536, platforms, yard, buildings, roads and landmarks (ODbL); Mapzen terrarium terrain; SANParks park gate',
};

export type TownLandmark = {
  osm: number | null;
  kind: 'church' | 'museum' | 'blockhouse' | 'chapel' | 'park-gate';
  title: string;
  name: string;
  note: string;
  source: string;
  confidence: string;
  location: Coordinate;
  outline: Coordinate[] | null;
  startDate: string | null;
};

export type BeaufortWestTownData = {
  station: Coordinate;
  platforms: { id: number; outline: Coordinate[] }[];
  yard: { id: number; service: string | null; line: Coordinate[] }[];
  landmarks: TownLandmark[];
};

export type BeaufortWestData = {
  route: unknown;
  terrain: TerrainData | null;
  buildings: BuildingData | null;
  roads: RoadData | null;
  town: BeaufortWestTownData | null;
};

export async function loadBeaufortWestData(signal?: AbortSignal): Promise<BeaufortWestData> {
  const optional = <T>(url: string) => fetch(url, { signal }).then(r => r.ok ? r.json() as Promise<T> : null).catch(() => null);
  const [route, terrain, buildings, roads, town] = await Promise.all([
    fetch('/data/route-beaufort-west.geojson', { signal }).then(r => { if (!r.ok) throw new Error('Beaufort West rail geometry is unavailable'); return r.json(); }),
    optional<TerrainData>('/data/beaufort-west-terrain.json'),
    optional<BuildingData>('/data/beaufort-west-buildings.json'),
    optional<RoadData>('/data/beaufort-west-roads.json'),
    optional<BeaufortWestTownData>('/data/beaufort-west-town.json'),
  ]);
  return { route, terrain, buildings, roads, town };
}

type Frame = { origin: THREE.Vector3; forward: THREE.Vector3; side: THREE.Vector3 };
export type Shot = { position: THREE.Vector3; target: THREE.Vector3 };
const UP = new THREE.Vector3(0, 1, 0);

/** The Karoo palette from the plan: not "orange desert", but grey-brown and olive. */
const PALETTE = {
  soil: '#a98b68', soilDark: '#8a7560', mountain: '#6d625d',
  wallCream: '#ddd2b8', heritageWhite: '#ece9df', heritageStone: '#8a8074',
  roofLight: '#c9c4b9', roofRust: '#8a5542', roofSlate: '#4f5654',
  scrub: '#6b7050', scrubDry: '#8a7d58',
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBeaufortWestScene(data: BeaufortWestData) {
  const root = new THREE.Group();
  root.name = 'beaufort-west-scene';
  const local = new THREE.Group();
  local.name = 'beaufort-west-local-frame';
  root.add(local);
  const trainRoot = new THREE.Group(); trainRoot.name = 'beaufort-west-train';
  local.add(trainRoot);

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
  const emissive: { material: THREE.MeshStandardMaterial; colour: string; peak: number }[] = [];
  const glowing = (colour: string, glow: string, peak: number) => {
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 });
    ownedMaterials.add(material); emissive.push({ material, colour: glow, peak });
    return material;
  };

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
    span(a: THREE.Vector3, b: THREE.Vector3, width: number, height: number, material: THREE.Material) {
      const d = b.clone().sub(a);
      this.add([d.length(), height, width], a.clone().add(b).multiplyScalar(0.5), material, Math.atan2(-d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z)));
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
  // Projection, terrain, rail.
  // ---------------------------------------------------------------------------
  const route = readRideRoute(data.route);
  const model = createTrainModel(route.geometry.coordinates);
  const routeLength = model.cumulative.at(-1) ?? 5000;
  const origin: Coordinate = [beaufortWestMetadata.anchor.lon, beaufortWestMetadata.anchor.lat];
  const cosLat = Math.cos(origin[1] * Math.PI / 180);
  const flat = (lon: number, lat: number) => new THREE.Vector3((lon - origin[0]) * 111320 * cosLat, 0, -(lat - origin[1]) * 110540);
  const STATION_S = (route.properties as { stationAlongMetres?: number }).stationAlongMetres ?? routeLength * 0.64;

  const terrain = data.terrain ? new Terrain(data.terrain, flat, routeLength) : null;
  if (terrain) terrain.palette = { valley: PALETTE.soil, ridge: '#9a8a72', rock: PALETTE.mountain };
  const STATION_LEVEL = terrain ? terrain.railAt(STATION_S) : 0;
  const levelWeight = (s: number) => 1 - THREE.MathUtils.smoothstep(Math.abs(s - STATION_S), 300, 600);
  const railY = (s: number) => terrain ? THREE.MathUtils.lerp(terrain.railAt(s), STATION_LEVEL, levelWeight(s)) : 0;
  const basis = (s: number): THREE.Vector3 => {
    const a = THREE.MathUtils.clamp(s - 8, 0, routeLength - 16);
    const pa = sampleTrainCoordinate(model, a), pb = sampleTrainCoordinate(model, a + 16);
    return flat(pb[0], pb[1]).sub(flat(pa[0], pa[1])).setY(railY(a + 16) - railY(a)).normalize();
  };
  const project = (s: number) => {
    const clamped = THREE.MathUtils.clamp(s, 0, routeLength);
    const p = sampleTrainCoordinate(model, clamped);
    const v = flat(p[0], p[1]);
    if (s !== clamped) v.addScaledVector(basis(clamped), s - clamped);
    v.y = railY(clamped);
    return v;
  };
  const sideOf = (d: THREE.Vector3) => new THREE.Vector3(-d.z, 0, d.x).normalize();

  // The stop: the locomotive halts at the far end of the longest platform.
  const stationFrame = { origin: project(STATION_S), forward: basis(STATION_S) };
  const stationSide = sideOf(stationFrame.forward);
  const town = data.town;
  const platformShapes = (town?.platforms ?? []).map(platform => {
    const ring = platform.outline.map(([lon, lat]) => flat(lon, lat));
    let minA = Infinity, maxA = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const p of ring) {
      const rel = p.clone().sub(stationFrame.origin);
      const a = rel.dot(stationFrame.forward), c = rel.dot(stationSide);
      minA = Math.min(minA, a); maxA = Math.max(maxA, a); minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
    const centre = stationFrame.origin.clone().addScaledVector(stationFrame.forward, (minA + maxA) / 2).addScaledVector(stationSide, (minC + maxC) / 2);
    return { ring, centre, length: maxA - minA, width: maxC - minC, far: maxA };
  });
  const longest = platformShapes.reduce<(typeof platformShapes)[number] | null>((a, b) => (!a || b.length > a.length ? b : a), null);
  const STOP_S = STATION_S + (longest && longest.length > 60 ? longest.far - 6 : 90);

  if (terrain) {
    for (let s = STATION_S - 350; s <= STATION_S + 300; s += 70) {
      const p = project(s);
      terrain.addStamp({ x: p.x, z: p.z, inner: 60, outer: 120, base: STATION_LEVEL });
    }
  }
  // Level pads under the authored landmarks, so they neither float nor sink.
  const landmarkBase = new Map<TownLandmark, number>();
  for (const landmark of town?.landmarks ?? []) {
    const p = flat(...landmark.location);
    if (terrain) landmarkBase.set(landmark, terrain.addStamp({ x: p.x, z: p.z, inner: landmark.kind === 'park-gate' ? 20 : 34, outer: landmark.kind === 'park-gate' ? 60 : 70 }));
  }
  const WORLD_START = 0, WORLD_END = Math.floor(routeLength);
  terrain?.carveRail(project, WORLD_START, WORLD_END);
  const groundAt = (x: number, z: number) => terrain ? terrain.heightAt(x, z) : 0;
  const projectLngLat = (lon: number, lat: number) => { const v = flat(lon, lat); v.y = groundAt(v.x, v.z); return v; };

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

  const scenery = new Boxes(local);
  if (terrain) {
    const ground = terrain.build(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97, vertexColors: true }));
    ownedMaterials.add(ground.material as THREE.Material); ownedGeometry.add(ground.geometry);
    local.add(ground);
    const formation = terrain.buildFormation({ project, basis }, WORLD_START, WORLD_END, mat('#8f7c66'));
    ownedGeometry.add(formation.geometry);
    local.add(formation);
  } else {
    scenery.add([20000, 2, 20000], new THREE.Vector3(0, -1.2, 0), mat(PALETTE.soil));
  }

  const ballast = mat('#9a9084'), rail = mat('#59605f', { metalness: 0.6, roughness: 0.4 }), sleeperMaterial = mat('#6f6152');
  const layTrack = (points: THREE.Vector3[], withSleepers = true) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const d = b.clone().sub(a); if (d.length() < 0.2) continue;
      const side = sideOf(d.clone().normalize()), heading = Math.atan2(-d.z, d.x);
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
  const mainNear = (p: THREE.Vector3) => {
    let best = Infinity;
    for (const q of mainLine) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
    return best;
  };

  // ---------------------------------------------------------------------------
  // Station: real platforms and yard, held level; a Karoo station building.
  // ---------------------------------------------------------------------------
  const PLATFORM_HEIGHT = 0.95;
  const deckY = STATION_LEVEL + PLATFORM_HEIGHT;
  const heading = Math.atan2(-stationFrame.forward.z, stationFrame.forward.x);
  const deck = mat('#bcae98'), edge = mat('#e5b741'), canopy = mat(PALETTE.roofRust), iron = mat('#2f3a38', { metalness: 0.3, roughness: 0.5 });
  for (const platform of platformShapes) {
    const shape = new THREE.Shape(platform.ring.map(p => new THREE.Vector2(p.x, p.z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_HEIGHT + 1.2, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, deckY, 0);
    ownedGeometry.add(geometry);
    const mesh = new THREE.Mesh(geometry, deck); mesh.receiveShadow = true; mesh.castShadow = true;
    local.add(mesh);
    if (platform.width < 2.5) continue;
    const canopyLength = Math.min(platform.length * 0.45, 140);
    scenery.add([canopyLength, 0.2, Math.max(3, platform.width - 0.8)], platform.centre.clone().setY(deckY + 4.2), canopy, heading);
    for (let a = -canopyLength / 2 + 5; a <= canopyLength / 2 - 5; a += 14) {
      const at = platform.centre.clone().addScaledVector(stationFrame.forward, a);
      scenery.add([0.28, 4.1, 0.28], at.clone().setY(deckY + 2.05), iron, heading);
      scenery.add([2.4, 0.12, 0.6], at.clone().addScaledVector(stationFrame.forward, 4).setY(deckY + 0.46), mat('#6f4a2e'), heading);
    }
    for (const sign of [-1, 1]) scenery.add([platform.length - 2, 0.03, 0.22], platform.centre.clone().addScaledVector(stationSide, sign * (platform.width / 2 - 0.4)).setY(deckY + 0.02), edge, heading);
  }
  for (const way of town?.yard ?? []) {
    const points = way.line.map(([lon, lat]) => flat(lon, lat));
    if (points.every(p => mainNear(p) < 2.5)) continue;
    const placed = points.map(p => {
      const d = Math.hypot(p.x - stationFrame.origin.x, p.z - stationFrame.origin.z);
      return p.setY(THREE.MathUtils.lerp(groundAt(p.x, p.z) + 0.3, STATION_LEVEL, 1 - THREE.MathUtils.smoothstep(d, 320, 560)));
    });
    layTrack(placed, placed.length < 60);
  }

  // The station building takes the OSM footprint beside the platforms.
  // Here the building stands west of the line while the town lies east, so
  // it is found by size and distance, and its side is whatever side it is on.
  const footprintArea = (ring: [number, number][]) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const stationRecord = data.buildings?.buildings
    .filter(b => { const p = flat(b.lon, b.lat); return Math.hypot(p.x, p.z) < 70 && mainNear(p) > 12 && footprintArea(b.ring) > 150; })
    .sort((a, b) => footprintArea(b.ring) - footprintArea(a.ring))[0] ?? null;
  const sideTowards = (p: THREE.Vector3) => stationSide.clone().multiplyScalar(stationSide.dot(p.clone().sub(stationFrame.origin)) < 0 ? -1 : 1);
  const townSide = sideTowards(stationRecord ? flat(stationRecord.lon, stationRecord.lat) : flat(22.5831, -32.3500));
  let buildingAt = stationFrame.origin.clone().addScaledVector(townSide, 22), buildingLength = 60, buildingDepth = 14;
  if (stationRecord) {
    buildingAt = flat(stationRecord.lon, stationRecord.lat);
    let minA = Infinity, maxA = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const [east, north] of stationRecord.ring) {
      const v = new THREE.Vector3(east, 0, -north);
      minA = Math.min(minA, v.dot(stationFrame.forward)); maxA = Math.max(maxA, v.dot(stationFrame.forward));
      minC = Math.min(minC, v.dot(townSide)); maxC = Math.max(maxC, v.dot(townSide));
    }
    buildingLength = THREE.MathUtils.clamp(maxA - minA, 30, 120);
    buildingDepth = THREE.MathUtils.clamp(maxC - minC, 9, 24);
  }
  buildingAt.setY(STATION_LEVEL);
  const cream = mat(PALETTE.wallCream), roofRust = mat(PALETTE.roofRust), stoep = mat('#7a6a58');
  scenery.add([buildingLength, 6, buildingDepth], buildingAt.clone().setY(STATION_LEVEL + 3), cream, heading);
  scenery.add([buildingLength + 2, 0.5, buildingDepth + 2], buildingAt.clone().setY(STATION_LEVEL + 6.25), roofRust, heading);
  // A stoep with a lean-to veranda on the platform side: the Karoo station.
  const verandaAt = buildingAt.clone().addScaledVector(townSide, -(buildingDepth / 2 + 2.2));
  scenery.add([buildingLength, 0.18, 4.4], verandaAt.clone().setY(STATION_LEVEL + 4.2), roofRust, heading, 0);
  for (let a = -buildingLength / 2 + 3; a <= buildingLength / 2 - 3; a += 6) scenery.add([0.18, 4.2, 0.18], verandaAt.clone().addScaledVector(stationFrame.forward, a).addScaledVector(townSide, -2).setY(STATION_LEVEL + 2.1), iron, heading);
  const stationWindows = glowing('#2c3432', '#ffcf8a', 1.6);
  for (let a = -buildingLength / 2 + 4; a <= buildingLength / 2 - 4; a += 6) {
    for (const sign of [-1, 1]) scenery.add([1.8, 2.2, 0.2], buildingAt.clone().addScaledVector(stationFrame.forward, a).addScaledVector(townSide, sign * (buildingDepth / 2 + 0.05)).setY(STATION_LEVEL + 2.8), stationWindows, heading);
  }
  scenery.add([buildingLength, 0.3, 3], verandaAt.clone().setY(STATION_LEVEL + 0.15), stoep, heading);
  const board = makeBoard('BEAUFORT WEST', 'HEART OF THE KAROO · 1880');
  if (board) {
    for (const platform of platformShapes) {
      if (platform.width < 2.5) continue;
      const mesh = new THREE.Mesh(board.geometry, board.material);
      mesh.position.copy(platform.centre).setY(deckY + 2.6); mesh.rotation.y = heading;
      local.add(mesh);
    }
  }
  function makeBoard(title: string, subtitle: string) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#233c34'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#e8d9b0'; ctx.fillRect(0, 0, 1024, 12); ctx.fillRect(0, 244, 1024, 12);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fbf3de'; ctx.font = 'bold 92px serif'; ctx.fillText(title, 512, 126);
    ctx.font = '36px sans-serif'; ctx.fillStyle = '#e8d9b0'; ctx.fillText(subtitle, 512, 196);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    // Back to back, so it reads correctly from either platform.
    const front = new THREE.PlaneGeometry(8, 2), back = new THREE.PlaneGeometry(8, 2).rotateY(Math.PI);
    const geometry = mergeGeometries([front, back])!;
    front.dispose(); back.dispose();
    ownedMaterials.add(material); ownedGeometry.add(geometry);
    disposers.push(() => texture.dispose());
    return { geometry, material };
  }

  // ---------------------------------------------------------------------------
  // Landmarks. Authored models sized and oriented from their OSM outlines.
  // ---------------------------------------------------------------------------
  const landmarkRoots: THREE.Object3D[] = [];
  const landmarkAt = new Map<TownLandmark['kind'] | string, THREE.Vector3>();
  const white = mat(PALETTE.heritageWhite), slate = mat(PALETTE.roofSlate), stone = mat(PALETTE.heritageStone), trim = mat('#5e5a52');
  const gothicGlass = glowing('#2d3438', '#ffd79a', 1.2);
  /** Long axis, length and width of an outline in local metres. */
  function footprint(outline: Coordinate[] | null, fallback: [number, number]) {
    if (!outline || outline.length < 3) return { axis: new THREE.Vector3(1, 0, 0), length: fallback[0], width: fallback[1] };
    const points = outline.map(([lon, lat]) => flat(lon, lat));
    const c = points.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of points) { const dx = p.x - c.x, dz = p.z - c.z; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
    const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const across = sideOf(axis);
    let minA = Infinity, maxA = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const p of points) {
      const rel = p.clone().sub(c);
      minA = Math.min(minA, rel.dot(axis)); maxA = Math.max(maxA, rel.dot(axis));
      minC = Math.min(minC, rel.dot(across)); maxC = Math.max(maxC, rel.dot(across));
    }
    return { axis, length: maxA - minA, width: maxC - minC };
  }
  /** A gable roof as a triangular prism along +x. */
  function gable(length: number, width: number, height: number) {
    const shape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, height)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(-length / 2, 0, 0);
    ownedGeometry.add(g);
    return g;
  }
  const spireGeometry = new THREE.ConeGeometry(1, 1, 4); spireGeometry.rotateY(Math.PI / 4); ownedGeometry.add(spireGeometry);

  for (const landmark of town?.landmarks ?? []) {
    const group = new THREE.Group();
    group.name = `landmark:${landmark.title}`;
    const parts = new Boxes(group);
    const { axis, length, width } = footprint(landmark.outline, landmark.kind === 'chapel' ? [26, 13] : [14, 14]);
    const L = THREE.MathUtils.clamp(length, 8, 70), W = THREE.MathUtils.clamp(width, 6, 30);
    const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number], scale: [number, number, number] = [1, 1, 1]) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...at); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    };
    if (landmark.kind === 'church' || landmark.kind === 'chapel') {
      // Neo-Gothic Karoo church: white nave, slate gable, tower and spire at the west end.
      const big = landmark.kind === 'church';
      const wall = big ? 11 : 7, towerH = big ? 26 : 13, spireH = big ? 20 : 8, towerW = big ? 7.5 : 4.5;
      const naveL = Math.max(10, L - towerW);
      parts.add([naveL, wall, W], new THREE.Vector3(towerW / 2, wall / 2, 0), white);
      addMesh(gable(naveL + 0.6, W + 1, big ? 8 : 5), slate, [towerW / 2, wall, 0]);
      parts.add([towerW, towerH, towerW], new THREE.Vector3(-naveL / 2, towerH / 2, 0), white);
      addMesh(spireGeometry, slate, [-naveL / 2, towerH + spireH / 2, 0], [towerW * 0.75, spireH, towerW * 0.75]);
      for (let a = -naveL / 2 + towerW / 2 + 3; a < naveL / 2 + towerW / 2 - 2; a += 4.5) for (const sign of [-1, 1]) {
        parts.add([1.3, wall * 0.55, 0.15], new THREE.Vector3(a, wall * 0.5, sign * (W / 2 + 0.05)), gothicGlass);
        parts.add([0.5, wall * 0.75, 0.8], new THREE.Vector3(a + 2.2, wall * 0.38, sign * (W / 2 + 0.4)), white);
      }
      if (big) {
        const face = glowing('#f3ead4', '#fff2cf', 0.8);
        for (const sign of [-1, 1]) parts.add([2.6, 2.6, 0.12], new THREE.Vector3(-naveL / 2, towerH - 3.5, sign * (towerW / 2 + 0.07)), face);
        parts.add([0.12, 2.6, 2.6], new THREE.Vector3(-naveL / 2 - towerW / 2 - 0.07, towerH - 3.5, 0), face);
        parts.add([0.2, 5, 2.4], new THREE.Vector3(-naveL / 2 - towerW / 2 - 0.1, 2.5, 0), trim);
      }
    } else if (landmark.kind === 'museum') {
      // Cape Dutch-flavoured: whitewashed walls, dark roof, curved-gable proxies.
      parts.add([L, 6, W], new THREE.Vector3(0, 3, 0), white);
      addMesh(gable(L + 0.5, W + 0.8, 4.5), slate, [0, 6, 0]);
      for (const sign of [-1, 1]) parts.add([0.6, 8.5, W * 0.6], new THREE.Vector3(sign * (L / 2 - 0.2), 4.25, 0), white);
      parts.add([3, 7.5, 0.6], new THREE.Vector3(0, 3.75, W / 2 + 0.2), white);
      for (let a = -L / 2 + 2.5; a <= L / 2 - 2.5; a += 3.2) for (const sign of [-1, 1]) parts.add([1.2, 1.8, 0.12], new THREE.Vector3(a, 3, sign * (W / 2 + 0.05)), gothicGlass);
      parts.add([L * 0.7, 0.3, 3.5], new THREE.Vector3(0, 0.15, W / 2 + 1.8), stone);
    } else if (landmark.kind === 'blockhouse') {
      // Two-storey masonry blockhouse with loopholes and an iron roof.
      const side = Math.max(6, Math.min(L, W, 9));
      parts.add([side, 6.5, side], new THREE.Vector3(0, 3.25, 0), stone);
      addMesh(spireGeometry, mat('#77736b', { metalness: 0.3 }), [0, 7.6, 0], [side * 0.8, 2.2, side * 0.8]);
      for (let level = 0; level < 2; level++) for (let k = -1; k <= 1; k++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        parts.add([dx ? 0.1 : 0.3, 0.8, dz ? 0.1 : 0.3], new THREE.Vector3(dx * (side / 2 + 0.05) + (dz ? k * 1.8 : 0), 2 + level * 2.6, dz * (side / 2 + 0.05) + (dx ? k * 1.8 : 0)), mat('#1d1c1a'));
      }
      for (let a = 0; a < 20; a++) {
        const t0 = a / 20 * Math.PI * 2, t1 = (a + 1) / 20 * Math.PI * 2;
        parts.span(new THREE.Vector3(Math.cos(t0) * 12, 0.8, Math.sin(t0) * 12), new THREE.Vector3(Math.cos(t1) * 12, 0.8, Math.sin(t1) * 12), 0.04, 0.9, mat('#5a5650', { metalness: 0.4 }));
      }
    } else if (landmark.kind === 'park-gate') {
      // Stone gateposts and a thatched guardhouse at the SANParks gate.
      for (const sign of [-1, 1]) parts.add([1.6, 4, 1.6], new THREE.Vector3(0, 2, sign * 5), stone);
      parts.add([0.4, 0.6, 11.6], new THREE.Vector3(0, 4.2, 0), mat('#5b4331'));
      parts.add([6, 3.2, 5], new THREE.Vector3(-8, 1.6, 8), mat(PALETTE.wallCream));
      addMesh(spireGeometry, mat('#9b8454', { roughness: 1 }), [-8, 4.6, 8], [6.6, 3, 6.2]);
      const sign = makeBoard('KAROO NATIONAL PARK', 'SANPARKS · PROCLAIMED 1979');
      if (sign) { const m = new THREE.Mesh(sign.geometry, sign.material); m.position.set(3, 2.2, -8); m.rotation.y = Math.PI / 2; group.add(m); }
    }
    parts.build();
    const at = flat(...landmark.location);
    at.y = landmarkBase.get(landmark) ?? groundAt(at.x, at.z);
    group.position.copy(at);
    group.rotation.y = Math.atan2(-axis.z, axis.x);
    group.userData.landmark = landmark;
    local.add(group);
    landmarkRoots.push(group);
    landmarkAt.set(landmark.kind === 'chapel' ? landmark.title : landmark.kind, at);
  }

  // ---------------------------------------------------------------------------
  // Present-day town from OSM, minus footprints the landmarks replace.
  // ---------------------------------------------------------------------------
  const replaced = (b: { lon: number; lat: number }) => {
    const p = flat(b.lon, b.lat);
    if (stationRecord && b === stationRecord) return true;
    for (const landmark of town?.landmarks ?? []) {
      if (landmark.kind === 'park-gate') continue;
      const q = flat(...landmark.location);
      if (Math.hypot(p.x - q.x, p.z - q.z) < (landmark.kind === 'chapel' ? 12 : 20)) return true;
    }
    return false;
  };
  const city = data.buildings ? createBuildings({ ...data.buildings, buildings: data.buildings.buildings.filter(b => !replaced(b)) }, projectLngLat, (material, colour, peak) => emissive.push({ material, colour, peak })) : null;
  if (city) { for (const mesh of city.meshes) local.add(mesh); disposers.push(() => city.dispose()); }
  const roads = data.roads ? createRoads(data.roads, projectLngLat, mat('#55554f'), mat('#d3d6d8')) : null;
  if (roads?.surface) local.add(roads.surface);
  if (roads?.traffic) local.add(roads.traffic);
  if (roads) disposers.push(() => roads.dispose());
  const streetLights = data.roads ? createStreetLights(data.roads, projectLngLat, mat('#5b625f'), { groundAt, maxLights: 500 }) : null;
  if (streetLights) {
    local.add(streetLights.group);
    emissive.push({ material: streetLights.lampMaterial, colour: '#ffbf6e', peak: 3 });
    emissive.push({ material: streetLights.poolMaterial, colour: '#ffb45e', peak: 0.55 });
    disposers.push(() => streetLights.dispose());
  }
  // The Karoo main line is electrified (3 kV DC) through Beaufort West.
  const catenary = createCatenary({ project, basis }, WORLD_START, WORLD_END, mat('#57616a'), mat('#39414a'));
  local.add(catenary.group); disposers.push(() => catenary.dispose());
  const lampGreen = glowing('#1f7a42', '#3dff9a', 2.6), lampRed = glowing('#7a1f28', '#ff4a52', 2.6);
  for (const [from, to] of [[WORLD_START, STATION_S - 380], [STATION_S + 320, WORLD_END]]) {
    if (to - from < 50) continue;
    const lineside = createLineside({ project, basis }, from, to, { metal: mat('#5a636a'), concrete: mat('#b7b2a4'), cable: mat('#3b4148'), lampGreen, lampRed });
    local.add(lineside.group); disposers.push(() => lineside.dispose());
  }

  // Karoo bossies along the line: many small, irregular, low forms.
  const veld = createVegetation({ project, basis }, groundAt, WORLD_START, WORLD_END, { grass: mat(PALETTE.scrubDry), scrub: mat(PALETTE.scrub) }, 1.1);
  for (const mesh of veld.meshes) local.add(mesh);
  disposers.push(() => veld.dispose());

  // Open-plain bossies across the whole basin, and planted trees in town,
  // kept off streets and buildings.
  const random = mulberry32(1837);
  const blocked = new Set<string>();
  const cell = (x: number, z: number) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
  for (const road of data.roads?.roads ?? []) for (let i = 1; i < road.points.length; i++) {
    const a = flat(...road.points[i - 1]), b = flat(...road.points[i]);
    const n = Math.ceil(a.distanceTo(b) / 5);
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); blocked.add(cell(p.x, p.z)); }
  }
  for (const b of data.buildings?.buildings ?? []) {
    const p = flat(b.lon, b.lat);
    for (const [east, north] of b.ring) blocked.add(cell(p.x + east, p.z - north));
    blocked.add(cell(p.x, p.z));
  }
  const free = (p: THREE.Vector3) => !blocked.has(cell(p.x, p.z)) && mainNear(p) > 12;
  const bushGeometry = new THREE.IcosahedronGeometry(1, 0); ownedGeometry.add(bushGeometry);
  const bushSpots: THREE.Matrix4[] = [];
  const treeSpots: THREE.Vector3[] = [];
  // Out past the park gate, 3.4 km west: the wildlife shots look across it.
  for (let i = 0; i < 16000 && bushSpots.length < 9000; i++) {
    const p = new THREE.Vector3((random() - 0.5) * 10000, 0, (random() - 0.5) * 10000);
    if (!free(p)) continue;
    p.y = groundAt(p.x, p.z) + 0.2;
    const s = 0.35 + random() * 0.6;
    bushSpots.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(UP, random() * 6), new THREE.Vector3(s * 1.3, s * 0.7, s)));
  }
  const bushes = new THREE.InstancedMesh(bushGeometry, mat(PALETTE.scrub), bushSpots.length);
  bushSpots.forEach((m, i) => bushes.setMatrixAt(i, m));
  bushes.receiveShadow = true;
  local.add(bushes); disposers.push(() => bushes.dispose());
  const townCentre = landmarkAt.get('church') ?? stationFrame.origin;
  for (let i = 0; i < 3000 && treeSpots.length < 320; i++) {
    const p = townCentre.clone().add(new THREE.Vector3((random() - 0.5) * 2600, 0, (random() - 0.5) * 2600));
    if (!free(p) || blocked.has(cell(p.x + 6, p.z)) || blocked.has(cell(p.x - 6, p.z))) continue;
    p.y = groundAt(p.x, p.z); treeSpots.push(p);
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 5), crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  ownedGeometry.add(trunkGeometry); ownedGeometry.add(crownGeometry);
  const trunks = new THREE.InstancedMesh(trunkGeometry, mat('#5c4b3b'), treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, mat('#5d6b43'), treeSpots.length);
  const m4 = new THREE.Matrix4();
  treeSpots.forEach((p, i) => {
    const size = 0.8 + random() * 0.7;
    m4.compose(p.clone().setY(p.y + 2 * size), new THREE.Quaternion(), new THREE.Vector3(size, size, size)); trunks.setMatrixAt(i, m4);
    m4.compose(p.clone().setY(p.y + 5 * size), new THREE.Quaternion().setFromAxisAngle(UP, random() * 6), new THREE.Vector3(3.4 * size, 2.6 * size, 3.2 * size)); crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = true; crowns.castShadow = true;
  local.add(trunks, crowns); disposers.push(() => { trunks.dispose(); crowns.dispose(); });

  scenery.build();

  // ---------------------------------------------------------------------------
  // Wildlife, dust and stars.
  // ---------------------------------------------------------------------------
  const gate = landmarkAt.get('park-gate') ?? flat(22.5412222, -32.3633889);
  const plainNear = (s: number, offset: number) => {
    const p = project(s).addScaledVector(sideOf(basis(s)), offset);
    return p.setY(groundAt(p.x, p.z));
  };
  const toGate = gate.clone().sub(townCentre).setY(0).normalize();
  const herds = [
    { species: 'springbok' as const, centre: plainNear(700, -260), count: 28, spread: 70 },
    { species: 'springbok' as const, centre: gate.clone().addScaledVector(toGate, 450), count: 36, spread: 110 },
    { species: 'zebra' as const, centre: gate.clone().addScaledVector(toGate, 700).add(new THREE.Vector3(160, 0, -120)), count: 12, spread: 60 },
    { species: 'ostrich' as const, centre: plainNear(1500, 320), count: 6, spread: 40 },
    { species: 'ostrich' as const, centre: gate.clone().addScaledVector(toGate, 300).add(new THREE.Vector3(-120, 0, 140)), count: 5, spread: 30 },
  ];
  // Herd centres borrow heights from pads and track; put them on the ground.
  for (const herd of herds) herd.centre.y = groundAt(herd.centre.x, herd.centre.z);
  const wildlife = createWildlife(herds, groundAt);
  wildlife.update(0);
  local.add(wildlife.group); disposers.push(() => wildlife.dispose());
  const herdCentre = herds[1].centre;

  const DUST = 900;
  const dustPositions = new Float32Array(DUST * 3);
  const dustSeeds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPositions.set([(random() - 0.5) * 500, random() * 30, (random() - 0.5) * 500], i * 3);
    dustSeeds[i] = random();
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)); ownedGeometry.add(dustGeometry);
  const dustMaterial = new THREE.PointsMaterial({ color: '#dccaa6', size: 0.5, transparent: true, opacity: 0.4, depthWrite: false });
  ownedMaterials.add(dustMaterial);
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  root.add(dust);

  // Stars on a dome, denser along a Milky Way band. Fade in with darkness.
  const STARS = 4000;
  const starPositions = new Float32Array(STARS * 3);
  const band = new THREE.Vector3(0.3, 0.55, 0.78).normalize();
  for (let i = 0; i < STARS; i++) {
    const v = new THREE.Vector3();
    do { v.set(random() * 2 - 1, random(), random() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize();
    if (i % 2 === 0) { v.addScaledVector(band, -v.dot(band) * 0.85).normalize(); if (v.y < 0.02) v.y = 0.02 + random() * 0.3; }
    v.normalize().multiplyScalar(9000);
    starPositions.set([v.x, v.y, v.z], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3)); ownedGeometry.add(starGeometry);
  const starMaterial = new THREE.PointsMaterial({ color: '#f4f1ff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  ownedMaterials.add(starMaterial);
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false; stars.renderOrder = -1;
  root.add(stars);

  const birds = createBirds(mat('#1f1f1f'), { flocks: 4, seed: 1818 });
  for (const mesh of birds.meshes) local.add(mesh);
  disposers.push(() => birds.dispose());

  // ---------------------------------------------------------------------------
  // Train.
  // ---------------------------------------------------------------------------
  type Consist = ReturnType<typeof createConsist>;
  let consist: Consist | null = null;
  let wheels: TrainWheels | null = null;
  const poses: VehiclePose[] = [];
  const offsets: number[] = [];
  function attachTrain(vehicles: Consist, underframe: THREE.Material) {
    consist = vehicles;
    for (const vehicle of vehicles) {
      offsets.push(vehicle.offset + vehicles[0].length / 2);
      trainRoot.add(vehicle.root);
      poses.push({ position: new THREE.Vector3(), angle: 0, pitch: 0 });
    }
    wheels = new TrainWheels(vehicles.flatMap(v => v.wheelSlots), underframe);
    trainRoot.add(wheels.mesh);
  }
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
  // Camera shots, in world space.
  // ---------------------------------------------------------------------------
  function railFrame(x: number): Frame {
    const s = STOP_S - x;
    const forward = dirToWorld(basis(s)).setY(0).normalize();
    let side = new THREE.Vector3(-forward.z, 0, forward.x);
    if (side.dot(toWorld(buildingAt).sub(toWorld(project(s)))) > 0) side.negate();
    return { origin: toWorld(project(s)), forward, side };
  }
  const world = (kind: string) => toWorld(landmarkAt.get(kind) ?? townCentre);
  const up = (v: THREE.Vector3, y: number) => v.clone().setY(v.y + y);
  /** A point `r` metres from `from`, away from `towards`, raised by `y`. */
  const standOff = (from: THREE.Vector3, towards: THREE.Vector3, r: number, y: number, swing = 0) => {
    const dir = from.clone().sub(towards).setY(0).normalize().applyAxisAngle(UP, swing);
    return up(from.clone().addScaledVector(dir, r), y);
  };
  /** Direction from town to the high Nuweveld ground, read off the terrain. */
  const mountainDir = (() => {
    let best = -Infinity, dir = new THREE.Vector3(0, 0, -1);
    for (let a = 0; a < 48; a++) {
      const d = new THREE.Vector3(Math.cos(a / 48 * Math.PI * 2), 0, Math.sin(a / 48 * Math.PI * 2));
      let total = 0;
      for (const r of [5000, 6500, 8000]) { const p = townCentre.clone().addScaledVector(d, r); total += groundAt(p.x, p.z); }
      if (total > best) { best = total; dir = d; }
    }
    return dir;
  })();
  const mountainWorld = dirToWorld(mountainDir);
  const skyline = (from: THREE.Vector3, distance: number) => {
    const p = from.clone().addScaledVector(mountainDir, distance);
    return toWorld(p.setY(groundAt(p.x, p.z) + 120));
  };
  const blockhouseS = (() => {
    const b = landmarkAt.get('blockhouse');
    if (!b) return STATION_S - 600;
    let best = Infinity, along = 0;
    for (let s = 0; s <= routeLength; s += 5) { const d = project(s).distanceTo(b); if (d < best) { best = d; along = s; } }
    return along;
  })();
  const shots = {
    opening(): Shot {
      const f = railFrame(1400);
      return { position: up(f.origin.clone().addScaledVector(f.forward, -260).addScaledVector(f.side, 260), 90), target: up(world('church'), 30) };
    },
    /** Beside the blockhouse as the train runs past it. */
    blockhouse(): Shot {
      const b = world('blockhouse');
      const f = railFrame(STOP_S - blockhouseS);
      return { position: standOff(b, f.origin, 32, 7, 0.5), target: up(b.clone().lerp(f.origin, 0.4), 3) };
    },
    blockhouseX: () => STOP_S - blockhouseS,
    arrivalWide(): Shot {
      const f = railFrame(0);
      return { position: up(f.origin.clone().addScaledVector(f.forward, -90).addScaledVector(f.side, 70), 24), target: up(f.origin.clone().addScaledVector(f.forward, 140), 2) };
    },
    arrivalTrack(u: number): Shot {
      const f = railFrame(0);
      const along = THREE.MathUtils.lerp(260, 30, u);
      return {
        position: up(f.origin.clone().addScaledVector(f.forward, -along).addScaledVector(f.side, THREE.MathUtils.lerp(24, 10, u)), THREE.MathUtils.lerp(8, 4.5, u)),
        target: up(f.origin.clone().addScaledVector(f.forward, -along + 45), 2.4),
      };
    },
    church(u = 0): Shot {
      const c = world('church');
      return { position: standOff(c, toWorld(stationFrame.origin), 85, 38, -0.6 + u * 1.2), target: up(c, 16) };
    },
    museum(): Shot {
      const m = world('museum');
      return { position: standOff(m, world('church'), 42, 12, 0.9), target: up(m, 4) };
    },
    townAerial(): Shot {
      const c = world('church');
      return { position: standOff(c, toWorld(gate), 900, 420), target: up(c, 0) };
    },
    /** Past the park gate towards the escarpment, easing in. */
    karoo(u = 0): Shot {
      const g = toWorld(gate);
      const across = new THREE.Vector3(-mountainWorld.z, 0, mountainWorld.x);
      return {
        position: up(g.clone().addScaledVector(mountainWorld, -260 + u * 140).addScaledVector(across, 90 - u * 40), 55 - u * 25),
        target: skyline(gate, 5500).lerp(up(g, 4), 0.25 - u * 0.2),
      };
    },
    wildlife(): Shot {
      const h = toWorld(herdCentre);
      const dir = toWorld(gate).sub(h).setY(0).normalize();
      return { position: up(h.clone().addScaledVector(dir, -70).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(30)), 5), target: up(h, 1.2) };
    },
    /** Over the lit town towards the Nuweveld, sky filling the frame. */
    night(): Shot {
      const c = world('church');
      return { position: up(c.clone().addScaledVector(mountainWorld, -900), 140), target: up(skyline(townCentre, 7000), 350) };
    },
  };

  let starLevel = 0;
  function setDarkness(darkness: number) {
    starLevel = THREE.MathUtils.clamp((darkness - 0.3) / 0.7, 0, 1);
    starMaterial.opacity = starLevel * 0.95;
    stars.visible = starLevel > 0.01;
    dustMaterial.opacity = 0.4 * (1 - darkness * 0.8);
  }

  const cameraLocal = new THREE.Vector3();
  function update(time: number, dt: number, camera: THREE.Camera) {
    roads?.update(time);
    wildlife.update(time);
    cameraLocal.copy(toLocal(camera.position));
    birds.update(time, cameraLocal, groundAt);
    // Dust drifts downwind in a box that follows whatever the camera looks at.
    const position = dustGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < DUST; i++) {
      let x = position.getX(i) + dt * (2.2 + dustSeeds[i] * 2), y = position.getY(i) + Math.sin(time * 0.7 + i) * dt * 0.3, z = position.getZ(i) + dt * 0.8;
      if (x > 250) x -= 500; if (z > 250) z -= 500;
      if (y < 0) y += 30; if (y > 30) y -= 30;
      position.setXYZ(i, x, y, z);
    }
    position.needsUpdate = true;
    // Around the camera, not the look target: a distant box read as a smear.
    dust.position.set(camera.position.x, groundAtWorld(camera.position.x, camera.position.z), camera.position.z);
    stars.position.copy(camera.position);
  }
  function groundAtWorld(x: number, z: number) { const p = toLocal(new THREE.Vector3(x, 0, z)); return toWorld(p.setY(groundAt(p.x, p.z))).y; }

  function dispose() {
    for (const d of disposers) d();
    wheels?.dispose();
    ownedGeometry.forEach(g => g.dispose());
    ownedMaterials.forEach(m => m.dispose());
    root.clear();
  }

  return {
    root,
    trainRoot,
    emissive,
    shots,
    railFrame,
    attachTrain,
    setTrainDistance,
    setDarkness,
    landmarkRoots,
    landmarks: town?.landmarks ?? [],
    wildlifeCount: wildlife.count,
    trainRange: { min: STOP_S - routeLength + 20, max: STOP_S - 20 },
    stationRecordFound: Boolean(stationRecord),
    groundAtWorld,
    update,
    dispose,
  };
}

export type BeaufortWestWorld = ReturnType<typeof createBeaufortWestScene>;
