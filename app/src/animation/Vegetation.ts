// Ground cover along the corridor.
//
// The veld between the formation and the trees was bare tinted terrain, which
// reads as a golf course from the lineside camera. Highveld grassland is
// tussocky: clumps of grass with scattered low scrub between them.
//
// Two instanced meshes carry the lot. Placement is a seeded scatter, so the
// same veld appears every run and screenshots stay comparable between builds -
// and it is weighted toward the line, because that is the only place the camera
// ever gets close enough to tell.
import * as THREE from 'three';

const SEED = 20260921;
/** Grass thins out beyond this; nothing is placed past it. */
const GRASS_REACH = 58;
const SCRUB_REACH = 150;

export type VegetationCounts = { grass: number; scrub: number };

export type Vegetation = {
  meshes: THREE.InstancedMesh[];
  counts: VegetationCounts;
  dispose(): void;
};

/** Deterministic PRNG. Same seed, same veld, every run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVegetation(
  route: { project(distance: number): THREE.Vector3; basis(distance: number): THREE.Vector3 },
  groundAt: (x: number, z: number) => number,
  fromMetres: number,
  toMetres: number,
  materials: { grass: THREE.Material; scrub: THREE.Material },
  density = 1,
): Vegetation {
  const random = mulberry32(SEED);
  const dummy = new THREE.Object3D();
  const span = toMetres - fromMetres;

  const grassCount = Math.floor(span * 0.9 * density);
  const scrubCount = Math.floor(span * 0.12 * density);

  // A tussock is a squat cone; four of them at different angles per clump would
  // be better, but at these viewing distances one is indistinguishable and
  // costs a quarter as much.
  const grassGeometry = new THREE.ConeGeometry(0.42, 1, 5, 1, true);
  const scrubGeometry = new THREE.IcosahedronGeometry(1, 0);

  const grass = new THREE.InstancedMesh(grassGeometry, materials.grass, grassCount);
  const scrub = new THREE.InstancedMesh(scrubGeometry, materials.scrub, scrubCount);
  grass.receiveShadow = true;
  scrub.castShadow = true;
  scrub.receiveShadow = true;

  /** A point beside the line at a given route position and lateral offset. */
  const beside = (distance: number, offset: number) => {
    const centre = route.project(distance);
    const forward = route.basis(distance);
    const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    return centre.clone().addScaledVector(side, offset);
  };

  for (let i = 0; i < grassCount; i++) {
    const along = fromMetres + random() * span;
    // Squaring the random pushes most tufts toward the track, where the camera
    // passes, instead of spreading them evenly across ground nobody sees.
    const lateral = (8 + random() ** 2 * GRASS_REACH) * (random() < 0.5 ? -1 : 1);
    const at = beside(along, lateral);
    const ground = groundAt(at.x, at.z);
    const height = 0.42 + random() * 0.55;
    dummy.position.set(at.x, ground + height / 2, at.z);
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.22);
    dummy.scale.set(0.7 + random() * 0.6, height, 0.7 + random() * 0.6);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < scrubCount; i++) {
    const along = fromMetres + random() * span;
    const lateral = (14 + random() ** 1.6 * SCRUB_REACH) * (random() < 0.5 ? -1 : 1);
    const at = beside(along, lateral);
    const ground = groundAt(at.x, at.z);
    const size = 0.7 + random() * 1.3;
    dummy.position.set(at.x, ground + size * 0.45, at.z);
    dummy.rotation.set(random() * 0.6, random() * Math.PI * 2, random() * 0.6);
    // Wider than tall, the way a wind-pruned bush sits.
    dummy.scale.set(size * 1.25, size * 0.7, size * 1.15);
    dummy.updateMatrix();
    scrub.setMatrixAt(i, dummy.matrix);
  }
  scrub.instanceMatrix.needsUpdate = true;

  return {
    meshes: [grass, scrub],
    counts: { grass: grassCount, scrub: scrubCount },
    dispose() {
      grassGeometry.dispose();
      scrubGeometry.dispose();
      grass.dispose();
      scrub.dispose();
    },
  };
}
