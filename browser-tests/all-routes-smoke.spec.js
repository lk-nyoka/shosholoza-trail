import { expect, test } from '@playwright/test';

const routes = ['/', '/journey', '/ai', '/destinations', '/stories', '/plan', '/credits', '/app'];

// Give each route its own page and budget. Map tiles may keep streaming after
// the application is usable, so assert UI readiness instead of network silence.
for (const route of routes) {
  test(`${route} renders without console errors or broken images`, async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${page.url()}: ${message.text()}`); });
    page.on('pageerror', error => pageErrors.push(`${page.url()}: ${error.message}`));

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.locator('body'), route).not.toHaveText('');
    const brokenImages = await page.locator('img').evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode().catch(() => {})));
      return images.filter(image => image.naturalWidth === 0)
        .map(image => image.getAttribute('src'));
    });
    expect(brokenImages, `${route} broken images`).toEqual([]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

// The satellite ride was retired for the 3D animation; old links still land.
test('/ride redirects to the 3D animation', async ({ page }) => {
  await page.goto('/ride', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/animation$/);
});
