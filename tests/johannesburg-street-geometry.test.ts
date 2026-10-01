import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStreetLife } from '../app/src/animation/cities/johannesburg/StreetLife.ts';

function onAsphalt(x: number, z: number) {
  return ([90, 195, 300, 405, 510].some(centre => Math.abs(z - centre) <= 9.001) && x >= -510.501 && x <= 465.501)
    || (Array.from({ length: 11 }, (_, i) => -497.5 + 95 * i).some(centre => Math.abs(x - centre) <= 8.001) && z >= 80.999 && z <= 519.001);
}

test('both traffic directions stay on asphalt through a complete circuit, including corners', () => {
  const street = createStreetLife();
  try {
    const vehicles: THREE.InstancedMesh[] = [];
    street.root.traverse(object => { if (object instanceof THREE.InstancedMesh && object.name.startsWith('street-vehicles-')) vehicles.push(object); });
    assert.ok(vehicles.length > 0);
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (let time = 0; time <= 400; time += 1) {
      street.update(time);
      for (const mesh of vehicles) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        for (const x of [-.5, .5]) for (const z of [-.5, .5]) {
          point.set(x, 0, z).applyMatrix4(matrix);
          assert.ok(onAsphalt(point.x, point.z), `${mesh.name} instance ${i} leaves asphalt at ${time}s: ${point.x}, ${point.z}`);
        }
      }
    }
  } finally { street.dispose(); }
});

test('tyre bottoms meet the shared asphalt datum', () => {
  const street = createStreetLife();
  try {
    street.update(83);
    const tyres = street.root.children.find(object => object instanceof THREE.InstancedMesh && object.name.startsWith('street-vehicles-')
      && (object.material as THREE.MeshStandardMaterial).color.getHexString() === '24292b') as THREE.InstancedMesh;
    assert.ok(tyres); assert.equal(tyres.count, 56);
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (let i = 0; i < tyres.count; i++) {
      tyres.getMatrixAt(i, matrix); point.set(0, -.5, 0).applyMatrix4(matrix);
      assert.ok(Math.abs(point.y - .06) < .00001, `tyre ${i} at ${point.y}`);
    }
  } finally { street.dispose(); }
});
