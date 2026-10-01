import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStationDetails } from '../app/src/animation/cities/johannesburg/StationDetails.ts';

test('station detail geometry preserves the five running train envelopes', () => {
  const station = createStationDetails();
  station.root.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  station.root.traverse(o => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    o.geometry.computeBoundingBox();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, matrix); matrix.premultiply(o.matrixWorld);
      bounds.copy(o.geometry.boundingBox!).applyMatrix4(matrix);
      if (bounds.max.y <= .35 || bounds.min.y >= 5.6) continue;
      for (const z of [-24, -12, 0, 12, 24]) {
        const envelope = new THREE.Box3(new THREE.Vector3(-550, .36, z - 1.6), new THREE.Vector3(550, 5.59, z + 1.6));
        assert.equal(bounds.intersectsBox(envelope), false, `${o.name}:${i} intrudes on track ${z}`);
      }
    }
  });
  station.dispose();
});

test('station animation remains finite and cleanup is idempotent', () => {
  const station = createStationDetails();
  const owner = new THREE.Group(); owner.add(station.root);
  let disposed = 0;
  const geometry = new Set<THREE.BufferGeometry>();
  station.root.traverse(o => { if (o instanceof THREE.Mesh) geometry.add(o.geometry); });
  geometry.forEach(g => g.addEventListener('dispose', () => disposed++));
  for (const time of [0, 20, 10000, NaN]) { station.update(time); station.setNight(true); }
  station.root.updateMatrixWorld(true);
  station.root.traverse(o => { assert.ok(o.matrixWorld.elements.every(Number.isFinite)); });
  station.dispose(); station.dispose(); station.update(30); station.setNight(false);
  assert.equal(disposed, geometry.size); assert.equal(owner.children.length, 0);
});
