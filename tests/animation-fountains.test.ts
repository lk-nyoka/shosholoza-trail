import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createFountainsValley } from '../app/src/animation/landmarks/FountainsValley.ts';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../data/landmarks/${name}.json`, import.meta.url), 'utf8'));
const fountains = load('fountains-valley');
const freedom = load('freedom-park');

/** Every key path in an object, e.g. "provenance.note". Arrays count as leaves. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

test('the landmark data has every key freedom-park.json has', () => {
  const have = new Set(keyPaths(fountains));
  for (const path of keyPaths(freedom)) assert.ok(have.has(path), `missing ${path}`);
  assert.equal(fountains.id, 'fountains-valley');
  assert.equal(fountains.scene, 'fountains-valley');
  assert.equal(fountains.alongMetres, 2591);
  assert.equal(fountains.provenance.geometry, 'approximate');
  assert.equal(fountains.provenance.cameraAnimation, 'newly authored');
});

test('it fires before the landmark and releases after it', () => {
  assert.ok(fountains.triggerDistance < fountains.alongMetres);
  assert.ok(fountains.alongMetres < fountains.releaseDistance);
});

test('keyframes are in order, within the duration, and never underground', () => {
  const { duration, keyframes } = fountains.cameraAnimation;
  assert.ok(keyframes.length >= 4);
  let previous = -Infinity;
  for (const frame of keyframes) {
    assert.ok(frame.time > previous, `time ${frame.time} not increasing`);
    assert.ok(frame.time >= 0 && frame.time <= duration, `time ${frame.time} outside [0, ${duration}]`);
    assert.ok(frame.position[1] >= 2, `camera below y=2 at t=${frame.time}`);
    assert.equal(frame.position.length, 3);
    assert.equal(frame.target.length, 3);
    previous = frame.time;
  }
});

test('the scene builds, animates and disposes', () => {
  const scene = createFountainsValley();
  assert.ok(scene.root.children.length > 0);
  assert.doesNotThrow(() => { scene.update(0); scene.update(3.7); scene.update(120); });
  assert.doesNotThrow(() => scene.dispose());
});

test('the scene stays under 25 000 triangles', () => {
  const scene = createFountainsValley();
  let triangles = 0;
  scene.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const perMesh = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    triangles += perMesh * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  console.log(`fountains valley triangles: ${triangles}`);
  assert.ok(triangles > 0);
  assert.ok(triangles < 25_000, `${triangles} triangles`);
  scene.dispose();
});
