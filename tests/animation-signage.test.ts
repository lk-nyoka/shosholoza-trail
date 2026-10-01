import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBoard, signTexture, SIGN_STYLES } from '../app/src/animation/Signage.ts';
import { createVegetation } from '../app/src/animation/Vegetation.ts';

test('a board falls back to a plain panel when there is no DOM to draw on', () => {
  // The test runner has no document; the scene must still get a mesh rather
  // than throwing, because the same code path runs during SSR-style checks.
  assert.equal(signTexture('PRETORIA', 5, 1, SIGN_STYLES.station), null);
  const board = createBoard('PRETORIA', 5, 1, SIGN_STYLES.station);
  const material = board.mesh.material as THREE.MeshStandardMaterial;
  assert.equal(material.map, null);
  // With no lettering the board still shows its ground colour, not white.
  assert.equal(`#${material.color.getHexString()}`, SIGN_STYLES.station.background);
  board.dispose();
});

test('a board is the size it is asked for and readable from both sides', () => {
  const board = createBoard('PLATFORM 1', 3, 0.72, SIGN_STYLES.platform);
  const geometry = board.mesh.geometry as THREE.PlaneGeometry;
  assert.equal(geometry.parameters.width, 3);
  assert.equal(geometry.parameters.height, 0.72);
  assert.equal((board.mesh.material as THREE.Material).side, THREE.FrontSide);
  assert.equal(board.mesh.children.length, 1);
  assert.equal(board.mesh.children[0].rotation.y, Math.PI);
  board.dispose();
});

test('sign styles keep ink and ground distinct enough to read', () => {
  for (const [name, style] of Object.entries(SIGN_STYLES)) {
    const ink = new THREE.Color(style.ink);
    const ground = new THREE.Color(style.background);
    // Rough relative luminance; platform signs are dark-on-light and station
    // signs light-on-dark, so only the gap matters.
    const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const gap = Math.abs(luminance(ink) - luminance(ground));
    assert.ok(gap > 0.35, `${name} has only ${gap.toFixed(2)} luminance between ink and ground`);
  }
});

// --- vegetation ------------------------------------------------------------

const straightRoute = {
  project: (distance: number) => new THREE.Vector3(distance, 0, 0),
  basis: () => new THREE.Vector3(1, 0, 0),
};

function decompose(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, scale };
}

const plants = () => createVegetation(
  straightRoute, () => 0, 0, 1000,
  { grass: new THREE.MeshBasicMaterial(), scrub: new THREE.MeshBasicMaterial() },
);

test('the same seed grows the same veld twice', () => {
  const a = plants(), b = plants();
  for (const index of [0, 17, 400]) {
    assert.deepEqual(
      decompose(a.meshes[0], index).position.toArray(),
      decompose(b.meshes[0], index).position.toArray(),
      `grass ${index} should be identical between runs`,
    );
  }
  a.dispose(); b.dispose();
});

test('grass sits on the ground rather than half-buried or floating', () => {
  const ground = 37;
  const veld = createVegetation(
    straightRoute, () => ground, 0, 1000,
    { grass: new THREE.MeshBasicMaterial(), scrub: new THREE.MeshBasicMaterial() },
  );
  for (const index of [0, 5, 250]) {
    const { position, scale } = decompose(veld.meshes[0], index);
    // The cone's origin is its centre, so its base sits at y - height/2.
    const base = position.y - scale.y / 2;
    assert.ok(Math.abs(base - ground) < 1e-4, `tuft ${index} based at ${base}, ground is ${ground}`);
  }
  veld.dispose();
});

test('the veld clears the formation and stays within reach of the line', () => {
  const veld = plants();
  for (let i = 0; i < veld.counts.grass; i++) {
    const offset = Math.abs(decompose(veld.meshes[0], i).position.z);
    assert.ok(offset >= 8, `tuft ${i} at ${offset} m would be growing through the ballast`);
    assert.ok(offset <= 8 + 58, `tuft ${i} at ${offset} m is past the grass reach`);
  }
  veld.dispose();
});

test('grass is weighted toward the track rather than spread evenly', () => {
  const veld = plants();
  let near = 0;
  for (let i = 0; i < veld.counts.grass; i++) {
    if (Math.abs(decompose(veld.meshes[0], i).position.z) < 8 + 58 / 2) near++;
  }
  // An even spread would put half within half the reach; squaring the random
  // should push well past that.
  assert.ok(near / veld.counts.grass > 0.62,
    `only ${(near / veld.counts.grass * 100).toFixed(0)}% of tufts are in the near half`);
  veld.dispose();
});

test('density scales the plant count', () => {
  const sparse = createVegetation(straightRoute, () => 0, 0, 1000,
    { grass: new THREE.MeshBasicMaterial(), scrub: new THREE.MeshBasicMaterial() }, 0.5);
  const dense = plants();
  assert.ok(sparse.counts.grass < dense.counts.grass);
  assert.equal(sparse.meshes[0].count, sparse.counts.grass);
  sparse.dispose(); dense.dispose();
});
