import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationMotion } from '../app/src/animation/cities/johannesburg/StationMotion.ts';
test('station motion dwells and departs continuously with distance consistent with speed', () => {
  for (const time of [24, 28, 32]) assert.deepEqual(stationMotion(time), { x: 0, speed: 0, phase: 'dwell' });
  let previous = 0;
  for (let t = 32.1; t < 64; t += .1) {
    const motion = stationMotion(t); assert.ok(motion.x >= previous); previous = motion.x;
    const derivative = (stationMotion(t + .0001).x - stationMotion(t - .0001).x) / .0002;
    assert.ok(Math.abs(derivative - motion.speed) < .001);
  }
  assert.equal(stationMotion(64).x, 504);
  assert.equal(stationMotion(100).phase, 'complete');
});
