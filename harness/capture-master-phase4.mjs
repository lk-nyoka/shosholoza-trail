import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Exercises production scene exports; the comparison hides only caption copy.
// No replacement camera or animation is injected by the evidence harness.
const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'evidence');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const report = { baseUrl, capturedAt: new Date().toISOString(), pairs: [], motion: {}, errors };

function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}

async function mount(page, hubs) {
  // A clean same-origin host avoids retaining the gallery's eight WebGL contexts.
  await page.unroute('**/animations/gallery.html');
  await page.route('**/animations/gallery.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Production scene comparison</title></head><body></body></html>' }));
  await page.goto(`${baseUrl}/animations/gallery.html`, { waitUntil: 'networkidle' });
  await page.evaluate(async ids => {
    const { mountLocalizedAnimation } = await import('/animations/localized-scenes.js');
    document.body.replaceChildren();
    document.body.style.cssText = 'margin:0;padding:20px;max-width:none;background:#12181f;color:#f0e6d2;';
    const grid = document.createElement('main');
    grid.id = 'evidence-comparison';
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${ids.length},minmax(0,1fr));gap:20px;margin:0;`;
    document.body.append(grid);
    window.evidenceScenes = ids.map(hubId => {
      const host = document.createElement('section');
      grid.append(host);
      return mountLocalizedAnimation(host, hubId, { durationSeconds: 10, controls: true, reducedMotion: false });
    });
  }, hubs);
  await page.waitForFunction(() => {
    const scenes = [...document.querySelectorAll('#evidence-comparison .st-local-scene')];
    return scenes.length > 0 && scenes.every(scene => scene.querySelector('canvas') && [...scene.querySelectorAll('img')].every(img => img.complete && img.naturalWidth));
  }, undefined, { timeout: 30000 });
  await page.waitForTimeout(1800);
  const states = await page.locator('.st-local-scene').evaluateAll(scenes => scenes.map(scene => ({ hub: scene.dataset.hub, dataset: { ...scene.dataset }, canvas: [...scene.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height, dataset: { ...canvas.dataset } })) })));
  for (const state of states) {
    if (Object.values(state.dataset).some(value => /^(error|failed|fallback)$/.test(value))) throw new Error(`Depth scene did not initialize: ${JSON.stringify(state)}`);
    if (!state.canvas.some(canvas => canvas.width > 100 && canvas.height > 100)) throw new Error(`Missing populated depth canvas at ${state.hub}`);
  }
  return states;
}

async function changedPixelFraction(before, after) {
  const a = await sharp(before).resize(256, 144).removeAlpha().raw().toBuffer();
  const b = await sharp(after).resize(256, 144).removeAlpha().raw().toBuffer();
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 18) changed++;
  return changed / (a.length / 3);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 720 }, deviceScaleFactor: 1 });
  observe(page);
  for (const hubs of [['kimberley', 'matjiesfontein'], ['beaufort-west', 'kimberley']]) {
    const states = await mount(page, hubs);
    await page.addStyleTag({ content: '.st-local-scene__caption small{visibility:hidden!important}.st-local-scene{min-height:360px!important}' });
    await page.evaluate(() => window.evidenceScenes.forEach(scene => scene.restart()));
    await page.waitForTimeout(3200);
    const file = `parallax-compare-${hubs.join('-')}.png`;
    await page.locator('#evidence-comparison').screenshot({ path: path.join(evidence, file) });
    report.pairs.push({ hubs, states, screenshot: file, captionsHidden: true });
    // Hide decorative layers so the pixel test cannot pass on CSS/SVG motion alone.
    const isolation = await page.addStyleTag({ content: '.st-local-scene svg,.st-local-scene img,.st-local-scene__caption,.st-local-scene__shade{visibility:hidden!important}' });
    for (const hub of hubs) {
      const canvas = page.locator(`.st-local-scene[data-hub="${hub}"] canvas`).first();
      const before = await canvas.screenshot();
      await page.waitForTimeout(1700);
      const after = await canvas.screenshot();
      const fraction = await changedPixelFraction(before, after);
      report.motion[hub] = { changedPixelFraction: fraction };
      if (fraction < 0.004) throw new Error(`Depth photograph did not visibly move at ${hub}: changed fraction ${fraction}`);
    }
    await isolation.evaluate(element => element.remove());
  }
  await page.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(root, 'test-results/master-phase4'), size: { width: 1280, height: 720 } } });
  const videoPage = await context.newPage();
  observe(videoPage);
  await mount(videoPage, ['kimberley']);
  await videoPage.evaluate(() => window.evidenceScenes[0].restart());
  await videoPage.waitForTimeout(12000);
  const video = videoPage.video();
  await context.close();
  if (!video) throw new Error('Kimberley recording is missing');
  await video.saveAs(path.join(evidence, 'parallax-kimberley.webm'));
  if (errors.length) throw new Error(errors.join(' | '));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(path.join(evidence, 'master-phase4-capture.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log('Phase 4: simultaneous caption-free comparisons, moving depth canvases and Kimberley video captured.');
