import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createVoortrekkerMonument } from '../app/src/animation/landmarks/VoortrekkerMonument.ts';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../data/landmarks/${name}.json`, import.meta.url), 'utf8'));
const monument = load('voortrekker-monument');
const fountains = load('fountains-valley');

/** Every key path in an object, e.g. "provenance.note". Arrays count as leaves. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

test('the landmark data has every key fountains-valley.json has', () => {
  const have = new Set(keyPaths(monument));
  for (const path of keyPaths(fountains)) assert.ok(have.has(path), `missing ${path}`);
  assert.equal(monument.id, 'voortrekker-monument');
  assert.equal(monument.scene, 'voortrekker-monument');
  assert.equal(monument.alongMetres, 2366);
  assert.equal(monument.offsetMetres, 1736);
  assert.equal(monument.provenance.geometry, 'approximate');
  assert.equal(monument.provenance.cameraAnimation, 'newly authored');
  assert.ok(monument.footprint.inner > 0 && monument.footprint.inner < monument.footprint.outer);
});

test('it fires before the landmark, releases after it, and clears Fountains Valley', () => {
  assert.ok(monument.triggerDistance < monument.alongMetres);
  assert.ok(monument.alongMetres < monument.releaseDistance);
  assert.ok(monument.releaseDistance < fountains.triggerDistance, 'would overlap the Fountains Valley trigger');
  assert.ok(monument.releaseDistance < 2520);
});

test('keyframes are in order, within the duration, and clear the wall and terrace', () => {
  const { duration, keyframes } = monument.cameraAnimation;
  assert.ok(duration <= 10, `duration ${duration} too long for the window before Fountains Valley`);
  assert.ok(keyframes.length >= 4);
  let previous = -Infinity;
  for (const frame of keyframes) {
    assert.ok(frame.time > previous, `time ${frame.time} not increasing`);
    assert.ok(frame.time >= 0 && frame.time <= duration, `time ${frame.time} outside [0, ${duration}]`);
    assert.ok(frame.position[1] >= 8, `camera below y=8 at t=${frame.time}`);
    assert.equal(frame.position.length, 3);
    assert.equal(frame.target.length, 3);
    previous = frame.time;
  }
});

test('the scene builds, animates and disposes', () => {
  const scene = createVoortrekkerMonument();
  assert.ok(scene.root.children.length > 0);
  assert.doesNotThrow(() => { scene.update(0); scene.update(3.7); scene.update(120); });
  assert.doesNotThrow(() => scene.dispose());
});

test('the scene stays under 20 000 triangles', () => {
  const scene = createVoortrekkerMonument();
  let triangles = 0;
  scene.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const perMesh = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    triangles += perMesh * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  console.log(`voortrekker monument triangles: ${triangles}`);
  assert.ok(triangles > 0);
  assert.ok(triangles < 20_000, `${triangles} triangles`);
  scene.dispose();
});

test('the monument stands between 35 and 50 m tall', () => {
  const scene = createVoortrekkerMonument();
  scene.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene.root);
  console.log(`voortrekker monument height: ${bounds.max.y.toFixed(2)} m`);
  assert.ok(bounds.min.y >= -0.01, `geometry below the floor: ${bounds.min.y}`);
  assert.ok(bounds.max.y >= 35 && bounds.max.y <= 50, `height ${bounds.max.y}`);
  scene.dispose();
});
