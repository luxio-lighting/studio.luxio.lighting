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

test('an HTTP upgrade back to HTTPS stops after one attempt, including reloads', async ({ page }) => {
  let attempts = 0;
  await page.route('https://studio.luxio.lighting/**', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('../index.html', import.meta.url), 'utf8') })
    : route.abort());
  await page.route('http://studio.luxio.lighting/**', route => {
    attempts++;
    // Simulate a protocol upgrade as a new navigation so both pages stay mocked.
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(location.href.replace(/^http:/, 'https:'));</script>` });
  });
  await page.goto('https://studio.luxio.lighting/?name=Ocean#editor');
  await expect.poll(() => attempts).toBe(1);
  await expect(page).toHaveURL('https://studio.luxio.lighting/?name=Ocean#editor');
  await expect(page.locator('#root')).toBeAttached();
  await page.reload();
  await expect(page.locator('#root')).toBeAttached();
  expect(attempts).toBe(1);
});

test('blocked session storage skips the redirect safely', async ({ page }) => {
  let attempts = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.route('https://studio.luxio.lighting/**', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('../index.html', import.meta.url), 'utf8') })
    : route.abort());
  await page.route('http://studio.luxio.lighting/**', route => { attempts++; return route.abort(); });
  await page.goto('https://studio.luxio.lighting/');
  await expect(page.locator('#root')).toBeAttached();
  expect(attempts).toBe(0);
  expect(errors).toEqual([]);
});
