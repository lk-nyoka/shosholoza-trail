// End-to-end check for the Beaufort West chapter.
//
// Loads /beaufort-west.html, waits for the world and the consist, opens a
// landmark through the picker, runs the whole story and captures a frame per
// beat. Fails on page errors, on any request that leaves the machine, if the
// train does not stop at the platform, or if the story does not complete.
//
//   BEAUFORT_BASE=http://localhost:5199 node scripts/check-beaufort-west.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.BEAUFORT_BASE || 'http://127.0.0.1:8790';
const output = process.env.BEAUFORT_EVIDENCE || 'evidence/beaufort-west';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], external = [];
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  await context.route('**/*', route => {
    if (!new URL(route.request().url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/beaufort-west.html`);
  await page.waitForFunction(() => window.__beaufortWest?.bw.trainRoot.children.length > 10, null, { timeout: 90_000 });
  const facts = await page.evaluate(() => ({ landmarks: window.__beaufortWest.bw.landmarks.length, wildlife: window.__beaufortWest.bw.wildlifeCount, station: window.__beaufortWest.bw.stationRecordFound }));
  assert.equal(facts.landmarks, 6);
  assert.ok(facts.wildlife > 50, `expected herds, got ${facts.wildlife}`);
  assert.ok(facts.station, 'the station building should take its OSM footprint');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${output}/00-opening.png` });

  // Landmark picker -> inspector with provenance.
  await page.getByRole('combobox', { name: 'Go to landmark' }).selectOption({ label: 'NG Kerk Beaufort West' });
  await page.getByRole('dialog', { name: 'NG Kerk - Beaufort West' }).waitFor();
  assert.match(await page.locator('#inspector-source').textContent(), /OSM way 764605918/);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${output}/01-inspect-church.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspector').isVisible(), false);

  const shots = new Map([
    ['Approach', '02-approach'], ['Blockhouse', '03-blockhouse'], ['Arrival', '04-arrival'], ['Town', '05-town'],
    ['Karoo', '06-karoo'], ['Karoo night', '07-night'], ['Departure', '08-departure'], ['Complete', '09-complete'],
  ]);
  const seen = new Set();
  let stoppedAt = null;
  await page.getByRole('button', { name: '▶ Play story' }).click();
  const started = Date.now();
  while (Date.now() - started < 600_000) {
    const phase = (await page.locator('#phase').textContent())?.trim() ?? '';
    const x = await page.evaluate(() => window.__beaufortWest.train.x);
    if (stoppedAt === null && phase === 'Town') stoppedAt = x;
    // Exploring mid-story: the picker's view must hold while the story waits.
    if (phase === 'Karoo' && !seen.has('explore-check')) {
      seen.add('explore-check');
      await page.getByRole('combobox', { name: 'Go to landmark' }).selectOption({ label: 'Beaufort West Blockhouse' });
      await page.waitForTimeout(5000);
      const near = await page.evaluate(() => {
        const w = window.__beaufortWest, root = w.bw.landmarkRoots.find(r => r.userData.landmark.kind === 'blockhouse');
        return w.camera.position.distanceTo(root.getWorldPosition(root.position.clone()));
      });
      assert.ok(near < 250, `the story took the camera away from the picked landmark (${near.toFixed(0)} m)`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Explore' }).click();
      console.log('explore holds the story');
    }
    if (!seen.has(phase) && shots.has(phase)) {
      seen.add(phase);
      await page.waitForTimeout(phase === 'Karoo' ? 4000 : phase === 'Town' ? 3000 : 1500);
      await page.screenshot({ path: `${output}/${shots.get(phase)}.png` });
      console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`, phase, `train ${x.toFixed(1)} m`);
    }
    if (phase === 'Complete') break;
    await page.waitForTimeout(250);
  }
  assert.ok(seen.has('Complete'), `story did not complete; saw ${[...seen].join(', ')}`);
  assert.ok(stoppedAt !== null && Math.abs(stoppedAt) < 1, `train should stop at the platform, was at ${stoppedAt}`);
  assert.equal(await page.getByRole('link', { name: 'Continue to Cape Town →' }).getAttribute('href'), '/cape-town');
  await page.getByRole('button', { name: 'Stay in Beaufort West' }).click();
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('beaufort west check passed');
} finally {
  await browser.close();
}
