import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainFollowCamera, shortestAngle } from '../app/src/camera/TrainFollowCamera.ts';

const origin = { center: [28, -25] as [number, number], bearing: 359, pitch: 72, zoom: 17.7 };
test('follow lag converges equally across frame rates and crosses north by the short path', () => {
  const poses = [30, 60, 120].map(hz => {
    const camera = new TrainFollowCamera(); camera.reset(origin, 0);
    let pose = origin;
    for (let i = 1; i <= hz; i++) pose = camera.update({ ...origin, center: [28.001, -25], bearing: 1 }, i * 1000 / hz);
    assert.ok(pose.bearing > 359 && pose.bearing < 361);
    return pose;
  });
  assert.ok(Math.abs(poses[0].bearing - poses[2].bearing) < 1e-8);
  assert.ok(Math.abs(poses[0].center[0] - poses[2].center[0]) < 1e-10);
});
test('held orbit does not recenter; release waits 1.5 seconds then returns', () => {
  const camera = new TrainFollowCamera(); const target = { ...origin, bearing: 0 };
  camera.reset(target, 0); camera.drag(true, 0); camera.orbit(90, 0, 0);
  for (let time = 20; time <= 3000; time += 20) camera.update(target, time);
  assert.ok(camera.pose!.bearing > 89);
  camera.drag(false, 3000);
  for (let time = 3020; time <= 4500; time += 20) camera.update(target, time);
  assert.ok(camera.pose!.bearing > 89);
  for (let time = 4520; time <= 6500; time += 20) camera.update(target, time);
  assert.ok(Math.abs(shortestAngle(camera.pose!.bearing)) < .1);
});
test('seek clears orbit and reduced motion immediately follows the new target', () => {
  const camera = new TrainFollowCamera(); camera.reset(origin, 0); camera.orbit(100, 10, 0);
  const destination = { ...origin, center: [29, -26] as [number, number], bearing: 40 };
  camera.reset(destination, 1000);
  assert.deepEqual(camera.update(destination, 1010), destination);
  const immediate = camera.update(origin, 1011, true);
  assert.deepEqual(immediate.center, origin.center);
  assert.ok(Math.abs(shortestAngle(immediate.bearing - origin.bearing)) < 1e-10);
  assert.equal(immediate.pitch, origin.pitch);
});
