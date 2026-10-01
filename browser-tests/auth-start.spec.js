import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await page.addInitScript(() => localStorage.removeItem('shosholoza_guest'));
  // Keep this test independent of the CDN and Google OAuth network.
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
});

test('first visit shows the start page and guest mode can enter the journey', async ({ page }) => {
  await page.goto('/');

  const gate = page.locator('#auth-gate');
  await expect(gate).toBeVisible();
  await expect(gate.getByRole('heading', { name: /travel the line/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /explore as guest/i })).toBeVisible();
  await expect(page.locator('#app-shell')).toBeHidden();

  await page.getByRole('button', { name: /explore as guest/i }).click();

  await expect(gate).toBeHidden();
  await expect(page.locator('#app-shell')).toBeVisible();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#account-control')).toContainText('Guest');
});

test('guest can return to sign in without losing the journey app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /explore as guest/i }).click();
  await expect(page.locator('#map')).toBeVisible();

  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.locator('#auth-gate')).toBeVisible();
  await expect(page.locator('#app-shell')).toBeHidden();
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
});
