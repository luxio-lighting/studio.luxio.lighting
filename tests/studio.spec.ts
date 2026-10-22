import { test, expect } from '@playwright/test';
import { decodeRequest, encodeResponse, type Script } from '../shared/protocol/src/index';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [] }));
});

test('workspace editing, keyboard save, simulator playback, and collapse', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Aurora.lua' })).toBeVisible();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('canvas.strip-canvas').evaluate((el: HTMLCanvasElement) => {
    const data = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
    return data.some((value, i) => i % 4 !== 3 && value > 70);
  })).toBe(true);
  await page.getByRole('button', { name: 'Collapse simulator' }).click();
  await expect(page.getByLabel('LED count')).toBeHidden();
  await page.getByRole('button', { name: 'Expand simulator' }).click();
  await page.getByRole('button', { name: 'Stop test' }).click();
  await page.getByRole('button', { name: 'New animation' }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Ocean');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  await page.getByRole('textbox', { name: 'Editor content', exact: true }).press('Control+Home');
  await page.keyboard.insertText('-- Saved code\n');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toHaveText('Saved in this browser');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Ocean').source)).toContain('-- Saved code');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Ocean.lua' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Ocean.lua' }).getByLabel('Unsaved changes')).toHaveCount(0);
  await page.screenshot({ path: '.sdk/studio-desktop.png' });
  expect(errors).toEqual([]);
});

test('Enter IP, paginated device scripts, safe Test, and gradient Save', async ({ page }) => {
  const gradient: Script = { id: '11111111-1111-4111-8111-111111111111', name: 'Sunset', mode: 1, source: 'function setup()\n  luxio_set_pixel_color(0, 255, 0, 0)\nend\nfunction loop()\n  error("Gradient must not loop")\nend' };
  const second: Script = { ...gradient, id: '22222222-2222-4222-8222-222222222222', name: 'Sea' };
  const calls: ReturnType<typeof decodeRequest>[] = [];
  const previewId = '33333333-3333-4333-8333-333333333333';
  await page.route('http://192.168.1.231/api', async route => {
    const request = decodeRequest(route.request().postDataBuffer()!); calls.push(request);
    const response: any = { id: request.id };
    if (request.operation === 0) response.state = { config: { name: 'Desk strip', stripType: 'WS2805', ledCount: 60 }, brightness: 100 };
    if (request.operation === 5) { response.scripts = request.scriptOffset ? [second] : [gradient]; response.nextScriptOffset = request.scriptOffset ? 0 : 1; }
    if (request.operation === 6) response.script = gradient;
    if (request.operation === 7) response.script = { ...request.script, id: previewId };
    if (request.operation === 8) response.script = request.script;
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse(response)) });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Enter IP...' }).click();
  await page.getByRole('textbox', { name: 'IP address' }).fill('192.168.1.231');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Desk strip');
  await expect(page.getByRole('button', { name: 'Open Sea.lua' })).toBeVisible();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Aurora').source);
  await page.getByRole('button', { name: 'Open Sunset.lua' }).click();
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop test' }).click();
  await expect.poll(() => calls.filter(c => c.operation === 9).length).toBe(1);
  expect(calls.find(c => c.operation === 9)?.scriptId).toBe(previewId);
  expect(calls.filter(c => c.operation === 8)).toHaveLength(0);
  await page.getByRole('button', { name: 'Actions for Sunset' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Evening');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  await expect(page.getByRole('status')).toHaveText('Saved to device');
  expect(calls.filter(c => c.operation === 8)).toHaveLength(1);
  expect(calls.find(c => c.operation === 8)?.script).toMatchObject({ id: gradient.id, mode: 1, name: 'Evening', source: gradient.source });
  await expect(page.locator('.error-message')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Aurora').source)).toBe(original);
});

test('migrates old drafts and reports Lua errors without losing edits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('luxio-studio-draft', JSON.stringify({ name: 'Broken', source: 'function loop()\n error("Keep my edits")\nend' })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.locator('.error-message')).toContainText('Keep my edits');
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!)[0].source)).toContain('Keep my edits');
});

test('mobile keeps toolbar and simulator usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: '.sdk/studio-mobile.png' });
});


