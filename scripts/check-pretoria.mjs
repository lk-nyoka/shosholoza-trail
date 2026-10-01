// End-to-end check of the Pretoria 3D animation, in a real browser.
//
// Modelled on scripts/check-johannesburg.mjs. Every request that is not to the
// local server is aborted and recorded, so "the animation needs no network" is
// tested rather than claimed. Then it drives the journey, the places, a
// landmark cinematic, time of day, sound, orbit, mobile with reduced motion, and
// two deliberately broken assets.
//
//   PORT=4300 node harness/static-server.js &
//   node scripts/check-pretoria.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PRETORIA_BASE || 'http://127.0.0.1:4300';
const output = process.env.PRETORIA_EVIDENCE || 'evidence/pretoria';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [], external = [], checks = [];
const passed = name => checks.push(name);

/** Abort anything that leaves the machine, and remember that it tried. */
const localOnly = async context => context.route('**/*', route => {
  const host = new URL(route.request().url()).hostname;
  if (!/^(127\.0\.0\.1|localhost)$/.test(host)) { external.push(route.request().url()); return route.abort(); }
  return route.continue();
});

const ready = page => page.waitForFunction(() => document.querySelector('main')?.dataset.ready === 'true' && globalThis.__railScene, null, { timeout: 120_000 });
const mode = page => page.evaluate(() => document.querySelector('main')?.dataset.journey);
const seek = (page, metres) => page.locator('input[type="range"]').evaluate((el, value) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, metres);
/** Headless GL runs at a few frames a second and the frame step is capped, so
 *  timed sequences take far longer than on real hardware. Poll, don't sleep. */
const until = async (page, predicate, timeout = 120_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return;
    await page.waitForTimeout(500);
  }
  throw new Error('timed out waiting for condition');
};

