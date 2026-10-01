import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.CITY_BASE || 'http://127.0.0.1:8791';
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/animation`);
  await page.locator('.animation-ride[data-ready="true"]').waitFor({ timeout: 90000 });
  await page.getByRole('link', { name: 'Explore Johannesburg' }).click();
  await page.waitForURL('**/johannesburg.html');
  await page.waitForFunction(() => window.__johannesburg?.city.trainRoot.children.length === 19, { timeout: 60000 });
  await page.getByRole('button', { name: 'Dusk lighting' }).click();
  await page.getByRole('button', { name: 'Daylight', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('link', { name: 'Pretoria' }).click();
  await page.waitForURL('**/animation');
  await page.locator('.animation-ride[data-ready="true"]').waitFor({ timeout: 90000 });
  await page.getByRole('link', { name: 'Explore Johannesburg' }).click();
  await page.waitForURL('**/johannesburg.html');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ base, cityNavigation: 'passed desktop and mobile', errors }));
} finally { await browser.close(); }
