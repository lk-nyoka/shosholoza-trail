import { test } from 'node:test';
import assert from 'node:assert/strict';
import { johannesburgPassengerSpots } from '../app/src/animation/cities/johannesburg/JohannesburgPassengers.ts';
test('Johannesburg passenger spots clear tracks and columns, and sitting spots meet benches', () => {
  const spots = johannesburgPassengerSpots(); assert.equal(spots.length, 24);
  for (const spot of spots) {
    assert.ok([-18, -6, 6, 18].some(z => Math.abs(z - spot.position.z) <= 1.6 + 1e-6));
    for (const track of [-24, -12, 0, 12, 24]) assert.ok(Math.abs(track - spot.position.z) > 3);
    if (spot.pose === 'standing') {
      assert.equal(spot.position.y, 1.05);
      for (let x = -138; x <= 138; x += 23) assert.ok(Math.hypot(x - spot.position.x, Math.min(...[-18, -6, 6, 18].map(z => Math.abs(z - spot.position.z)))) > .5);
    } else { assert.equal(spot.position.y, 1.615); assert.ok([-87, 5].includes(spot.position.x)); }
  }
});
