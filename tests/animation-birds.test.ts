import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBirds } from '../app/src/animation/Birds.ts';

// Real terrain is neither flat nor at y=0; birds must ride above whatever is below.
const hilly = (x: number, _z: number) => 1300 + 20 * Math.sin(x / 100);
const origin = new THREE.Vector3(0, 1320, 0);
const flat = (p: THREE.Vector3[]) => p.flatMap((v) => v.toArray());

const sky = (seed?: number) => createBirds(new THREE.MeshBasicMaterial(), { seed });

test('the same seed and time give the same sky; a different seed does not', () => {
  const a = sky(7), b = sky(7), c = sky(8);
  for (const s of [a, b, c]) s.update(12.5, origin, hilly);
  assert.deepEqual(flat(a.positions()), flat(b.positions()));
  assert.notDeepEqual(flat(a.positions()), flat(c.positions()));
  a.dispose(); b.dispose(); c.dispose();
});

test('positions do not depend on how often update is called', () => {
  const direct = sky(), stepped = sky();
  direct.update(10, origin, hilly);
  for (let t = 0; t <= 10; t++) stepped.update(t, origin, hilly);
  assert.deepEqual(flat(direct.positions()), flat(stepped.positions()));
  direct.dispose(); stepped.dispose();
});

test('there is a small sky of loose flocks, drawn in two calls', () => {
  const birds = sky();
  assert.ok(birds.count >= 5 * 3 && birds.count <= 5 * 7, `${birds.count} birds`);
  assert.equal(birds.meshes.length, 2);
  assert.equal(birds.meshes[0].count, birds.count);
  assert.equal(birds.meshes[1].count, birds.count * 2);
  birds.dispose();
});

test('every bird flies at least 30 m above the ground below it', () => {
  const birds = sky();
  for (let t = 0; t < 200; t += 3.7) {
    birds.update(t, origin, hilly);
    for (const p of birds.positions()) {
      const clearance = p.y - hilly(p.x, p.z);
      assert.ok(clearance >= 30, `bird at ${clearance.toFixed(1)} m above ground at t=${t}`);
      assert.ok(clearance <= 130, `bird at ${clearance.toFixed(1)} m above ground at t=${t}`);
    }
  }
  birds.dispose();
});

test('flocks stay around the camera, even after it has travelled far', () => {
  const birds = sky();
  for (const centre of [origin, new THREE.Vector3(50000, 1300, 0), new THREE.Vector3(-12345, 1300, 67890)]) {
    for (let t = 0; t < 300; t += 7.3) {
      birds.update(t, centre, hilly);
      for (const p of birds.positions()) {
        const distance = Math.hypot(p.x - centre.x, p.z - centre.z);
        assert.ok(distance <= 700, `bird ${distance.toFixed(0)} m from the camera at t=${t}`);
      }
    }
  }
  birds.dispose();
});

test('birds move over time', () => {
  const birds = sky();
  birds.update(0, origin, hilly);
  const before = birds.positions();
  birds.update(1, origin, hilly);
  const after = birds.positions();
  for (let i = 0; i < birds.count; i++) {
    const moved = before[i].distanceTo(after[i]);
    // Hadedas cruise at roughly 11-16 m/s; allow for a wrap jump too.
    assert.ok(moved > 5, `bird ${i} moved only ${moved.toFixed(2)} m in a second`);
  }
  birds.dispose();
});

test('dispose releases the meshes without touching the caller material', () => {
  const material = new THREE.MeshBasicMaterial();
  let disposed = false;
  material.addEventListener('dispose', () => { disposed = true; });
  const birds = createBirds(material, { flocks: 2 });
  birds.update(3, origin, hilly);
  assert.doesNotThrow(() => birds.dispose());
  assert.equal(disposed, false);
});
