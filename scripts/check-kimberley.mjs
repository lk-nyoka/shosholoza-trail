// End-to-end check for the Kimberley chapter.
//
// Loads /kimberley.html, waits for the real-data world and the consist, runs
// the whole chapter and captures a frame at each phase. Fails on page errors,
// on any request that leaves the machine, if the train does not stop at the
// platform, or if the chapter does not reach COMPLETE.
//
//   KIMBERLEY_BASE=http://localhost:5199 node scripts/check-kimberley.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.KIMBERLEY_BASE || 'http://127.0.0.1:8790';
const output = process.env.KIMBERLEY_EVIDENCE || 'evidence/kimberley';
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
  await page.goto(`${base}/kimberley.html`);
  await page.waitForFunction(() => window.__kimberley?.kimberley.trainRoot.children.length > 10, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${output}/00-opening.png` });

  // Restart mid-chapter: the cancelled run must unwind, not fall back over the
  // reset scene, and Play must work again. Then Pause must hold the story.
  const phaseText = async () => (await page.locator('#phase-badge').textContent())?.trim() ?? '';
  await page.locator('#btn-run-chapter').click();
  await page.waitForFunction(() => document.querySelector('#phase-badge')?.textContent?.includes('HERITAGE'), null, { timeout: 180_000 });
  await page.locator('#btn-restart').click();
  await page.waitForFunction(() => !document.querySelector('#btn-run-chapter').disabled, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  assert.notEqual(await phaseText(), 'RECOVERY', 'a restart must not trigger the Big Hole fallback');
  assert.equal(await page.evaluate(() => window.__kimberley.kimberley.eraBlend), 0, 'restart returns to the present day');
  await page.locator('#btn-run-chapter').click();
  await page.waitForFunction(() => document.querySelector('#phase-badge')?.textContent?.includes('STATION ARRIVAL'), null, { timeout: 120_000 });
  await page.locator('#btn-pause').click();
  const heldAt = await page.evaluate(() => ({ phase: document.querySelector('#phase-badge').textContent, x: window.__kimberley.trainState.x }));
  await page.waitForTimeout(8000);
  const stillAt = await page.evaluate(() => ({ phase: document.querySelector('#phase-badge').textContent, x: window.__kimberley.trainState.x }));
  assert.deepEqual(stillAt, heldAt, 'pause holds both the train and the story');
  await page.locator('#btn-pause').click();
  await page.locator('#btn-restart').click();
  await page.waitForFunction(() => !document.querySelector('#btn-run-chapter').disabled, null, { timeout: 30_000 });
  console.log('restart and pause behave');

  const seen = new Set();
  const shots = new Map([
    ['STATION ARRIVAL', '01-arrival'], ['HERITAGE MORPH', '02-heritage-morph'], ['HERITAGE TIME MACHINE', '03-time-machine'],
    ['TRAM RIDE', '04-tram'], ['BIG HOLE REVEAL', '05-big-hole'], ['BIG HOLE DESCENT', '06-descent'],
    ['DIAMOND INTERACTION', '07-diamond'], ['RETURN TO TRAIN', '08-return'], ['COMPLETE', '09-complete'],
  ]);
  let stoppedAt = null, lastPhase = '';
  await page.locator('#btn-run-chapter').click();
  const started = Date.now();
  while (Date.now() - started < 600_000) {
    const phase = (await page.locator('#phase-badge').textContent())?.trim() ?? '';
    if (phase !== lastPhase) { console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s -> ${phase}`); lastPhase = phase; }
    const state = await page.evaluate(() => ({ x: window.__kimberley.trainState.x, v: window.__kimberley.trainState.speedKph }));
    if (stoppedAt === null && phase === 'HERITAGE MORPH') stoppedAt = state.x;
    if (!seen.has(phase) && shots.has(phase)) {
      seen.add(phase);
      await page.waitForTimeout(phase === 'TRAM RIDE' ? 3500 : phase === 'BIG HOLE DESCENT' ? 2500 : 1200);
      await page.screenshot({ path: `${output}/${shots.get(phase)}.png` });
      console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`, phase, `train ${state.x.toFixed(1)} m @ ${state.v.toFixed(1)} km/h`);
    }
    if (phase === 'DIAMOND INTERACTION' && await page.locator('#diamond-prompt').isVisible()) {
      // The prompt waits for the viewer and takes focus: Enter activates it.
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Discover Diamond');
      await page.getByRole('button', { name: 'Discover Diamond' }).click();
    }
    if (phase === 'CHAPTER REWARD' || phase === 'COMPLETE') {
      const close = page.getByRole('button', { name: /continue|close/i });
      if (await close.first().isVisible().catch(() => false)) await close.first().click().catch(() => {});
    }
    if (phase === 'COMPLETE') break;
    await page.waitForTimeout(250);
  }
  assert.ok(seen.has('COMPLETE'), `chapter did not complete; saw ${[...seen].join(', ')}`);
  assert.ok(stoppedAt !== null && Math.abs(stoppedAt) < 2, `train should stop at the platform, stopped at ${stoppedAt}`);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('kimberley check passed');
} finally {
  await browser.close();
}