test('discovery and failed device save keep the edited document', async ({ page }) => {
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [{ name: 'Desk', lan_ip: '192.168.1.50' }] }));
  await page.route('http://192.168.1.50/api', route => {
    const request = decodeRequest(route.request().postDataBuffer()!);
    return route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse({ id: request.id, ...(request.operation === 7 ? { error: 'Script storage is full' } : {}), scripts: [] })) });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await page.getByRole('button', { name: 'Actions for Aurora' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Keep this draft');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  await expect(page.locator('.error-message')).toContainText('Script storage is full');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Keep this draft'));
  expect(draft.savedName).toBe('Aurora');
  expect(draft.address).toBeUndefined();
  expect(draft.source).toContain('function loop()');
});


test('an already removed preview does not block manual connection', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('luxio-studio-preview', JSON.stringify({ address: 'http://192.168.1.231', id: '33333333-3333-4333-8333-333333333333' })));
  const calls: ReturnType<typeof decodeRequest>[] = [];
  await page.route('http://192.168.1.231/api', async route => {
    const request = decodeRequest(route.request().postDataBuffer()!); calls.push(request);
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse({ id: request.id, ...(request.operation === 9 ? { error: 'Script not found' } : { state: { config: { name: 'Luxio S3 Mini', stripType: 'WS2805', ledCount: 60, gpio: 16, channel: 100 }, brightness: 100 } as any, scripts: [] }) })) });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Enter IP...' }).click();
  await page.getByRole('textbox', { name: 'IP address' }).fill('192.168.1.231');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Luxio S3 Mini');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.error-message')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('luxio-studio-preview'))).toBeNull();
  expect(calls.filter(call => call.operation === 9)).toHaveLength(1);
});

test('right-click actions apply to the clicked file and deletion requires confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Ember.lua', exact: true }).click({ button: 'right' });
  await expect(page.locator('.editor-tab')).toContainText('Ember.lua');
  await expect(page.getByRole('menuitem')).toHaveText(['Rename', 'Duplicate', 'Download .lua', 'Delete']);
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).hover();
  await expect(page.getByRole('menuitem', { name: 'Duplicate', exact: true })).toHaveCSS('background-color', 'rgb(64, 64, 64)');
  await page.screenshot({ path: '.sdk/studio-context-menu.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await page.getByRole('button', { name: 'Open Ember.lua', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Warm');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  await page.getByRole('button', { name: 'Open Warm.lua', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Warm copy.lua', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Warm.lua', exact: true }).click({ button: 'right' });
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download .lua', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Warm.lua');
  await page.getByRole('button', { name: 'Open Warm copy.lua', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Delete Warm copy.lua?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Warm copy.lua', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Warm copy.lua', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Warm copy.lua', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Warm.lua', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Aurora.lua', exact: true })).toBeVisible();
});

test('rename saves on blur, survives reload, and Escape cancels without saving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Aurora.lua', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('  Northern lights  ');
  await page.locator('.pane-heading').click();
  await expect(page.getByRole('button', { name: 'Open Northern lights.lua', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Saved in this browser');
  await expect(page.getByRole('button', { name: 'Open Northern lights.lua', exact: true }).getByLabel('Unsaved changes')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open Northern lights.lua', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Cancelled');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Escape');
  await expect(page.getByRole('button', { name: 'Open Northern lights.lua', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Cancelled.lua', exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Northern lights'));
  expect(saved.savedName).toBe('Northern lights');
  expect(saved.savedSource).toBe(saved.source);
});

test('renaming an unloaded device file waits for its source before saving', async ({ page }) => {
  const script: Script = { id: '11111111-1111-4111-8111-111111111111', name: 'Sea', mode: 1, source: 'function setup()\n  luxio_set_pixel_color(0, 0, 0, 255)\nend' };
  const updates: ReturnType<typeof decodeRequest>[] = [];
  let releaseSource!: () => void;
  const sourceReady = new Promise<void>(resolve => { releaseSource = resolve; });
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [{ name: 'Desk', lan_ip: '192.168.1.50' }] }));
  await page.route('http://192.168.1.50/api', async route => {
    const request = decodeRequest(route.request().postDataBuffer()!);
    const response: any = { id: request.id };
    if (request.operation === 5) response.scripts = [{ ...script, source: '' }];
    if (request.operation === 6) { await sourceReady; response.script = script; }
    if (request.operation === 8) { updates.push(request); response.script = request.script; }
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse(response)) });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: /Desk/ }).click();
  await page.getByRole('button', { name: 'Open Sea.lua', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Deep sea');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  expect(updates).toHaveLength(0);
  releaseSource();
  await expect(page.getByRole('status')).toHaveText('Saved to device');
  expect(updates).toHaveLength(1);
  expect(updates[0].script).toMatchObject({ ...script, name: 'Deep sea' });
  await expect(page.locator('.error-message')).toHaveCount(0);
});
