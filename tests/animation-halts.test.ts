import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHalts, selectHalts } from '../app/src/animation/Halts.ts';

const RAIL = 40;

// A straight line at a raised rail level: catches anything placed at an
// absolute height instead of relative to the graded track.
const raisedRoute = {
  project: (distance: number) => new THREE.Vector3(distance, RAIL, 0),
  basis: () => new THREE.Vector3(1, 0, 0),
};

const materials = () => ({
  concrete: new THREE.MeshStandardMaterial(),
  structure: new THREE.MeshStandardMaterial(),
  roof: new THREE.MeshStandardMaterial(),
});

function instances(mesh: THREE.InstancedMesh) {
  const matrix = new THREE.Matrix4();
  const out: { position: THREE.Vector3; scale: THREE.Vector3 }[] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    out.push({ position, scale });
  }
  return out;
}

const platformsOf = (group: THREE.Group) =>
  group.getObjectByName('halt-platforms') as THREE.InstancedMesh;

test('selectHalts keeps the suburban stops and leaves Pretoria to its own model', () => {
  const places = [
    { name: 'Pretoria', kind: 'Station', alongMetres: 22, side: -1 },
    { name: 'Pretoria Gautrain Station', kind: 'Station', alongMetres: 87, side: -1 },
    { name: 'NZASM', kind: 'Heritage', alongMetres: 300, side: 1 },
    { name: 'Kloofsig', kind: 'Station', alongMetres: 6240, side: -1 },
    { name: 'Fonteine', kind: 'Station', alongMetres: 2799, side: 1 },
    { name: 'Fountains Valley', kind: 'Park', alongMetres: 3500, side: 1 },
  ];
  const halts = selectHalts(places);
  assert.deepEqual(halts.map(h => h.name), ['Fonteine', 'Kloofsig']);
  assert.deepEqual(halts.map(h => h.side), [1, -1]);
  // The threshold is a parameter, not a constant baked in.
  assert.equal(selectHalts(places, 50).length, 3);
});

test('the platform stands on the graded rail level, not on y = 0', () => {
  const halts = createHalts([{ name: 'Fonteine', alongMetres: 500, side: 1 }], raisedRoute, materials());
  const pieces = instances(platformsOf(halts.group));
  assert.ok(pieces.length >= 10, `platform laid as ${pieces.length} pieces; it should follow the curve`);
  for (const { position, scale } of pieces) {
    const top = position.y + scale.y / 2;
    assert.ok(Math.abs(top - (RAIL + 0.9)) < 0.05, `platform top at ${top}, rail is ${RAIL}`);
  }
  // Nothing in the halt should have fallen to the world origin's height.
  halts.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(halts.group);
  assert.ok(bounds.min.y > RAIL - 2, `lowest point ${bounds.min.y} is far below the rail`);
  halts.dispose();
});

test('the platform is on the side the station lies on, clear of the train', () => {
  const left = createHalts([{ name: 'A', alongMetres: 500, side: 1 }], raisedRoute, materials());
  const right = createHalts([{ name: 'B', alongMetres: 500, side: -1 }], raisedRoute, materials());
  const nearEdge = (halts: ReturnType<typeof createHalts>) =>
    instances(platformsOf(halts.group)).map(({ position, scale }) => Math.abs(position.z) - scale.z / 2);
  const zOf = (halts: ReturnType<typeof createHalts>) => instances(platformsOf(halts.group))[0].position.z;
  assert.ok(zOf(left) > 0);
  assert.ok(zOf(right) < 0);
  for (const edge of [...nearEdge(left), ...nearEdge(right)]) {
    assert.ok(Math.abs(edge - 1.7) < 0.05, `platform edge ${edge} m from the centreline`);
  }
  left.dispose(); right.dispose();
});

test('one halt per station, and dispose releases cleanly', () => {
  const halts = createHalts(
    [{ name: 'Fonteine', alongMetres: 2799, side: 1 }, { name: 'Kloofsig', alongMetres: 6240, side: -1 }],
    raisedRoute, materials(),
  );
  assert.equal(halts.count, 2);
  assert.ok(halts.lampMaterial instanceof THREE.MeshStandardMaterial);
  assert.doesNotThrow(() => halts.dispose());

  const empty = createHalts([], raisedRoute, materials());
  assert.equal(empty.count, 0);
  assert.doesNotThrow(() => empty.dispose());
});
