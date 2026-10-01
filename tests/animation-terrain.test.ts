import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Terrain, type TerrainData } from '../app/src/animation/Terrain.ts';
import { findCrossings, createLevelCrossings } from '../app/src/animation/LevelCrossings.ts';

/** A 4x4 corridor that rises west to east, with a spike in one corner. */
function terrainData(): TerrainData {
  const grid = 4;
  const heights: number[] = [];
  for (let row = 0; row < grid; row++) {
    for (let column = 0; column < grid; column++) heights.push(1000 + column * 10);
  }
  return {
    grid,
    bounds: { west: 0, east: 0.01, south: -0.01, north: 0 },
    minMetres: 1000, maxMetres: 1030,
    routeSampleStride: 1,
    // A jagged profile: a real line would never follow this.
    alongRoute: [1000, 1020, 1000, 1020, 1000, 1020, 1000],
    heights,
  };
}

const project = (lon: number, lat: number) => new THREE.Vector3(lon * 100_000, 0, -lat * 100_000);

test('the datum puts the start of the route at zero', () => {
  const terrain = new Terrain(terrainData(), project, 600);
  assert.equal(terrain.datum, 1000);
  // Smoothing pulls the start up off the raw 1000, but only a little.
  assert.ok(Math.abs(terrain.railAt(0)) < 12, `start was ${terrain.railAt(0)}`);
});

test('the rail profile is graded, not draped over every undulation', () => {
  const data = terrainData();
  const terrain = new Terrain(data, project, 600);
  const raw = data.alongRoute;
  const rawSwing = Math.max(...raw) - Math.min(...raw);

  const sampled: number[] = [];
  for (let s = 0; s <= 600; s += 25) sampled.push(terrain.railAt(s));
  const gradedSwing = Math.max(...sampled) - Math.min(...sampled);

  assert.ok(gradedSwing < rawSwing / 2,
    `graded swing ${gradedSwing.toFixed(1)} m should be far under the raw ${rawSwing} m`);
});

test('ground height interpolates between samples and is flat where the data is', () => {
  const terrain = new Terrain(terrainData(), project, 600);
  const topLeft = project(0, 0);
  const bottomRight = project(0.01, -0.01);
  const midX = (topLeft.x + bottomRight.x) / 2;
  const midZ = (topLeft.z + bottomRight.z) / 2;

  // The test grid rises only with longitude, so north-south is flat.
  const a = terrain.heightAt(midX, topLeft.z + 1);
  const b = terrain.heightAt(midX, bottomRight.z - 1);
  assert.ok(Math.abs(a - b) < 0.5, `north ${a} and south ${b} should match`);

  // West to east it climbs, and the midpoint sits between the ends.
  const west = terrain.heightAt(topLeft.x + 1, midZ);
  const east = terrain.heightAt(bottomRight.x - 1, midZ);
  const middle = terrain.heightAt(midX, midZ);
  assert.ok(east > west, `east ${east} should be above west ${west}`);
  assert.ok(middle > west && middle < east, `midpoint ${middle} should sit between`);
});

test('ground height outside the baked grid is zero rather than wrapping', () => {
  const terrain = new Terrain(terrainData(), project, 600);
  assert.equal(terrain.heightAt(-999_999, 0), 0);
  assert.equal(terrain.heightAt(999_999, 0), 0);
});

test('the ground mesh carries one vertex per sample, displaced and tinted', () => {
  const data = terrainData();
  const terrain = new Terrain(data, project, 600);
  const mesh = terrain.build(new THREE.MeshBasicMaterial());
  const position = mesh.geometry.attributes.position;
  assert.equal(position.count, data.grid * data.grid);
  assert.ok(mesh.geometry.attributes.color, 'tinting should be baked into vertex colours');
  assert.equal(mesh.receiveShadow, true);
});

// --- level crossings -------------------------------------------------------

const line = (points: [number, number][]) => points.map(([x, z]) => new THREE.Vector3(x, 0, z));

test('a road crossing the line produces exactly one crossing', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const sites = findCrossings(rail, [{ points: line([[0, -50], [0, 50]]), width: 8 }]);
  assert.equal(sites.length, 1);
  assert.ok(Math.abs(sites[0].position.x) < 1e-6, `crossed at x=${sites[0].position.x}`);
  assert.equal(sites[0].width, 8);
});

