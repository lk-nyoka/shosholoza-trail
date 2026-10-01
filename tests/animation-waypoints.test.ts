import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWaypoints, type Place } from '../app/src/animation/Waypoints.ts';
import { headingPair, cumulativeDistances } from '../app/src/ride-model.ts';

const route = {
  project: (d: number) => new THREE.Vector3(d, 12, 0),
  basis: () => new THREE.Vector3(1, 0, 0),
};

const place = (name: string, kind: string, alongMetres: number, side = 1): Place =>
  ({ name, kind, lon: 0, lat: 0, alongMetres, offsetMetres: 90, side });

const places = [
  place('Pretoria', 'Station', 22),
  place('//Hapo Museum', 'Attraction', 362),
  place('Fountains Valley', 'Open space', 2591, -1),
];

test('a place announces itself inside its window and clears outside it', () => {
  const seen: (string | null)[] = [];
  const waypoints = createWaypoints({ count: places.length, places }, route, new THREE.MeshBasicMaterial(),
    passing => seen.push(passing?.name ?? null));
  assert.equal(waypoints.update(362)?.name, '//Hapo Museum');
  assert.equal(waypoints.update(1500), null, 'nothing is near the middle of the slice');
  assert.equal(waypoints.update(2591)?.name, 'Fountains Valley');
  assert.deepEqual(seen, ['//Hapo Museum', null, 'Fountains Valley']);
  waypoints.dispose();
});

test('the announcement only fires on change, not every frame', () => {
  let calls = 0;
  const waypoints = createWaypoints({ count: places.length, places }, route, new THREE.MeshBasicMaterial(), () => calls++);
  for (let d = 300; d < 420; d += 2) waypoints.update(d);
  assert.equal(calls, 1, `expected one announcement for one place, got ${calls}`);
  waypoints.dispose();
});

test('overlapping windows pick the nearest place rather than flickering', () => {
  // Two places 60 m apart: their windows overlap entirely.
  const close = [place('First', 'Attraction', 1000), place('Second', 'Attraction', 1060)];
  const waypoints = createWaypoints({ count: 2, places: close }, route, new THREE.MeshBasicMaterial(), () => {});
  assert.equal(waypoints.update(1010)?.name, 'First');
  assert.equal(waypoints.update(1050)?.name, 'Second');
  waypoints.dispose();
});

test('stations get no lineside board, because the platform already carries one', () => {
  const waypoints = createWaypoints({ count: places.length, places }, route, new THREE.MeshBasicMaterial(), () => {});
  // Two non-station places, one board each.
  assert.equal(waypoints.group.children.length, 2);
  waypoints.dispose();
});

test('boards stand on the ground beside the line, on the side the place is', () => {
  // Rail at 12 m, ground at 7 m: boards are 13 m out, past the formation, so they
  // must stand on the ground there, not on the graded rail level.
  const waypoints = createWaypoints({ count: places.length, places }, route, new THREE.MeshBasicMaterial(), () => {}, () => 7);
  const [hapo, fountains] = waypoints.group.children;
  assert.equal(hapo.position.y, 7, 'board base should sit on the ground');
  assert.ok(hapo.position.z > 0 && fountains.position.z < 0, 'side 1 and side -1 should be on opposite sides');
  waypoints.dispose();
});

test('boards on both sides of the line face the arriving train', () => {
  const waypoints = createWaypoints({ count: places.length, places }, route, new THREE.MeshBasicMaterial(), () => {});
  const [hapo, fountains] = waypoints.group.children;
  // One facing rule for both sides; a side-dependent flip turned one set away
  // and showed its double-sided text mirror-reversed.
  assert.equal(hapo.rotation.y, fountains.rotation.y);
  waypoints.dispose();
});

test('a place at the same position as a station is still announced', () => {
  const shared = [place('Pretoria', 'Station', 22), place('NZASM', 'Historic site', 22)];
  const waypoints = createWaypoints({ count: 2, places: shared }, route, new THREE.MeshBasicMaterial(), () => {});
  assert.equal(waypoints.update(22)?.name, 'NZASM', 'the station has its own signage; the heritage site needs the card');
  waypoints.dispose();
});

// --- heading at the end of the route --------------------------------------

const line: [number, number][] = [[28.18, -25.76], [28.181, -25.761], [28.182, -25.762]];
const cumulative = cumulativeDistances(line);
const total = cumulative.at(-1)!;

test('the heading pair looks ahead where the route allows', () => {
  const [from, to] = headingPair(line, cumulative, 10, 20);
  assert.notDeepEqual(from, to);
});

test('at the very end of the route the heading still has direction', () => {
  // Looking ahead from the last metre used to clamp onto the same point, and
  // atan2(0, 0) = 0 swung the camera to due north.
  const [from, to] = headingPair(line, cumulative, total, 80);
  assert.notDeepEqual(from, to, 'the pair must not collapse onto one point');
  // And it points the same way the route runs: south-east here.
  assert.ok(to[0] > from[0] && to[1] < from[1], `heading ${from} -> ${to} should run south-east`);
});
