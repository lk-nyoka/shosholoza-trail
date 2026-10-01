import { expect, test } from '@playwright/test';
test('local 3D animation runs without external assets, moves and seeks independently of the map', async ({ page }) => {
  const external = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/animation');
  await expect(page.locator('.animation-ride')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.animation-world canvas')).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(window.__rideMap))).toBe(false);
  await page.getByRole('button', { name: 'Start journey' }).click();
  await expect.poll(async () => Number(await page.locator('.animation-world').getAttribute('data-distance'))).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Pause journey' }).click();
  const slider = page.getByRole('slider', { name: 'Animation route position' });
  await slider.fill('2500');
  await expect(page.locator('.animation-play output')).toHaveText('2.50 km');
  await page.getByRole('button', { name: 'Behind the train' }).click();
  await expect(page.getByRole('button', { name: 'Behind the train' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'evidence/animation-world-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'evidence/animation-world-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('reduced motion allows seeking without automatic travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/animation');
  await expect(page.locator('.animation-ride')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Start journey' })).toBeDisabled();
  await page.getByRole('slider', { name: 'Animation route position' }).fill('5000');
  await expect(page.locator('.animation-play output')).toHaveText('5.00 km');
  await page.getByRole('slider', { name: 'Animation route position' }).fill('0');
  await expect(page.locator('.animation-play output')).toHaveText('0.00 km');
});

test('missing supplied model reports failure instead of replacing it with a box', async ({ page }) => {
  await page.route('**/quaternius-electric.glb', route => route.fulfill({ status: 404, body: 'Missing' }));
  await page.goto('/animation');
  await expect(page.locator('.animation-loading')).toContainText('Error:');
  await expect(page.locator('.animation-ride')).toHaveAttribute('data-ready', 'false');
  await expect(page.getByRole('button', { name: 'Start journey' })).toBeDisabled();
});

test('station visit plays locally, pauses, returns and is cancelled by seeking', async ({ page }) => {
  test.setTimeout(60000);
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort());
  await page.goto('/animation');
  await expect(page.locator('.animation-ride')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Visit station', exact: true }).click();
  await expect(page.getByText('Under the platform canopy', { exact: true })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Pause visit', exact: true }).click();
  await page.screenshot({ path: 'evidence/station-visit-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'evidence/station-visit-mobile.png' });
  await expect(page.getByRole('button', { name: 'Resume visit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume visit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Visit station', exact: true })).toBeVisible({ timeout: 22000 });
  await page.getByRole('button', { name: 'Visit station', exact: true }).click();
  await page.getByRole('slider', { name: 'Animation route position' }).fill('2500');
  await expect(page.locator('.animation-world')).toHaveAttribute('data-visit', 'none');
  await expect(page.locator('.animation-play output')).toHaveText('2.50 km');
});
