import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('HTTPS redirects to HTTP preserving the path, query, and fragment', async ({ page }) => {
  await page.route('https://studio.luxio.lighting/**', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('../index.html', import.meta.url), 'utf8') })
    : route.abort());
  await page.route('http://studio.luxio.lighting/**', route => route.fulfill({ contentType: 'text/html', body: 'HTTP Studio' }));
  await page.goto('https://studio.luxio.lighting/animations?name=Ocean#editor');
  await expect(page).toHaveURL('http://studio.luxio.lighting/animations?name=Ocean#editor');
  await expect(page.locator('body')).toHaveText('HTTP Studio');
});

test('workspace works without the secure-context randomUUID API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, writable: true, configurable: true }));
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Aurora.lua' })).toBeVisible();
  await page.getByRole('button', { name: 'New animation' }).click();
  await expect(page.getByRole('textbox', { name: 'Animation name' })).toBeVisible();
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).map((document: { id: string }) => document.id));
  expect(ids.length).toBeGreaterThan(1);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(errors).toEqual([]);
});
