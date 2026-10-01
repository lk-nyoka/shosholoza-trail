import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { arrivalPosition, createJohannesburgScene } from '../app/src/animation/cities/johannesburg/JohannesburgScene.ts';
import { johannesburgCamera } from '../app/src/animation/cities/johannesburg/JohannesburgCamera.ts';

test('arrival brakes monotonically and stays stopped without a loop reset', () => {
  let previous = arrivalPosition(0), velocity = Infinity;
  for (let t = .1; t <= 40; t += .1) {
    const position = arrivalPosition(t), delta = position - previous;
    assert.ok(position >= previous && position <= 0);
    assert.ok(delta <= velocity + 1e-7);
    velocity = delta; previous = position;
  }
  assert.equal(arrivalPosition(-10), -340); assert.equal(arrivalPosition(1000), 0);
});

test('authored camera clears canopy geometry and has continuous stage boundaries', () => {
  for (let t = 0; t <= 32; t += .01) {
    const { position: [x, y, z] } = johannesburgCamera(t);
    const insideCanopy = Math.abs(x) < 146 && [-18, -6, 6, 18].some(c => Math.abs(z - c) < 3.8) && y > 5.23 && y < 5.47;
    assert.equal(insideCanopy, false, `camera intersects canopy at ${t}`);
  }
  for (const boundary of [12, 15, 18, 28]) {
    const a = new THREE.Vector3(...johannesburgCamera(boundary - .0001).position);
    const b = new THREE.Vector3(...johannesburgCamera(boundary + .0001).position);
    assert.ok(a.distanceTo(b) < .02);
  }
});

test('street animation continues independently of the stopped train, and disposes once', () => {
  const city = createJohannesburgScene();
  city.update(32, 32);
  const traffic = city.root.getObjectByName('street-vehicles-0') as THREE.InstancedMesh;
  const before = [...traffic.instanceMatrix.array];
  city.update(32, 40);
  assert.equal(city.trainRoot.position.x, 0);
  assert.notDeepEqual([...traffic.instanceMatrix.array], before);
  for (const value of traffic.instanceMatrix.array) assert.ok(Number.isFinite(value));
  let disposals = 0; traffic.addEventListener('dispose', () => disposals++);
  city.dispose(); city.dispose(); assert.equal(disposals, 1);
});
