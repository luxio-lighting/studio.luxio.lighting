import { test, expect } from '@playwright/test';
import { decodeRequest, encodeResponse, type Script } from '../shared/protocol/src/index';

test('device workspaces show their own live library and simulator drafts stay separate', async ({ page }) => {
  const script: Script = { id: '11111111-1111-4111-8111-111111111111', name: 'Sea', mode: 2, source: 'function loop() end' };
  await page.addInitScript(() => localStorage.setItem('luxio-studio-workspace', JSON.stringify([
    { id: 'local', name: 'Local', source: 'function loop() end', mode: 2, savedName: 'Local', savedSource: 'function loop() end' },
    { id: 'stale', address: 'http://192.168.1.50', scriptId: '22222222-2222-4222-8222-222222222222', name: 'Removed', source: 'function loop() end', mode: 2, savedName: 'Removed', savedSource: 'function loop() end' },
    { id: 'edited', address: 'http://192.168.1.50', scriptId: '33333333-3333-4333-8333-333333333333', name: 'Keep edits', source: 'function loop() end -- edited', mode: 2, savedName: 'Keep edits', savedSource: 'function loop() end' },
  ])));
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [
    { name: 'Desk', lan_ip: '192.168.1.50' }, { name: 'Empty', lan_ip: '192.168.1.51' },
  ] }));
  await page.route(/http:\/\/192\.168\.1\.(50|51)\/api/, async route => {
    const request = decodeRequest(route.request().postDataBuffer()!);
    const response: any = { id: request.id };
    if (request.operation === 0) response.state = { config: { name: 'Light', stripType: 'WS2805', ledCount: 60 } };
    if (request.operation === 5) response.scripts = route.request().url().includes('.50/') ? [{ ...script, source: '' }] : [];
    if (request.operation === 6) response.script = script;
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse(response)) });
  });
  await page.goto('/');
  await expect(page.locator('.file-select')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open Local.lua' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await expect(page.locator('.file-select')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open Sea.lua' })).toBeVisible();
  await expect(page.locator('.editor-tab')).toHaveText('Sea.lua');
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Actions for Sea' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Sea copy.lua' })).toBeVisible();
  await expect(page.locator('.editor-tab')).toHaveText('Sea copy.lua');

  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Empty/ }).click();
  await expect(page.locator('.file-select')).toHaveCount(0);
  await expect(page.locator('.editor-tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeDisabled();

  script.name = 'Ocean'; // Renamed through another client while Studio was away.
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await expect(page.getByRole('button', { name: 'Open Ocean.lua' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Sea.lua' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Sea copy.lua' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Simulator', exact: true }).click();
  await expect(page.locator('.file-select')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Open Local.lua' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Keep edits.lua' })).toBeVisible();
  await expect(page.locator('.editor-tab')).toHaveText('Local.lua');
});
