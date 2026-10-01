import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, TIMELINE, WILDLIFE_NOTICE, eventsFor } from '../app/src/animation/cities/beaufort-west/story.ts';

test('the timeline runs oldest first with no repeated years', () => {
  const years = TIMELINE.map(event => event.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.equal(new Set(years).size, years.length);
});

test('every event says where it came from', () => {
  for (const event of TIMELINE) {
    assert.ok(event.source.length > 3, `${event.year} has no source`);
    assert.ok(event.confidence, `${event.year} has no confidence`);
  }
});

test('every year a beat lights up is on the timeline', () => {
  for (const beat of BEATS) {
    assert.equal(eventsFor(beat).length, beat.years.length, `${beat.id} names a year the timeline does not have`);
  }
});

test('the story starts on the approach, ends on departure, and visits each beat once', () => {
  const ids = BEATS.map(beat => beat.id);
  assert.equal(ids[0], 'approach');
  assert.equal(ids.at(-1), 'departure');
  assert.equal(new Set(ids).size, ids.length);
});

test('wildlife is labelled as illustrative, not live', () => {
  assert.match(WILDLIFE_NOTICE, /illustrative/i);
  assert.match(WILDLIFE_NOTICE, /not live/i);
});
