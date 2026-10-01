import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Vector3 } from 'three';
import { PassengerWindow } from '../app/src/animation/PassengerWindow.ts';

test('window remains outside the coach shell and faces out on both sides', () => {
  const rig = new PassengerWindow(), car = new Object3D();
  for (const side of [-1, 1] as const) {
    rig.setSide(side);
    for (const dx of [-100, 0, 100]) {
      rig.look(dx, 100);
      const pose = rig.pose(car), direction = pose.target.clone().sub(pose.position).normalize();
      assert.ok(pose.position.z * side > 1.52);
      assert.ok(direction.z * side > .5);
      assert.ok(rig.pitch >= -.4 && rig.pitch <= .55);
      assert.equal(pose.fov, 62);
    }
  }
});
test('passenger camera uses the actual coach orientation and never trails into the body', () => {
  const rig = new PassengerWindow(), car = new Object3D();
  const original = rig.pose(car);
  car.position.set(150, 24, -73); car.rotation.y = 1.7;
  const pose = rig.pose(car);
  assert.ok(pose.position.distanceTo(original.position.clone().applyQuaternion(car.quaternion).add(car.position)) < 1e-9);
  const facing = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
  assert.ok(facing.dot(pose.target.clone().sub(pose.position).normalize()) > .999999);
});
test('switching sides resets head position and does not mutate the coach', () => {
  const rig = new PassengerWindow(), car = new Object3D(); rig.look(.3, .1); rig.setSide(1); rig.pose(car);
  assert.equal(rig.yaw, 0); assert.equal(rig.pitch, 0); assert.deepEqual(car.position.toArray(), [0, 0, 0]);
});