test('a road running alongside the line never produces a crossing', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const sites = findCrossings(rail, [{ points: line([[-100, 25], [100, 25]]), width: 8 }]);
  assert.equal(sites.length, 0);
});

test('a road that stops short of the line does not count as crossing it', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const sites = findCrossings(rail, [{ points: line([[0, -50], [0, -5]]), width: 8 }]);
  assert.equal(sites.length, 0);
});

test('two roads meeting the line a few metres apart are one crossing, not two', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const sites = findCrossings(rail, [
    { points: line([[0, -50], [0, 50]]), width: 8 },
    { points: line([[6, -50], [6, 50]]), width: 8 },
  ]);
  assert.equal(sites.length, 1, 'a 6 m gap is the same junction');
});

test('crossings well apart are kept separately', () => {
  const rail = line([[-200, 0], [200, 0]]);
  const sites = findCrossings(rail, [
    { points: line([[-120, -50], [-120, 50]]), width: 8 },
    { points: line([[120, -50], [120, 50]]), width: 8 },
  ]);
  assert.equal(sites.length, 2);
});

test('crossing lamps only light when the train is close', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const sites = findCrossings(rail, [{ points: line([[0, -50], [0, 50]]), width: 8 }]);
  const lamp = new THREE.MeshStandardMaterial();
  const crossings = createLevelCrossings(sites, {
    deck: new THREE.MeshBasicMaterial(), post: new THREE.MeshBasicMaterial(),
    cross: new THREE.MeshBasicMaterial(), lamp,
  });
  assert.equal(crossings.count, 1);

  // Far away: dark, whatever the flash phase.
  crossings.update(new THREE.Vector3(5000, 0, 0), 0.3);
  assert.equal(lamp.emissiveIntensity, 0);

  // Close, on a phase where the lamps are on.
  crossings.update(new THREE.Vector3(10, 0, 0), Math.PI / 12);
  assert.ok(lamp.emissiveIntensity > 1, `lamps were ${lamp.emissiveIntensity}`);
  crossings.dispose();
});

// --- bridges ---------------------------------------------------------------

import { findBridgeSites, deckLevel, CLEARANCE } from '../app/src/animation/Bridges.ts';
import { createRoads, isGradeSeparated } from '../app/src/animation/Roads.ts';

test('a bridge way that spans the line is found; one that misses it is not', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const spans = { points: line([[0, -60], [0, 60]]), width: 12, name: 'Ben Schoeman Highway' };
  const misses = { points: line([[0, -200], [0, -120]]), width: 12, name: 'Elsewhere' };

  const sites = findBridgeSites(rail, [spans, misses]);
  assert.equal(sites.length, 1, 'only the way that actually crosses is a bridge over the line');
  assert.equal(sites[0].road.name, 'Ben Schoeman Highway');
  // It crosses 60 m along its own length.
  assert.ok(Math.abs(sites[0].crossingAlong - 60) < 1e-6, `crossed at ${sites[0].crossingAlong} m`);
});

test('a bridge way crossing twice is still one structure', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const wiggly = { points: line([[-40, -30], [-40, 30], [40, 30], [40, -30]]), width: 9, name: 'Wiggle' };
  assert.equal(findBridgeSites(rail, [wiggly]).length, 1);
});

test('the deck clears the rail and comes back down to the ground at each end', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const site = findBridgeSites(rail, [{ points: line([[0, -200], [0, 200]]), width: 10, name: 'Over' }])[0];
  const ground = 0;

  const over = deckLevel(site, site.crossingAlong, ground);
  assert.ok(over >= site.railLevel + CLEARANCE, `deck at ${over} should clear rail + ${CLEARANCE}`);

  // 200 m away it is back on the ground, not still in the air.
  const away = deckLevel(site, site.crossingAlong + 200, ground);
  assert.ok(away < ground + 0.5, `abutment at ${away} should be on the ground`);

  // Halfway down the ramp it is between the two.
  const middle = deckLevel(site, site.crossingAlong + 35, ground);
  assert.ok(middle > away && middle < over, `ramp midpoint ${middle} should sit between`);
});

