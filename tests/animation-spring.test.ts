import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpringSimulator, VectorSpringSimulator } from '../app/src/animation/spring.ts';
import * as THREE from 'three';

/** Run a spring to a target for `seconds` at a fixed framerate. */
function settle(fps: number, seconds: number, mass = 5, damping = 0.68) {
  const spring = new SpringSimulator(mass, damping, 0);
  spring.target = 100;
  const step = 1 / fps;
  for (let t = 0; t < seconds; t += step) spring.simulate(step);
  return spring.position;
}

test('a spring reaches the same place at 30, 60 and 144 fps', () => {
  // The whole point of the accumulator ported from Sketchbook's SimulatorBase.
  // A naive lerp(a, b, delta) would diverge badly here.
  const slow = settle(30, 2);
  const normal = settle(60, 2);
  const fast = settle(144, 2);
  for (const [label, value] of [['30fps', slow], ['144fps', fast]] as const) {
    assert.ok(Math.abs(value - normal) < 1.5, `${label} landed at ${value}, 60fps at ${normal}`);
  }
});

test('a spring converges on its target rather than overshooting forever', () => {
  const after = settle(60, 6);
  assert.ok(Math.abs(after - 100) < 0.5, `expected to settle on 100, got ${after}`);
});

test('reset clears momentum so camera cuts do not drift', () => {
  const spring = new SpringSimulator(5, 0.68, 0);
  spring.target = 100;
  for (let i = 0; i < 30; i++) spring.simulate(1 / 60);
  assert.notEqual(spring.velocity, 0);
  spring.reset(12);
  assert.equal(spring.position, 12);
  assert.equal(spring.velocity, 0);
  // With target and position equal, an idle frame must not move it.
  spring.simulate(1 / 60);
  assert.equal(spring.position, 12);
});

test('the vector spring damps each axis independently', () => {
  const spring = new VectorSpringSimulator(5, 0.68);
  spring.reset(new THREE.Vector3(0, 0, 0));
  spring.target.set(100, 0, -50);
  for (let i = 0; i < 240; i++) spring.simulate(1 / 60);
  assert.ok(Math.abs(spring.position.x - 100) < 0.5, `x settled at ${spring.position.x}`);
  assert.equal(spring.position.y, 0);
  assert.ok(Math.abs(spring.position.z + 50) < 0.5, `z settled at ${spring.position.z}`);
});

test('retune changes the feel without teleporting the camera', () => {
  const spring = new VectorSpringSimulator(5, 0.68);
  spring.reset(new THREE.Vector3(0, 0, 0));
  spring.target.set(100, 0, 0);
  for (let i = 0; i < 20; i++) spring.simulate(1 / 60);
  const before = spring.position.x;
  spring.retune(14, 0.8);
  spring.simulate(1 / 60);
  assert.ok(Math.abs(spring.position.x - before) < 5, 'retune must not jump the position');
});
