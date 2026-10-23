import { test, expect } from '@playwright/test';
import { decodeRequest, encodeResponse } from '../shared/protocol/src/index';

test('device guidance precedes network access, supports dismissal, and appears once per page session', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15' }));
  const calls: number[] = [];
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [{ name: 'Desk', lan_ip: '192.168.1.50' }] }));
  await page.route('http://192.168.1.50/api', async route => {
    const request = decodeRequest(route.request().postDataBuffer()!); calls.push(request.operation);
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse({ id: request.id, scripts: [] })) });
  });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect with Google Chrome' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Allow local network access');
  await expect(dialog).toContainText('same local network');
  expect(calls).toEqual([]);
  await page.screenshot({ path: '.sdk/device-browser-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Simulator');
  expect(calls).toEqual([]);

  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await page.getByRole('button', { name: 'Understood', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => calls).toContain(5);
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Simulator', exact: true }).click();
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Desk');
  await expect(dialog).toBeHidden();
});

test('Chrome on iOS still receives guidance before the IP form', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.0 Mobile/15E148 Safari/604.1' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Enter IP...' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect with Google Chrome' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('computer or Android device');
  await expect(dialog.getByRole('link', { name: 'Get Google Chrome' })).toHaveAttribute('href', 'https://www.google.com/chrome/');
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: '.sdk/device-browser-mobile.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Understood', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Connect to device', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'IP address' })).toBeFocused();
});

for (const browser of ['desktop', 'Android']) {
  test(`Google Chrome on ${browser} connects directly without browser guidance`, async ({ page }) => {
    if (browser === 'Android') await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36' }));
    await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [{ name: 'Desk', lan_ip: '192.168.1.50' }] }));
    let listed = false;
    await page.route('http://192.168.1.50/api', async route => {
      const request = decodeRequest(route.request().postDataBuffer()!);
      if (request.operation === 5) listed = true;
      await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse({ id: request.id, scripts: [] })) });
    });
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Device', exact: true }).click();
    await page.getByRole('option', { name: /Desk/ }).click();
    await expect.poll(() => listed).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Device', exact: true }).click();
    await page.getByRole('option', { name: 'Enter IP...' }).click();
    await expect(page.getByRole('dialog', { name: 'Connect to device', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Connect with Google Chrome' })).toHaveCount(0);
  });
}
