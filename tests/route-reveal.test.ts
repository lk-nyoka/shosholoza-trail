import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteReveal, revealGradient } from '../app/src/route-reveal.ts';
import { cumulativeDistances } from '../app/src/ride-model.ts';

test('the reveal runs from 0 at the start to 1 at the end', () => {
  const line: [number, number][] = [[28.19, -25.76], [28.1, -26.2], [27.9, -26.9]];
  const reveal = createRouteReveal(line, cumulativeDistances(line));
  const total = cumulativeDistances(line).at(-1)!;
  assert.equal(reveal.fraction(0), 0);
  assert.equal(reveal.fraction(total), 1);
  assert.equal(reveal.fraction(-500), 0, 'clamped before the start');
  assert.equal(reveal.fraction(total * 3), 1, 'clamped past the end');
});

test('progress is Mercator length, not metres, so it tracks the train across latitudes', () => {
  // Two equal-length metre legs, one near Pretoria and one near Cape Town.
  // Mercator stretches the southern leg, so halfway in metres is NOT halfway in
  // line-progress. A naive metres/total reveal would put the head in the wrong
  // place by the Karoo.
  const line: [number, number][] = [[28, -25.7], [28, -26.7], [18.4, -32.9], [18.4, -33.9]];
  const cumulative = cumulativeDistances(line);
  const reveal = createRouteReveal(line, cumulative);
  // At the end of the first leg, the fraction is that leg's share of Mercator length.
  const endOfFirst = reveal.fraction(cumulative[1]);
  const metreShare = cumulative[1] / cumulative.at(-1)!;
  assert.notEqual(endOfFirst.toFixed(4), metreShare.toFixed(4), 'Mercator and metre fractions must differ');
  // The southern 1-degree leg is longer in Mercator than the northern one.
  const firstLeg = reveal.fraction(cumulative[1]) - reveal.fraction(cumulative[0]);
  const lastLeg = reveal.fraction(cumulative[3]) - reveal.fraction(cumulative[2]);
  assert.ok(lastLeg > firstLeg, `southern leg ${lastLeg} should outweigh northern ${firstLeg}`);
});

test('the fraction never goes backwards along the route', () => {
  const line: [number, number][] = [[28.19, -25.76], [28.18, -25.8], [28.2, -25.85], [28.15, -25.9]];
  const cumulative = cumulativeDistances(line);
  const reveal = createRouteReveal(line, cumulative);
  let previous = -1;
  for (let d = 0; d <= cumulative.at(-1)!; d += 50) {
    const f = reveal.fraction(d);
    assert.ok(f >= previous, `fraction fell from ${previous} to ${f} at ${d} m`);
    previous = f;
  }
});

test('the gradient is a step expression that MapLibre accepts', () => {
  const gradient = revealGradient(0, '#f4bd4f');
  assert.deepEqual(gradient.slice(0, 3), ['step', ['line-progress'], '#f4bd4f']);
  // A zero stop is invalid in a step expression, so it is floored.
  assert.ok((gradient[3] as number) > 0);
  assert.equal(revealGradient(2, '#fff')[3], 1);
});
