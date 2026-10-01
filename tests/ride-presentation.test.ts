import test from 'node:test';
import assert from 'node:assert/strict';
import { approachStage, landmarkPresentation, pacedWaypoint, projectToRail, relativeBearing } from '../app/src/ride-presentation.ts';
import { cumulativeDistances, haversineMetres, type Coordinate } from '../app/src/ride-model.ts';

test('landmark placement projects to segment interior and preserves source while compressing on correct bearing', () => {
  const rail: Coordinate[] = [[25, -30], [25.2, -30]];
  const actual: Coordinate = [25.1, -29.9], original = structuredClone(actual);
  const cumulative = cumulativeDistances(rail);
  const nearest = projectToRail(rail, cumulative, actual);
  assert.ok(Math.abs(nearest.coordinate[0] - 25.1) < .00001);
  const result = landmarkPresentation(rail, cumulative, actual, 3);
  assert.deepEqual(actual, original);
  assert.ok(Object.isFrozen(result.measured));
  assert.ok(result.measured.lateralDistanceMetres > 10_000);
  assert.ok(haversineMetres(nearest.coordinate, [...result.presentation.coordinate] as Coordinate) <= 600.01);
  assert.ok(Math.abs(relativeBearing(nearest.coordinate, [...result.presentation.coordinate] as Coordinate, 0) - relativeBearing(nearest.coordinate, actual, 0)) < .01);
  assert.equal(result.presentation.heightScale, 3);
});

test('approach stage boundaries and pacing prevent skipping arrival anticipation', () => {
  assert.deepEqual([5001, 5000, 2001, 2000, 501, 500].map(approachStage), [0, 1, 1, 2, 2, 3]);
  const waypoints = Array.from({length:151}, (_, i) => ({distanceMetres:i*200, coordinate:[25,-30] as Coordinate}));
  assert.equal(waypoints[pacedWaypoint(waypoints, 0, [20_000], 16)].distanceMetres, 15_000);
  assert.equal(waypoints[pacedWaypoint(waypoints, 75, [20_000], 16)].distanceMetres, 15_200);
  assert.equal(waypoints[pacedWaypoint(waypoints, 74, [20_000], 16)].distanceMetres, 15_000);
});
