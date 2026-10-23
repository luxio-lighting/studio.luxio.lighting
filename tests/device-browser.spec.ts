import { test, expect } from '@playwright/test';
import { decodeRequest, encodeResponse } from '../shared/protocol/src/index';

test('device guidance precedes network access, supports cancel, and appears once per page session', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Simulator');
  expect(calls).toEqual([]);

  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => calls).toContain(5);
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Simulator', exact: true }).click();
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Desk');
  await expect(dialog).toBeHidden();
});

test('manual connection shows readable guidance on narrow screens before the IP form', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Connect to device', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'IP address' })).toBeFocused();
});