test('a deck never dips below the ground it crosses', () => {
  const rail = line([[-100, 0], [100, 0]]);
  const site = findBridgeSites(rail, [{ points: line([[0, -200], [0, 200]]), width: 10, name: 'Over' }])[0];
  // Ground far above rail level, as on a hillside approach.
  assert.ok(deckLevel(site, site.crossingAlong + 300, 60) >= 60);
});

test('bridge and tunnel ways are kept off the ground entirely', () => {
  assert.equal(isGradeSeparated({ highway: 'motorway', width: 12, name: null, lengthMetres: 900, points: [], bridge: true }), true);
  assert.equal(isGradeSeparated({ highway: 'primary', width: 9, name: null, lengthMetres: 900, points: [], tunnel: true }), true);
  assert.equal(isGradeSeparated({ highway: 'primary', width: 9, name: null, lengthMetres: 900, points: [] }), false);

  const project = (lon: number, lat: number) => new THREE.Vector3(lon * 100, 0, -lat * 100);
  const roads = createRoads({
    count: 2,
    roads: [
      { highway: 'motorway', width: 12, name: 'Bridge', lengthMetres: 900, bridge: true, points: [[0, 0], [9, 0]] },
      { highway: 'residential', width: 6, name: 'Street', lengthMetres: 900, points: [[0, 5], [9, 5]] },
    ],
  }, project, new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
  // Only the street should have produced surface geometry and a lane.
  assert.ok(roads.surface);
  assert.ok(roads.traffic);
  roads.dispose();
});

test('booms lower as the train arrives and lift once it has gone', () => {
  const rail = line([[-400, 0], [400, 0]]);
  const sites = findCrossings(rail, [{ points: line([[0, -50], [0, 50]]), width: 9 }]);
  const crossings = createLevelCrossings(sites, {
    deck: new THREE.MeshBasicMaterial(), post: new THREE.MeshBasicMaterial(),
    cross: new THREE.MeshBasicMaterial(), lamp: new THREE.MeshStandardMaterial(),
  });
  assert.equal(crossings.booms.length, 2, 'a 9 m road gets a half-boom each side');
  assert.deepEqual(crossings.booms, [0, 0], 'booms start raised');

  // Train arrives and stays; run the easing out.
  let time = 0;
  for (let i = 0; i < 300; i++) { time += 0.05; crossings.update(new THREE.Vector3(20, 0, 0), time); }
  assert.ok(crossings.booms[0] > 0.9, `boom reached ${crossings.booms[0]}`);

  // Train leaves; they lift again.
  for (let i = 0; i < 300; i++) { time += 0.05; crossings.update(new THREE.Vector3(9000, 0, 0), time); }
  assert.ok(crossings.booms[0] < 0.1, `boom returned to ${crossings.booms[0]}`);
  crossings.dispose();
});

test('booms ease rather than snap between positions', () => {
  const rail = line([[-400, 0], [400, 0]]);
  const sites = findCrossings(rail, [{ points: line([[0, -50], [0, 50]]), width: 9 }]);
  const crossings = createLevelCrossings(sites, {
    deck: new THREE.MeshBasicMaterial(), post: new THREE.MeshBasicMaterial(),
    cross: new THREE.MeshBasicMaterial(), lamp: new THREE.MeshStandardMaterial(),
  });
  crossings.update(new THREE.Vector3(20, 0, 0), 0.05);
  crossings.update(new THREE.Vector3(20, 0, 0), 0.1);
  assert.ok(crossings.booms[0] > 0 && crossings.booms[0] < 0.5,
    `after 100 ms a boom should be partway, not at ${crossings.booms[0]}`);
  crossings.dispose();
});

test('formation batters face away from the track, not into it', () => {
  // A straight, level line; the ground drops away either side, so both batters
  // are embankment. Their faces must be visible from outside the formation.
  const terrain = new Terrain({
    grid: 2,
    bounds: { west: -1, east: 1, south: -1, north: 1 },
    minMetres: 0, maxMetres: 0,
    routeSampleStride: 1,
    alongRoute: [0, 0, 0],
    heights: [-20, -20, -20, -20],
  }, (lon: number, lat: number) => new THREE.Vector3(lon * 10_000, 0, -lat * 10_000), 100);

  const route = {
    project: (d: number) => new THREE.Vector3(d, 0, 0),
    basis: () => new THREE.Vector3(1, 0, 0),
  };
  // 0..70 at the default 14 m step is five quads a side: twenty faces.
  const mesh = terrain.buildFormation(route, 0, 70, new THREE.MeshBasicMaterial());
  const position = mesh.geometry.attributes.position as THREE.BufferAttribute;

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3(), normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  let checked = 0;
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    normal.copy(edge1.subVectors(b, a)).cross(edge2.subVectors(c, a));
    if (normal.lengthSq() < 1e-9) continue;
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    // The track runs along z = 0, so a face at z < 0 must have a normal with a
    // negative z component, and vice versa: pointing away from the centreline.
    assert.ok(Math.sign(normal.z) === Math.sign(centroid.z),
      `face at z=${centroid.z.toFixed(1)} has normal z=${normal.z.toFixed(1)} - it faces the track`);
    checked++;
  }
  assert.ok(checked >= 16, `expected a batter on both sides, only checked ${checked} faces`);
});

