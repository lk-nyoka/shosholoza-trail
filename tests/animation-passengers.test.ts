import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPassengers, platformSpots, BENCH_SEAT_HEIGHT, type PassengerSpot } from '../app/src/animation/Passengers.ts';

/**
 * A stand-in for the boxman GLB: a skinned box 0.5 units tall standing on its
 * origin (deliberately not metres, so the scale has to be measured), two bones,
 * and clips that wiggle the second, unweighted bone.
 */
function fakeGltf(clipNames = ['idle', 'sitting']) {
  const geometry = new THREE.BoxGeometry(0.2, 0.5, 0.1).translate(0, 0.25, 0);
  const vertices = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(vertices * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(
    Array.from({ length: vertices * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const hips = new THREE.Bone();
  hips.name = 'hips';
  const head = new THREE.Bone();
  head.name = 'head';
  head.position.y = 0.4;
  hips.add(head);
  mesh.add(hips);
  mesh.bind(new THREE.Skeleton([hips, head]));
  const scene = new THREE.Group();
  scene.add(mesh);
  const animations = clipNames.map(name => new THREE.AnimationClip(name, 1, [
    new THREE.NumberKeyframeTrack('head.position[y]', [0, 0.5, 1], [0.4, 0.42, 0.4]),
  ]));
  const gltf = { scene, scenes: [scene], animations, cameras: [], asset: {}, parser: null, userData: {} } as unknown as GLTF;
  return { gltf, material, geometry };
}

const benches = [{ x: -55, z: -14 }, { x: -30, z: -14 }, { x: 24, z: -14 }, { x: 44, z: -14 }];
const spotOptions = { xFrom: -80, xTo: 60, z: -12, depth: 3, top: 0.45, standing: 9, benches, seed: 7 };

const standingOnly = (count: number, y = 3.2): PassengerSpot[] => Array.from({ length: count }, (_, i) => ({
  position: new THREE.Vector3(i * 2, y, 0), facing: i * 0.4, pose: 'standing' as const,
}));

function personBox(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root, true);
}

test('platformSpots spreads standing people along the platform and seats one per bench', () => {
  const spots = platformSpots(spotOptions);
  const standing = spots.filter(spot => spot.pose === 'standing');
  const sitting = spots.filter(spot => spot.pose === 'sitting');
  assert.equal(standing.length, 9);
  assert.equal(sitting.length, benches.length);
  for (const spot of standing) {
    assert.ok(spot.position.x >= -80 && spot.position.x <= 60, `x ${spot.position.x}`);
    assert.equal(spot.position.y, 0.45);
    assert.ok(Math.abs(spot.position.z - -12) <= 1.5 + 1e-9);
    assert.ok(Number.isFinite(spot.facing));
  }
  sitting.forEach((spot, i) => {
    assert.ok(Math.abs(spot.position.x - benches[i].x) <= 1, 'near its bench');
    assert.equal(spot.position.z, benches[i].z);
    assert.ok(Math.abs(spot.position.y - (0.45 + BENCH_SEAT_HEIGHT)) < 1e-9);
  });
});

test('platformSpots is deterministic for a seed and varies with it', () => {
  const plain = (spots: PassengerSpot[]) => spots.map(s => [...s.position.toArray(), s.facing, s.pose]);
  assert.deepEqual(plain(platformSpots(spotOptions)), plain(platformSpots(spotOptions)));
  assert.notDeepEqual(plain(platformSpots(spotOptions)), plain(platformSpots({ ...spotOptions, seed: 8 })));
});

test('createPassengers makes one ~1.72 m person per spot, feet on the spot', () => {
  const { gltf } = fakeGltf();
  const spots = standingOnly(5);
  const passengers = createPassengers(gltf, spots, { seed: 3 });
  assert.equal(passengers.count, spots.length);
  assert.equal(passengers.group.children.length, spots.length);
  passengers.group.children.forEach((person, i) => {
    const box = personBox(person);
    const height = box.max.y - box.min.y;
    assert.ok(Math.abs(height - 1.72) / 1.72 < 0.05, `height ${height}`);
    assert.ok(Math.abs(box.min.y - spots[i].position.y) < 0.02, `feet ${box.min.y}`);
    assert.ok(Math.abs(person.rotation.y - spots[i].facing) < 1e-9);
  });
  passengers.dispose();
});

test('sitting people rest on the seat and the mixed crowd builds', () => {
  const { gltf } = fakeGltf();
  const spots = platformSpots(spotOptions);
  const passengers = createPassengers(gltf, spots);
  assert.equal(passengers.count, spots.length);
  passengers.group.children.forEach((person, i) => {
    assert.ok(person.position.distanceTo(spots[i].position) < 1e-9);
  });
  passengers.dispose();
});

test('every person has their own material; recolouring one leaves the others alone', () => {
  const { gltf, material } = fakeGltf();
  const passengers = createPassengers(gltf, standingOnly(4));
  const materials: THREE.MeshStandardMaterial[] = [];
  passengers.group.traverse(object => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) materials.push((object as THREE.SkinnedMesh).material as THREE.MeshStandardMaterial);
  });
  assert.equal(materials.length, 4, 'one skinned mesh (one draw call) per person');
  assert.equal(new Set(materials).size, 4);
  assert.ok(!materials.includes(material));
  const before = materials[1].color.clone();
  materials[0].color.set('#ff00ff');
  assert.ok(materials[1].color.equals(before));
  assert.ok(material.color.equals(new THREE.Color('#ffffff')), 'source material untouched');
  passengers.dispose();
});

test('update runs and dispose leaves the source material and geometry alone', () => {
  const { gltf, material, geometry } = fakeGltf();
  let materialDisposed = false;
  let geometryDisposed = false;
  material.addEventListener('dispose', () => { materialDisposed = true; });
  geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  const passengers = createPassengers(gltf, platformSpots(spotOptions));
  assert.doesNotThrow(() => passengers.update(0.1));
  for (let i = 0; i < 400; i++) passengers.update(0.1);
  assert.doesNotThrow(() => passengers.dispose());
  assert.equal(materialDisposed, false);
  assert.equal(geometryDisposed, false);
  assert.equal(passengers.group.children.length, 0);
});

test('turning people swing about their facing with rotate clips present', () => {
  const { gltf } = fakeGltf(['idle', 'sitting', 'rotate_left', 'rotate_right']);
  const spots = standingOnly(30);
  const passengers = createPassengers(gltf, spots, { seed: 11 });
  for (let i = 0; i < 600; i++) passengers.update(0.1);
  const turned = passengers.group.children.filter((person, i) => Math.abs(person.rotation.y - spots[i].facing) > 1e-6);
  assert.ok(turned.length > 0, 'someone turned');
  assert.ok(turned.length < spots.length, 'most people just stand');
  passengers.group.children.forEach((person, i) => {
    assert.ok(Math.abs(person.rotation.y - spots[i].facing) <= 0.9 + 1e-6);
  });
  passengers.dispose();
});

test('missing clip names fall back to the first clip without throwing', () => {
  const { gltf } = fakeGltf(['wave']);
  const passengers = createPassengers(gltf, platformSpots(spotOptions));
  assert.doesNotThrow(() => passengers.update(0.1));
  passengers.dispose();
  const bare = fakeGltf([]).gltf;
  const still = createPassengers(bare, standingOnly(2));
  assert.doesNotThrow(() => still.update(0.1));
  still.dispose();
});
