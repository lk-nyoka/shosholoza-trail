import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { readRideRoute, cumulativeDistances, coordinateAtDistance } from '../app/src/ride-model.ts';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const stage = process.env.TRAIN_STAGE === '2' ? 2 : 1;
const artifactName = name => stage === 2 ? name.replace('train-', 'train-stage2-') : name;
const evidence = path.join(root, 'evidence');
await mkdir(evidence, { recursive: true });
const routePath = path.join(root, 'data/route-ride.geojson');
const original = await readFile(routePath);
const hash = data => createHash('sha256').update(data).digest('hex');
const route = readRideRoute(JSON.parse(original));
const coords = route.geometry.coordinates;
const distances = cumulativeDistances(coords);
const bearing = (a, b) => Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI;
const angleDelta = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const at = s => coordinateAtDistance(coords, distances, s);

// Find an actual rail curve, using 22m straight vehicle chords; no synthetic bend.
let curve = { chainage: 5000, articulation: 0 };
for (let s = 1000; s < Math.min(65000, distances.at(-1) - 500); s += 50) {
  const bearings = Array.from({ length: 18 }, (_, i) => bearing(at(s - i * 23.2 - 7.75), at(s - i * 23.2 + 7.75)));
  const articulation = Math.max(...bearings.slice(1).map((value, i) => angleDelta(value, bearings[i])));
  // Reject possible digitisation reversals; seek a legible engineering curve.
  if (articulation > curve.articulation && articulation < 18) curve = { chainage: s, articulation };
}
const shots = [
  { name: 'train-hero-pretoria', s: Number(process.env.TRAIN_HERO_S || 600), time: 'midday', shot: 'hero' },
  { name: 'train-curve-articulation', s: Number(process.env.TRAIN_CURVE_S || 600), time: 'midday', shot: 'curve-reveal' },
  { name: 'train-night-karoo', s: Number(process.env.TRAIN_NIGHT_S || 800000), time: 'night', shot: 'hero' },
];
const report = { status: 'running', baseUrl, routeSha256: hash(original), curve, captures: [], visualAcceptance: 'Human review required: screenshot aesthetics, chord kinks, terrain clearance and comparison to reference.' };
const browser = await chromium.launch({ headless: true });
try {
  for (const shot of shots.filter(shot => !process.env.TRAIN_ONLY || shot.name.includes(process.env.TRAIN_ONLY))) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    const glbResponses = new Set();
    page.on('response', response => { if (response.ok() && /\/assets\/models\/train\/quaternius-(electric|passenger)\.glb/.test(response.url())) glbResponses.add(response.url()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const query = new URLSearchParams({ s: String(shot.s), time: shot.time, shot: shot.shot, train: '1' });
    await page.goto(`${baseUrl}/ride?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ride[data-world-ready="true"]', { timeout: 45000 });
    const close = page.getByRole('button', { name: 'Return to the track' });
    if (await close.count()) await close.click();
    await page.waitForFunction(() => typeof window.__trainEvidence === 'function', undefined, { timeout: 30000 });
    if (stage === 2) await page.waitForSelector('canvas[data-train-glb="ready"]', { timeout: 30000 });
    await page.waitForTimeout(Number(process.env.TRAIN_CAPTURE_WAIT_MS || 6500));
    const state = await page.evaluate(() => window.__trainEvidence());
    // Keep projected geometry evidence beside the image: readiness alone cannot
    // prove the subject fills the requested 30–35% hero composition.
    const projected = (state.trainScreen ?? []).filter(point => point.every(Number.isFinite));
    state.frameWidthFraction = projected.length ? (Math.max(...projected.map(point => point[0])) - Math.min(...projected.map(point => point[0]))) / 1440 : null;
    state.heroWidthTarget = [0.30, 0.35];
    state.heroWidthPass = state.frameWidthFraction >= 0.30 && state.frameWidthFraction <= 0.35;
    if (stage === 2) {
      const triangles = Number(await page.locator('canvas[data-train-glb="ready"]').getAttribute('data-train-glb-triangles'));
      if (!(triangles > 0 && triangles <= 60000)) throw new Error(`Invalid close GLB triangle budget: ${triangles}`);
      if (glbResponses.size !== 2) throw new Error(`Expected both GLB assets loaded, received ${glbResponses.size}`);
      if (!(state.mapZoom >= 16.4)) throw new Error(`GLB loaded but camera zoom ${state.mapZoom} is below visible close LOD`);
      state.glbTriangles = triangles;
      state.glbResponses = [...glbResponses];
    }
    if (!state || state.vehicles?.length !== 18) throw new Error(`${shot.name}: expected 18 vehicles; received ${state?.vehicles?.length}`);
    if (state.shot !== shot.shot) throw new Error(`${shot.name}: camera hook ignored shot=${shot.shot}, received ${state.shot}`);
    const liveries = new Set(state.vehicles.slice(2).map(vehicle => vehicle.livery));
    if (liveries.size !== 3) throw new Error(`${shot.name}: expected three alternating coach liveries`);
    if (shot.time === 'night' && !(state.litWindowCount > 0 && state.unlitWindowCount > 0)) throw new Error('Night windows must include lit and unlit windows');
    if (shot.shot === 'curve-reveal') {
      const headings = state.vehicles.map(vehicle => vehicle.heading);
      if (!headings.every(Number.isFinite) || !headings.slice(1).some((heading, i) => angleDelta(heading, headings[i]) > 0.5)) throw new Error('Curve capture does not show differing coach headings');
    }
    // Hide application panels only; MapLibre attribution remains visible.
    await page.addStyleTag({ content: '.ride > :not(.ride-world){visibility:hidden!important}.ride-world > :not(.maplibregl-canvas-container):not(.maplibregl-control-container){visibility:hidden!important}' });
    report.captures.push({ ...shot, url: page.url(), state, errors });
    await writeFile(path.join(evidence, `train-stage${stage}-capture.json`), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(evidence, `${artifactName(shot.name)}.png`), timeout: 90000 });
    await page.close();
    if (errors.length) throw new Error(`${shot.name}: ${errors.join(' | ')}`);
  }
  // Reference sits beside the three renderings without modifying either image.
  const width = 960, height = 600;
  const images = [path.join(root, 'public/assets/photos/hero-train.webp'), ...report.captures.map(shot => path.join(evidence, `${artifactName(shot.name)}.png`))];
  const tiles = await Promise.all(images.map(input => sharp(input).resize(width, height, { fit: 'contain', background: '#12181f' }).png().toBuffer()));
  await sharp({ create: { width: width * 2, height: height * 2, channels: 3, background: '#12181f' } }).composite(tiles.map((input, i) => ({ input, left: (i % 2) * width, top: Math.floor(i / 2) * height }))).png().toFile(path.join(evidence, `train-stage${stage}-reference-comparison.png`));
  if (hash(await readFile(routePath)) !== report.routeSha256) throw new Error('Route data changed during capture');
  report.status = 'captured';
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(path.join(evidence, `train-stage${stage}-capture.json`), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Train Stage ${stage} screenshots and reference comparison captured. Review visual acceptance before proceeding.`);