test('a landmark stamp levels the ground under it and blends back outside', () => {
  // A grid that rises steeply west to east, so a pad is plainly visible.
  const grid = 21;
  const heights: number[] = [];
  for (let row = 0; row < grid; row++) for (let column = 0; column < grid; column++) heights.push(1000 + column * 20);
  const data: TerrainData = {
    grid, bounds: { west: 0, east: 0.02, south: -0.02, north: 0 },
    minMetres: 1000, maxMetres: 1400, routeSampleStride: 1, alongRoute: [1000, 1000], heights,
  };
  const terrain = new Terrain(data, project, 100);
  const centre = { x: project(0.01, -0.01).x, z: project(0.01, -0.01).z };
  const before = terrain.heightAt(centre.x + 150, centre.z);

  const base = terrain.addStamp({ ...centre, inner: 300, outer: 600 });
  // Flat across the inner radius, a little below the landmark's floor so a
  // landmark with its own ground plane does not z-fight with the terrain.
  const west = terrain.heightAt(centre.x - 250, centre.z);
  const east = terrain.heightAt(centre.x + 250, centre.z);
  assert.ok(Math.abs(west - east) < 0.5, `pad should be level, got ${west} and ${east}`);
  assert.ok(east < base && base - east < 1, `pad at ${east} should sit just under base ${base}`);
  assert.notEqual(terrain.heightAt(centre.x + 150, centre.z), before, 'the ground inside the pad changed');

  // Well outside the outer radius, nothing moved.
  const far = terrain.heightAt(centre.x + 900, centre.z);
  const reference = new Terrain(data, project, 100).heightAt(centre.x + 900, centre.z);
  assert.equal(far, reference, 'ground beyond the outer radius is untouched');

  // And the loaded data itself is not mutated.
  assert.equal(data.heights[0], 1000);
});

test('a pit drops the ground inside its radius and leaves the rest alone', () => {
  const terrain = new Terrain(terrainData(), project, 600);
  // The grid vertex at column 1, row 1 sits at (333, 333) in scene metres.
  const outside = terrain.heightAt(1000, 1000);
  terrain.addPit({ x: 1000 / 3, z: 1000 / 3, radius: 100, floor: -200 });
  assert.ok(Math.abs(terrain.heightAt(1000 / 3, 1000 / 3) - -200) < 1e-6, 'the vertex inside the pit is at the floor');
  assert.equal(terrain.heightAt(1000, 1000), outside);
});

test('the ground palette defaults to Highveld and can be retinted before build', () => {
  const highveld = new Terrain(terrainData(), project, 600);
  assert.equal(highveld.palette.valley, '#8fa05f');
  const red = new Terrain(terrainData(), project, 600);
  red.palette = { valley: '#b0855a', ridge: '#c19a6b', rock: '#8a6a52' };
  const colourOf = (terrain: Terrain) => {
    const mesh = terrain.build(new THREE.MeshBasicMaterial());
    const colour = mesh.geometry.getAttribute('color');
    return [colour.getX(0), colour.getY(0), colour.getZ(0)];
  };
  assert.notDeepEqual(colourOf(highveld), colourOf(red));
});
