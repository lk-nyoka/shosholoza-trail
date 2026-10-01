import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCityArchitecture } from '../app/src/animation/cities/johannesburg/CityArchitecture.ts';

test('urban architecture stays inside authored blocks and has a bounded draw budget', () => {
  const city = createCityArchitecture();
  assert.ok(city.root.children.length <= 16, 'batch by material, not by building');
  const matrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  city.root.traverse(o => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    o.geometry.computeBoundingBox();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, matrix);
      bounds.copy(o.geometry.boundingBox!).applyMatrix4(matrix);
      const centre = bounds.getCenter(new THREE.Vector3());
      const blockX = -450 + Math.round((centre.x + 450) / 95) * 95;
      const blockZ = 135 + Math.round((centre.z - 135) / 105) * 105;
      assert.ok(bounds.min.x >= blockX - 36 && bounds.max.x <= blockX + 36, 'vertical street/pavement remains clear');
      assert.ok(bounds.min.z >= blockZ - 32 && bounds.max.z <= blockZ + 32, 'horizontal street/pavement remains clear');
      assert.ok(bounds.min.y >= -.001, 'no underground architecture');
      assert.ok(bounds.max.y < 140, 'skyline remains inside camera framing budget');
    }
  });
  city.dispose();
});

test('facades light at night and resources are disposed exactly once', () => {
  const city = createCityArchitecture();
  const lights = city.root.children.filter(o => o instanceof THREE.InstancedMesh && (o.material as THREE.MeshStandardMaterial).emissive.getHex() !== 0) as THREE.InstancedMesh[];
  assert.ok(lights.length >= 2, 'warm and cool occupied offices');
  city.setNight(true);
  lights.forEach(o => assert.equal((o.material as THREE.MeshStandardMaterial).emissiveIntensity, 1.8));
  city.setNight(false);
  lights.forEach(o => assert.equal((o.material as THREE.MeshStandardMaterial).emissiveIntensity, .08));
  const mesh = city.root.children[0] as THREE.InstancedMesh;
  let geometryDisposals = 0, meshDisposals = 0;
  mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  mesh.addEventListener('dispose', () => meshDisposals++);
  city.dispose(); city.dispose();
  assert.equal(geometryDisposals, 1); assert.equal(meshDisposals, 1);
});
