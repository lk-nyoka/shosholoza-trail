import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrainWheels, WHEEL_RADIUS, harvestWheelSlots } from '../app/src/animation/TrainWheels.ts';
import { TimeOfDay, TIME_PRESETS, TIME_ORDER } from '../app/src/animation/TimeOfDay.ts';
import { createRoads } from '../app/src/animation/Roads.ts';

const material = () => new THREE.MeshBasicMaterial();

function decompose(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

test('wheels roll by distance over radius, and reverse when scrubbing back', () => {
  const wheels = new TrainWheels([{ vehicle: 0, along: 0 }], material());
  const pose = [{ position: new THREE.Vector3(0, 0, 0), angle: 0 }];

  wheels.update(pose, 0);
  const start = decompose(wheels.mesh, 0).quaternion.clone();

  // A quarter turn is pi/2 * r metres.
  wheels.update(pose, (Math.PI / 2) * WHEEL_RADIUS);
  const quarter = decompose(wheels.mesh, 0).quaternion;
  assert.ok(Math.abs(start.angleTo(quarter) - Math.PI / 2) < 1e-6, `rolled ${start.angleTo(quarter)}`);

  // Scrubbing back past the start rolls the other way, not forward again.
  wheels.update(pose, -(Math.PI / 2) * WHEEL_RADIUS);
  const back = decompose(wheels.mesh, 0).quaternion;
  assert.ok(Math.abs(start.angleTo(back) - Math.PI / 2) < 1e-6);
  assert.ok(quarter.angleTo(back) > Math.PI / 2 - 1e-6, 'forward and reverse must differ');
});

test('a wheelset sits on both railheads at the right height', () => {
  const wheels = new TrainWheels([{ vehicle: 0, along: 0 }], material());
  // The scene puts a vehicle's origin 0.3 m above the railhead, so a railhead
  // at y = 40 gives an origin at 40.3 and axles a wheel radius above the rail.
  const railhead = 40;
  wheels.update([{ position: new THREE.Vector3(10, railhead + 0.3, -4), angle: 0 }], 0);
  const left = decompose(wheels.mesh, 0).position;
  const right = decompose(wheels.mesh, 1).position;
  assert.equal(Math.round(left.y * 1000), Math.round((railhead + WHEEL_RADIUS) * 1000));
  assert.equal(Math.round(right.y * 1000), Math.round((railhead + WHEEL_RADIUS) * 1000));
  // Cape gauge is 1.067 m, so the two wheels are that far apart.
  assert.ok(Math.abs(left.distanceTo(right) - 1.067) < 0.01, `gauge was ${left.distanceTo(right)}`);
});

test('wheels follow the vehicle along its own heading', () => {
  const wheels = new TrainWheels([{ vehicle: 0, along: 5 }], material());
  // Heading zero points along +x, so a wheel 5 m forward sits at x = 5.
  wheels.update([{ position: new THREE.Vector3(0, 0, 0), angle: 0 }], 0);
  const ahead = decompose(wheels.mesh, 0).position;
  assert.ok(Math.abs(ahead.x - 5) < 1e-6, `x was ${ahead.x}`);
});

test('harvesting wheel slots hides the GLB nodes and measures from the body centre', () => {
  const asset = new THREE.Group();
  const wheel = new THREE.Object3D();
  wheel.name = 'Wheels1';
  wheel.position.set(4, 0.2, 0);
  const body = new THREE.Object3D();
  body.name = 'HighspeedTrain_Front';
  asset.add(wheel, body);

  const slots = harvestWheelSlots(asset, 3, 2, 1);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].vehicle, 3);
  // (4 - 1) * 2
  assert.equal(slots[0].along, 6);
  assert.equal(wheel.visible, false);
  assert.equal(body.visible, true, 'only wheels should be hidden');
});

