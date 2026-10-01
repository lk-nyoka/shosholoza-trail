import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArrivalMoment } from '../app/src/animation/cities/johannesburg/ArrivalMoment.ts';
test('arrival appears once across the stop, stays dismissed, and rearms on rewind', () => {
  const arrival = new ArrivalMoment();
  assert.equal(arrival.update(23.9).show, false);
  assert.equal(arrival.update(24.1).show, true);
  arrival.dismiss();
  assert.equal(arrival.update(32).show, false);
  assert.equal(arrival.update(0).hide, true);
  assert.equal(arrival.update(32).show, true);
});
