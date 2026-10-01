// Suburban halts between Pretoria and the open line.
//
// Leaving Pretoria the train passes Fonteine and Kloofsig, real Metrorail
// stops that OpenStreetMap records beside this stretch. Running straight
// through them with nothing there made the first kilometres read as empty
// veld. They get a plain side platform, a shelter, benches, lamps and a name
// board: enough to say "a station" at train speed, nothing more.
//
// What is approximate: the layout is generic, not surveyed. Every halt gets the
// same 120 m concrete side platform on the side OSM puts the station, with its
// centre at the station's projected position; real platform lengths, island
// platforms, footbridges and access ramps are not modelled. Pretoria itself is
// excluded because it already has its own detailed station model.
import * as THREE from 'three';
import { createPostedSign, SIGN_STYLES, type Board } from './Signage.ts';

export type HaltStation = { name: string; alongMetres: number; side: number };

export type Halts = {
  group: THREE.Group;
  count: number;
  /** Lamp heads; the caller drives its emissive for night. */
  lampMaterial: THREE.MeshStandardMaterial;
  dispose(): void;
};

const PLATFORM_LENGTH = 120;
const PLATFORM_WIDTH = 4.5;
/** Platform top above rail level. */
const PLATFORM_HEIGHT = 0.9;
/** How deep the platform face goes below rail level, so it never shows a gap on a dip. */
const PLATFORM_FOOTING = 0.4;
/** Track centreline to platform edge: clear of the widest stock, as a real coping is. */
const EDGE_OFFSET = 1.7;
/** The platform is laid in short pieces so it follows the curve of the line. */
const SEGMENT = 10;
const LAMP_SPACING = 24;
const LAMP_HEIGHT = 4.2;
const SHELTER_LENGTH = 12;
const SHELTER_DEPTH = 2.6;
const SHELTER_HEIGHT = 2.7;
/** Stations this close to the start belong to Pretoria's own model. */
const DEFAULT_MIN_ALONG = 400;

/** The stations that need a halt built: named stations clear of the Pretoria terminus. */
export function selectHalts(
  places: { name: string; kind: string; alongMetres: number; side: number }[],
  minAlong = DEFAULT_MIN_ALONG,
): HaltStation[] {
  return places
    .filter(place => place.kind === 'Station' && place.alongMetres > minAlong)
    .map(place => ({ name: place.name, alongMetres: place.alongMetres, side: place.side < 0 ? -1 : 1 }))
    .sort((a, b) => a.alongMetres - b.alongMetres);
}

type Placement = { position: THREE.Vector3; heading: number; scale: [number, number, number] };