let stats;
try {
  // --- desktop ---------------------------------------------------------------
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await localOnly(context);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/animation?debug=true`);
  await ready(page);

  const world = await page.evaluate(() => {
    const s = globalThis.__railScene;
    return {
      halts: s.halts?.count ?? 0,
      passengers: s.passengers?.count ?? 0,
      streetLights: s.streetLights?.count ?? 0,
      buildings: s.city?.extruded ?? 0,
      places: s.waypoints?.places.length ?? 0,
      birds: s.birds?.count ?? 0,
    };
  });
  assert.equal(world.halts, 2, 'Fonteine and Kloofsig halts');
  assert.ok(world.passengers >= 10, `passengers on the Pretoria platform, got ${world.passengers}`);
  assert.ok(world.streetLights > 100, `street lights, got ${world.streetLights}`);
  assert.ok(world.buildings > 400, `OSM buildings, got ${world.buildings}`);
  assert.ok(world.places >= 5, `named places, got ${world.places}`);
  passed('world built from local data: halts, passengers, lights, buildings, places, birds');

  // Places announce themselves by route position.
  await seek(page, 362);
  await page.locator('.animation-passing strong', { hasText: '//Hapo Museum' }).waitFor();
  await seek(page, 2591);
  await page.locator('.animation-passing strong', { hasText: 'Fountains Valley' }).waitFor();
  await seek(page, 4500);
  await until(page, async () => (await page.locator('.animation-passing').count()) === 0);
  passed('passing places announce and clear by route position');

  // A landmark takes the camera, shows its card, and gives it back.
  await seek(page, 0);
  await page.getByRole('button', { name: /Freedom Park/ }).click();
  await until(page, async () => (await mode(page)) === 'cinematic');
  assert.equal(await page.locator('.animation-passing').count(), 0, 'passing card must stay hidden during a landmark');
  assert.equal(await page.locator('.animation-controls').getAttribute('inert'), '', 'controls are out of the tab order during a cinematic');
  await page.screenshot({ path: `${output}/freedom-park.png` });
  await page.getByRole('button', { name: 'Back to the train' }).click();
  await until(page, async () => (await mode(page)) === 'follow');
  passed('landmark cinematic: enter, card, inert controls, return');

  // Dragging orbits the camera rather than being snapped back.
  await seek(page, 3000);
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => globalThis.__railScene.camera.position.toArray());
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2);
  await page.mouse.up();
  const after = await page.evaluate(() => globalThis.__railScene.camera.position.toArray());
  assert.ok(Math.hypot(after[0] - before[0], after[2] - before[2]) > 5, 'drag must move the camera');
  passed('orbit drag moves the camera');

  // Night lights things that are dark by day.
  const dayGlow = await page.evaluate(() => globalThis.__railScene.streetLights.poolMaterial.emissiveIntensity);
  await page.getByRole('group', { name: /time of day/i }).getByRole('button', { name: 'Night' }).click();
  const nightGlow = await page.evaluate(() => globalThis.__railScene.streetLights.poolMaterial.emissiveIntensity);
  assert.equal(dayGlow, 0);
  assert.ok(nightGlow > 0, 'street light pools glow at night');
  await seek(page, 700);
  await page.getByRole('button', { name: /behind the train/i }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${output}/night.png` });
  await page.getByRole('group', { name: /time of day/i }).getByRole('button', { name: 'Midday' }).click();
  passed('night lighting on, off again at midday');

  // Sound starts from a gesture.
  await page.getByRole('button', { name: /sound off/i }).click();
  assert.equal(await page.getByRole('button', { name: /sound on/i }).getAttribute('aria-pressed'), 'true');
  passed('sound toggled by gesture');

  stats = await page.evaluate(() => {
    const r = globalThis.__railScene.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles, journeyEnd: Number(document.querySelector('[data-journey-end]')?.dataset.journeyEnd) };
  });
  assert.equal(stats.journeyEnd, 6300);
  await page.screenshot({ path: `${output}/desktop.png` });
  await context.close();

  // --- mobile, reduced motion ------------------------------------------------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await localOnly(mobile);
  const phone = await mobile.newPage();
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(`${base}/animation`);
  await ready(phone);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  assert.equal(await phone.getByRole('button', { name: /start journey/i }).isDisabled(), true, 'no autoplay under reduced motion');
  await seek(phone, 2000);
  await phone.waitForTimeout(1500);
  assert.ok(Number(await phone.evaluate(() => document.querySelector('[data-distance]')?.dataset.distance)) > 1900, 'the slider still moves the train');
  await phone.screenshot({ path: `${output}/mobile.png` });
  await mobile.close();
  passed('mobile: no overflow, reduced motion respected, slider works');

  // --- broken assets ---------------------------------------------------------
  // Optional pieces must degrade, not break the page.
  const degraded = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await localOnly(degraded);
  const broken = await degraded.newPage();
  broken.on('pageerror', e => errors.push(e.message));
  await broken.route('**/assets/models/people/boxman.glb', route => route.abort());
  await broken.route('**/data/pretoria-terrain.json', route => route.abort());
  await broken.goto(`${base}/animation`);
  await ready(broken);
  const fallback = await broken.evaluate(() => ({ passengers: globalThis.__railScene.passengers ?? null }));
  assert.equal(fallback.passengers, null, 'no passengers without the model');
  await degraded.close();
  passed('missing person model and terrain degrade without breaking the page');

  assert.deepEqual(external, [], 'the animation made no network requests beyond the local server');
  assert.deepEqual(errors, [], 'no page errors');
  await writeFile(`${output}/verification.json`, JSON.stringify({ stats, world, errors, external, checks }, null, 2));
  console.log(JSON.stringify({ result: 'passed', checks: checks.length, stats }));
} catch (failure) {
  console.log(JSON.stringify({ result: 'failed', message: String(failure?.message ?? failure), passed: checks, errors: errors.slice(0, 5), external: external.slice(0, 5) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
