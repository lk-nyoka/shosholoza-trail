import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JourneyDirector, type LandmarkDefinition } from '../app/src/animation/JourneyDirector.ts';
import { CinematicCamera } from '../app/src/animation/CinematicCamera.ts';

const definition: LandmarkDefinition = {
  id: 'test-place', name: 'Test Place',
  location: { lat: -25.76, lon: 28.18 },
  alongMetres: 260, triggerDistance: 190, releaseDistance: 700,
  scene: 'test',
  provenance: { geometry: 'approximate', cameraAnimation: 'newly authored', note: '' },
  tourism: { eyebrow: '', title: '', body: '', credit: '' },
  cameraAnimation: {
    duration: 4,
    keyframes: [
      { time: 0, position: [0, 10, 0], target: [0, 0, 0], fov: 40 },
      { time: 4, position: [20, 10, 0], target: [0, 0, 0], fov: 50 },
    ],
  },
};

const stubScene = () => ({ root: new THREE.Group(), update() {}, dispose() {} });
const pose = () => ({
  position: new THREE.Vector3(0, 5, 0), target: new THREE.Vector3(0, 0, 5),
  quaternion: new THREE.Quaternion(), fov: 45,
});

function director() {
  const d = new JourneyDirector(() => {});
  const scene = stubScene();
  d.register(definition, scene, scene.root, 45);
  return d;
}

test('a landmark fires when the route position crosses its trigger, not before', () => {
  const d = director();
  // Approaching, still short of 190 m.
  assert.equal(d.update(100, 0.016, pose(), 0).mode, 'follow');
  assert.equal(d.update(180, 0.016, pose(), 0).mode, 'follow');
  // Crossing it in one step, as a dropped frame at speed would.
  assert.equal(d.update(210, 0.016, pose(), 0).mode, 'approach');
});

test('a step straight over the trigger still fires it', () => {
  const d = director();
  // 0 -> 400 m in one update. A proximity radius would miss this entirely.
  assert.equal(d.update(400, 0.016, pose(), 0).mode, 'approach');
});

test('a landmark does not re-fire while the train is still beside it', () => {
  const d = director();
  d.update(210, 0.016, pose(), 0);
  d.release(pose(), pose);
  // Run the return transition out.
  for (let i = 0; i < 400; i++) d.update(300, 0.016, pose(), 0);
  assert.equal(d.update(320, 0.016, pose(), 0).mode, 'follow', 'should not retrigger inside the zone');
});

test('rewinding past the trigger rearms the landmark so it can replay', () => {
  const d = director();
  d.update(210, 0.016, pose(), 0);
  d.release(pose(), pose);
  for (let i = 0; i < 400; i++) d.update(300, 0.016, pose(), 0);
  // Scrub back before the trigger, then forward across it again.
  d.seek(0);
  d.update(0, 0.016, pose(), 0);
  assert.equal(d.update(210, 0.016, pose(), 0).mode, 'approach');
});

test('a cinematic reports finished once its take has played out', () => {
  const d = director();
  d.update(210, 0.016, pose(), 0);
  // Push through the approach transition and then the 4 s take.
  for (let i = 0; i < 600; i++) d.update(210, 0.016, pose(), 0);
  assert.equal(d.finished, true);
});

test('keyframes interpolate position and fov, and hold outside the take', () => {
  const host = new THREE.Group();
  host.updateMatrixWorld(true);
  const camera = new CinematicCamera(definition.cameraAnimation, host, 45);
  const start = camera.sample(0);
  assert.equal(start.fov, 40);
  assert.equal(start.position.x, 0);
  const middle = camera.sample(2);
  assert.ok(middle.position.x > 0 && middle.position.x < 20, `midpoint x was ${middle.position.x}`);
  assert.ok(middle.fov > 40 && middle.fov < 50);
  // Past the end it holds the last frame rather than extrapolating.
  assert.equal(camera.sample(99).position.x, 20);
});

test('an explicit quaternion is used verbatim rather than re-derived', () => {
  const host = new THREE.Group();
  host.updateMatrixWorld(true);
  const supplied = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, 0));
  const camera = new CinematicCamera({
    duration: 1,
    keyframes: [{ time: 0, position: [5, 5, 5], quaternion: supplied.toArray() as [number, number, number, number], fov: 40 }],
  }, host, 45);
  const sampled = camera.sample(0);
  assert.ok(sampled.quaternion.angleTo(supplied) < 1e-6, 'supplied orientation must survive untouched');
});

test('scrubbing cancels a cinematic and its transition without a stale return pose',()=>{const d=director();d.update(210,.016,pose(),0);assert.equal(d.busy,true);d.cancel();d.seek(900);const state=d.update(900,.016,pose(),0);assert.equal(state.mode,'follow');assert.equal(state.pose,null);assert.equal(state.landmark,null);assert.equal(d.finished,false);d.dispose();});

test('pause freezes approach pose even when the following train target changes',()=>{const d=director();const first=d.update(210,.25,pose(),0);d.pause(true);const moved=pose();moved.position.x=100;for(let i=0;i<30;i++){const state=d.update(220+i,1,moved,i);assert.equal(state.mode,'approach');assert.deepEqual(state.pose?.position.toArray(),first.pose?.position.toArray());}d.pause(false);assert.notDeepEqual(d.update(250,.25,moved,0).pose?.position.toArray(),first.pose?.position.toArray());d.dispose();});
test('pause freezes return and cancellation clears paused state',()=>{const d=director();d.update(210,.1,pose(),0);d.release(pose(),pose);const first=d.update(210,.25,pose(),0);d.pause(true);assert.deepEqual(d.update(210,50,pose(),0).pose?.position.toArray(),first.pose?.position.toArray());assert.equal(d.state.mode,'return');d.cancel();d.playById('test-place',pose());for(let i=0;i<30;i++)d.update(210,.25,pose(),0);assert.notEqual(d.state.mode,'approach');d.dispose();});