export function createHalts(
  stations: HaltStation[],
  route: { project(distance: number): THREE.Vector3; basis(distance: number): THREE.Vector3 },
  materials: { concrete: THREE.Material; structure: THREE.Material; roof: THREE.Material },
): Halts {
  const group = new THREE.Group();
  group.name = 'halts';
  const box = new THREE.BoxGeometry(1, 1, 1);
  const lampGeometry = new THREE.SphereGeometry(0.22, 10, 8);
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#e6d64a', roughness: 0.7 });
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: '#fff4d6', emissive: '#ffd99a', emissiveIntensity: 0, roughness: 0.4,
  });
  const boards: Board[] = [];

  // Pieces are collected per kind first and turned into one InstancedMesh each,
  // so any number of halts costs the same handful of draw calls.
  const platform: Placement[] = [];
  const edge: Placement[] = [];
  const structure: Placement[] = [];
  const roof: Placement[] = [];
  const heads: Placement[] = [];

  /**
   * A point in the track frame: `along` the route, `across` metres toward the
   * platform side, `up` metres above rail level at that point.
   */
  const frameAt = (along: number, across: number, up: number, sideSign: number) => {
    const centre = route.project(along);
    const forward = route.basis(along);
    const left = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const position = centre.clone().addScaledVector(left, sideSign * across);
    position.setY(centre.y + up);
    return { position, heading: Math.atan2(-forward.z, forward.x) };
  };

  const put = (list: Placement[], along: number, across: number, up: number, sideSign: number, scale: [number, number, number]) => {
    const { position, heading } = frameAt(along, across, up, sideSign);
    list.push({ position, heading, scale });
  };

  for (const station of stations) {
    const s = station.side < 0 ? -1 : 1;
    const start = station.alongMetres - PLATFORM_LENGTH / 2;
    const middle = EDGE_OFFSET + PLATFORM_WIDTH / 2;
    const back = EDGE_OFFSET + PLATFORM_WIDTH;

    // --- Platform body and the painted safety line along its edge.
    const pieces = Math.ceil(PLATFORM_LENGTH / SEGMENT);
    const bodyHeight = PLATFORM_HEIGHT + PLATFORM_FOOTING;
    for (let i = 0; i < pieces; i++) {
      const along = start + (i + 0.5) * SEGMENT;
      // A touch of overlap hides the seams where neighbouring pieces meet on a curve.
      put(platform, along, middle, PLATFORM_HEIGHT - bodyHeight / 2, s, [SEGMENT + 0.15, bodyHeight, PLATFORM_WIDTH]);
      put(edge, along, EDGE_OFFSET + 0.45, PLATFORM_HEIGHT + 0.006, s, [SEGMENT + 0.15, 0.012, 0.12]);
    }

    // --- Open-sided shelter at the middle of the platform, against the back.
    const shelterCentre = station.alongMetres;
    const shelterAcross = back - SHELTER_DEPTH / 2 - 0.3;
    for (const dx of [-SHELTER_LENGTH / 2 + 0.2, 0, SHELTER_LENGTH / 2 - 0.2]) {
      for (const dy of [-SHELTER_DEPTH / 2 + 0.15, SHELTER_DEPTH / 2 - 0.15]) {
        put(structure, shelterCentre + dx, shelterAcross + dy, PLATFORM_HEIGHT + SHELTER_HEIGHT / 2, s, [0.14, SHELTER_HEIGHT, 0.14]);
      }
    }
    // Back wall only, so passengers are sheltered from the wind but visible from the train.
    put(structure, shelterCentre, shelterAcross + SHELTER_DEPTH / 2 - 0.05, PLATFORM_HEIGHT + 1.1, s, [SHELTER_LENGTH, 1.6, 0.08]);
    put(roof, shelterCentre, shelterAcross, PLATFORM_HEIGHT + SHELTER_HEIGHT + 0.08, s, [SHELTER_LENGTH + 0.8, 0.16, SHELTER_DEPTH + 0.9]);

    // --- Benches under and beside the shelter: a seat on two legs.
    for (const dx of [-3.2, 3.2, SHELTER_LENGTH / 2 + 4]) {
      const across = shelterAcross + 0.5;
      put(structure, shelterCentre + dx, across, PLATFORM_HEIGHT + 0.45, s, [1.8, 0.06, 0.42]);
      for (const leg of [-0.75, 0.75]) {
        put(structure, shelterCentre + dx + leg, across, PLATFORM_HEIGHT + 0.21, s, [0.06, 0.42, 0.38]);
      }
    }

    // --- Lamp posts along the back of the platform, heads leaning over it.
    const lampAcross = back - 0.4;
    for (let along = start + 8; along <= start + PLATFORM_LENGTH - 8 + 1e-6; along += LAMP_SPACING) {
      put(structure, along, lampAcross, PLATFORM_HEIGHT + LAMP_HEIGHT / 2, s, [0.12, LAMP_HEIGHT, 0.12]);
      put(structure, along, lampAcross - 0.35, PLATFORM_HEIGHT + LAMP_HEIGHT - 0.04, s, [0.1, 0.08, 0.8]);
      put(heads, along, lampAcross - 0.7, PLATFORM_HEIGHT + LAMP_HEIGHT - 0.2, s, [1, 1, 1]);
    }

    // --- Name boards near each end, facing the track, as a driver sees them running in.
    for (const offset of [-PLATFORM_LENGTH / 2 + 14, PLATFORM_LENGTH / 2 - 14]) {
      const sign = createPostedSign(station.name.toUpperCase(), 4.2, 0.8, SIGN_STYLES.station, materials.structure, 1.9);
      const { position, heading } = frameAt(station.alongMetres + offset, back - 0.6, PLATFORM_HEIGHT, s);
      sign.mesh.position.copy(position);
      // Boards face local +Z, which is the left-hand side; turn them to face the rails.
      sign.mesh.rotation.set(0, heading + (s > 0 ? Math.PI : 0), 0);
      boards.push(sign);
      group.add(sign.mesh);
    }
  }

  const dummy = new THREE.Object3D();
  const instance = (list: Placement[], geometry: THREE.BufferGeometry, material: THREE.Material, castShadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((placement, index) => {
      dummy.position.copy(placement.position);
      dummy.rotation.set(0, placement.heading, 0);
      dummy.scale.set(...placement.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Instances span kilometres; the default bounds are the first instance only.
    mesh.computeBoundingSphere();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const meshes = [
    instance(platform, box, materials.concrete, true),
    instance(edge, box, edgeMaterial, false),
    instance(structure, box, materials.structure, true),
    instance(roof, box, materials.roof, true),
    instance(heads, lampGeometry, lampMaterial, false),
  ];
  meshes[0].name = 'halt-platforms';
  meshes[4].name = 'halt-lamps';

  return {
    group,
    count: stations.length,
    lampMaterial,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const board of boards) board.dispose();
      box.dispose();
      lampGeometry.dispose();
      edgeMaterial.dispose();
      lampMaterial.dispose();
    },
  };
}