function timeHarness() {
  const sun = new THREE.DirectionalLight();
  const hemisphere = new THREE.HemisphereLight();
  const fog = new THREE.Fog('#ffffff', 1, 2);
  const cleared: string[] = [];
  const skyCalls: string[][] = [];
  const emissive = [{ material: new THREE.MeshStandardMaterial(), colour: '#ffd9a0', peak: 2 }];
  const time = new TimeOfDay({
    sun, hemisphere, fog,
    renderer: { setClearColor: (colour: string) => cleared.push(colour) } as unknown as THREE.WebGLRenderer,
    sky: { setColours: (...args: string[]) => skyCalls.push(args) },
    emissive,
  });
  return { time, sun, hemisphere, fog, cleared, skyCalls, emissive };
}

test('every time preset drives sun, sky, fog and clear colour together', () => {
  for (const key of TIME_ORDER) {
    const h = timeHarness();
    h.time.apply(key);
    const preset = TIME_PRESETS[key];
    assert.equal(h.sun.intensity, preset.sunIntensity, `${key} sun`);
    assert.equal(h.fog.near, preset.fogNear, `${key} fog near`);
    assert.equal(h.fog.far, preset.fogFar, `${key} fog far`);
    assert.equal(h.cleared.at(-1), preset.horizon, `${key} clear colour`);
    assert.deepEqual(h.skyCalls.at(-1), [preset.zenith, preset.horizon, preset.haze], `${key} sky`);
    // Fog and the clear colour must agree, or the horizon shows a seam.
    assert.equal(`#${h.fog.color.getHexString()}`, preset.horizon.toLowerCase(), `${key} fog colour`);
  }
});

test('windows are dark at midday and lit at night', () => {
  const h = timeHarness();
  h.time.apply('day');
  assert.equal(h.emissive[0].material.emissiveIntensity, 0);
  h.time.apply('night');
  assert.equal(h.emissive[0].material.emissiveIntensity, 2);
  h.time.apply('dusk');
  assert.ok(h.emissive[0].material.emissiveIntensity > 0 && h.emissive[0].material.emissiveIntensity < 2);
});

test('the sun moves between presets rather than staying put', () => {
  const h = timeHarness();
  h.time.apply('dawn');
  const dawn = h.time.sunOffset.clone();
  h.time.apply('dusk');
  const dusk = h.time.sunOffset.clone();
  assert.ok(dawn.distanceTo(dusk) > 100, 'dawn and dusk must light the scene from different sides');
  // Both are the same distance out, so only the direction differs.
  assert.ok(Math.abs(dawn.length() - dusk.length()) < 1e-6);
});

test('traffic drives its lane and wraps instead of running off the end', () => {
  const project = (lon: number, lat: number) => new THREE.Vector3(lon * 100, 0, -lat * 100);
  const roads = createRoads({
    count: 1,
    roads: [{
      highway: 'primary', width: 10, name: 'Test Road', lengthMetres: 1000,
      points: [[0, 0], [5, 0], [10, 0]],
    }],
  }, project, material(), material());

  assert.ok(roads.surface, 'a road with two segments should produce a surface');
  assert.ok(roads.traffic, 'a road over 400 m should carry traffic');

  roads.update(0);
  const first = decompose(roads.traffic!, 0).position.clone();
  roads.update(10);
  const later = decompose(roads.traffic!, 0).position.clone();
  assert.notDeepEqual(first.toArray(), later.toArray(), 'cars should move');

  // A long way round the lane must still land on it, not past the end.
  roads.update(100_000);
  const wrapped = decompose(roads.traffic!, 0).position;
  assert.ok(wrapped.x >= -1 && wrapped.x <= 1001, `wrapped car was at x=${wrapped.x}`);
  roads.dispose();
});

test('short service roads get a surface but no traffic', () => {
  const project = (lon: number, lat: number) => new THREE.Vector3(lon, 0, -lat);
  const roads = createRoads({
    count: 1,
    roads: [{ highway: 'service', width: 4, name: null, lengthMetres: 60, points: [[0, 0], [60, 0]] }],
  }, project, material(), material());
  assert.ok(roads.surface);
  assert.equal(roads.traffic, null, 'a 60 m road would wrap a car every few seconds');
  roads.dispose();
});
