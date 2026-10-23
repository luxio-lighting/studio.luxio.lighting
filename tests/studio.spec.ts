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
  await expect(page.locator('.statusbar').getByRole('status')).toHaveText('Saved in this browser');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Ocean').source)).toContain('-- Saved code');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Ocean.lua' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Ocean.lua' }).getByLabel('Unsaved changes')).toHaveCount(0);
  await page.screenshot({ path: '.sdk/studio-desktop.png' });
  expect(errors).toEqual([]);
});

test('Enter IP, paginated device scripts, RAM-only Test, and animation Save', async ({ page }) => {
  const gradient: Script = { id: '11111111-1111-4111-8111-111111111111', name: 'Sunset', mode: 2, source: 'function setup()\n  luxio_set_pixel_color(0, 255, 0, 0)\nend\nfunction loop()\n  luxio_set_pixel_color(0, 255, 0, 0)\nend' };
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
  await expect(page.getByRole('button', { name: 'Open Aurora.lua' })).toHaveCount(0);
  await expect(page.locator('.file-select')).toHaveCount(2);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Aurora').source);
  await page.getByRole('button', { name: 'Open Sunset.lua' }).click();
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop test' }).click();
  await expect.poll(() => calls.filter(c => c.operation === 11).length).toBe(1);
  expect(calls.find(c => c.operation === 31)?.script?.source).toBe(gradient.source);
  expect(calls.find(c => c.operation === 11)?.script?.name).toBe(calls.find(c => c.operation === 31)?.script?.name);
  expect(calls.filter(c => [7, 8, 9, 10].includes(c.operation))).toHaveLength(0);
  expect(calls.filter(c => c.operation === 8)).toHaveLength(0);
  await page.getByRole('button', { name: 'Actions for Sunset' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Evening');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  await expect(page.locator('.statusbar').getByRole('status')).toHaveText('Saved to device');
  expect(calls.filter(c => c.operation === 8)).toHaveLength(1);
  expect(calls.find(c => c.operation === 8)?.script).toMatchObject({ id: gradient.id, mode: 2, name: 'Evening', source: gradient.source });
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
  await expect(page.getByRole('button', { name: 'Open Aurora.lua' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New animation' }).click();
  await page.getByRole('textbox', { name: 'Animation name' }).fill('Keep this draft');
  await page.getByRole('textbox', { name: 'Animation name' }).press('Enter');
  await expect(page.locator('.error-message')).toContainText('Script storage is full');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!).find((d: any) => d.name === 'Keep this draft'));
  expect(draft.savedName).toBe('');
  expect(draft.address).toBe('http://192.168.1.50');
  expect(draft.scriptId).toBeUndefined();
  expect(draft.source).toContain('function loop()');
});


test('an already removed preview does not block manual connection', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('luxio-studio-preview', JSON.stringify({ address: 'http://192.168.1.231', id: '33333333-3333-4333-8333-333333333333' })));
  const calls: ReturnType<typeof decodeRequest>[] = [];
  await page.route('http://192.168.1.231/api', async route => {
    const request = decodeRequest(route.request().postDataBuffer()!); calls.push(request);
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse({ id: request.id, ...(request.operation === 9 ? { error: 'Animation not found' } : { state: { config: { name: 'Luxio S3 Mini', stripType: 'WS2805', ledCount: 60, gpio: 16, channel: 100 }, brightness: 100 } as any, scripts: [] }) })) });
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
  expect(calls.filter(call => call.operation === 11)).toHaveLength(1);
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
  await expect(page.locator('.statusbar').getByRole('status')).toHaveText('Saved in this browser');
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
  const script: Script = { id: '11111111-1111-4111-8111-111111111111', name: 'Sea', mode: 2, source: 'function setup()\n  luxio_set_pixel_color(0, 0, 0, 255)\nend' };
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
  await expect(page.locator('.statusbar').getByRole('status')).toHaveText('Saved to device');
  expect(updates).toHaveLength(1);
  expect(updates[0].script).toMatchObject({ ...script, name: 'Deep sea' });
  await expect(page.locator('.error-message')).toHaveCount(0);
});

test('documentation opens a static page and examples run on every strip type', async ({ page }) => {
  const { Animation } = await import('../shared/device/src/lua');
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Documentation', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/docs.html');
  const popup = page.waitForEvent('popup');
  await link.click();
  const docs = await popup;
  await expect(docs).toHaveURL(/\/docs\.html$/);
  await expect(docs).toHaveTitle('Animation documentation · Luxio Studio');
  await expect(docs.getByRole('heading', { name: 'Animation API', exact: true })).toBeVisible();
  await expect(docs.locator('script')).toHaveCount(0);
  const examples = await docs.locator('code[data-example]').allTextContents();
  expect(examples).toHaveLength(3);
  for (const source of examples) for (const strip of ['WS2812', 'WS2814', 'WS2805']) for (const count of [1, 60]) {
    const animation = new Animation(source, count, strip);
    try {
      for (let frame = 0; frame < 120; frame++) {
        const pixels = animation.tick();
        expect(pixels).toHaveLength(count);
        expect(pixels.every(pixel => Object.values(pixel).every(value => Number.isInteger(value) && value >= 0 && value <= 255))).toBe(true);
      }
    } finally { animation.close(); }
  }
  await docs.screenshot({ path: '.sdk/docs-desktop.png' });
  await docs.setViewportSize({ width: 390, height: 844 });
  await docs.screenshot({ path: '.sdk/docs-mobile.png' });
  expect(await docs.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toBeVisible();
  const bounds = await link.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await docs.close();
});

test('parameters update a running preview and Save persists values separately from source', async ({ page }) => {
  const { parseParameters } = await import('../shared/protocol/src/parameters');
  const source = '-- @parameter Flicker,Checkbox,true\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Spacing,Number,8,1,64\nlocal frames = 0\nfunction loop() frames = frames + 1; luxio_set_pixel_color(0, luxio_get_parameter("Speed"), luxio_get_parameter("Flicker") and 255 or 0, 0) end';
  await page.addInitScript(source => localStorage.setItem('luxio-studio-workspace', JSON.stringify([{ id: 'parameters', name: 'Parameters', source, mode: 2, savedName: 'Parameters', savedSource: source }])), source);
  const calls: ReturnType<typeof decodeRequest>[] = [];
  await page.route('http://192.168.1.231/api', async route => {
    const request = decodeRequest(route.request().postDataBuffer()!); calls.push(request);
    const response: any = { id: request.id, state: { build: 21, config: { name: 'Parameter light', stripType: 'WS2805', ledCount: 60 }, brightness: 18 } };
    if (request.operation === 5) response.scripts = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Parameters', source: '', mode: 2 }];
    if (request.operation === 6) response.script = { id: request.scriptId, name: 'Parameters', source, mode: 2 };
    if (request.operation === 8) response.script = request.script;
    await route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse(response)) });
  });
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Flicker', exact: true })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Speed', exact: true })).toHaveValue('50');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Enter IP...' }).click();
  await page.getByRole('textbox', { name: 'IP address' }).fill('192.168.1.231');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Device', exact: true })).toContainText('Parameter light');
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Flicker', exact: true }).uncheck();
  await page.getByRole('slider', { name: 'Speed', exact: true }).press('End');
  await expect.poll(() => calls.filter(c => c.operation === 32).at(-1)?.parameters?.[1].value).toBe(100);
  await page.getByRole('spinbutton', { name: 'Spacing', exact: true }).fill('12.5');
  await page.getByRole('spinbutton', { name: 'Spacing', exact: true }).press('Enter');
  await expect.poll(() => calls.filter(c => c.operation === 32).at(-1)?.parameters?.[2].value).toBe(12.5);
  await page.getByRole('spinbutton', { name: 'Spacing', exact: true }).fill('100');
  await page.getByRole('spinbutton', { name: 'Spacing', exact: true }).press('Enter');
  await expect(page.locator('.error-message')).toContainText('Spacing must be between 1 and 64');
  await expect(page.getByRole('spinbutton', { name: 'Spacing', exact: true })).toHaveValue('12.5');
  expect(calls.filter(c => c.operation === 31)).toHaveLength(1);
  expect(calls.filter(c => c.operation === 32).at(-1)?.parameters?.[0].value).toBe(0);
  expect(calls.some(c => c.operation === 7 || c.operation === 8)).toBe(false);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.statusbar').getByRole('status')).toHaveText('Saved to device');
  const saved = calls.find(c => c.operation === 8)!.script!;
  expect(saved.source).toBe(source); expect(saved.parameters).toEqual(parseParameters(source).map(p => ({ ...p, value: p.boolean ? 0 : p.numberInput ? 12.5 : 100 })));
  await page.screenshot({ path: '.sdk/parameters-studio.png' });
  await page.getByRole('button', { name: 'Stop test' }).click();
});

test('default animations declare valid previews and live controls', async () => {
  const { presets } = await import('../shared/web/presets');
  const { parsePreview } = await import('../shared/protocol/src/preview');
  const { parseParameters } = await import('../shared/protocol/src/parameters');
  const { Animation } = await import('../shared/device/src/lua');
  for (const preset of presets) {
    expect(parsePreview(preset.source)).toHaveLength(preset.colors.length);
    const parameters = parseParameters(preset.source);
    expect(parameters).toHaveLength(3);
    for (const parameter of parameters) {
      const animation = new Animation(preset.source, 60, 'WS2805');
      const before = structuredClone(animation.tick(1000));
      animation.update([{ ...parameter, value: parameter.boolean ? 1 - parameter.value : parameter.minimum }]);
      expect(animation.tick(0), `${preset.name}: ${parameter.name}`).not.toEqual(before);
      animation.close();
    }
  }
});

test('upgrades only untouched simulator examples', async ({ page }) => {
  const { legacyPresets } = await import('../shared/web/legacy-presets');
  const { presets } = await import('../shared/web/presets');
  const documents = legacyPresets.map(p => ({ id: p.name, name: p.name, source: p.source, savedSource: p.source, savedName: p.name, mode: 2 }));
  documents[1].source += '\n-- My edits';
  const device = { ...documents[2], id: 'device', address: 'http://192.168.1.231', scriptId: 'device-animation' };
  await page.addInitScript(documents => localStorage.setItem('luxio-studio-workspace', JSON.stringify(documents)), [...documents, device]);
  await page.goto('/');
  await expect(page.getByRole('slider', { name: 'Speed', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Spacing', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Reverse', exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('luxio-studio-workspace')!));
  expect(stored.find((d: any) => d.id === 'Aurora').source).toBe(presets[0].source);
  expect(stored.find((d: any) => d.id === 'Ember').source).toBe(documents[1].source);
  expect(stored.find((d: any) => d.id === 'device').source).toBe(device.source);
  await expect(page.getByRole('button', { name: 'Open Aurora.lua' }).getByLabel('Unsaved changes')).toHaveCount(0);
});

test('new declarations report the firmware requirement before device playback or save', async ({ page }) => {
  const source = '-- @parameter Speed,Slider,50,0,100\nfunction loop() end';
  const calls: number[] = [];
  await page.route('https://api.luxio.lighting/devices', route => route.fulfill({ json: [{ name: 'Older light', lan_ip: '192.168.1.231' }] }));
  await page.route('http://192.168.1.231/api', route => {
    const request = decodeRequest(route.request().postDataBuffer()!); calls.push(request.operation);
    const script = { id: '11111111-1111-4111-8111-111111111111', name: 'Controls', source, mode: 2 };
    return route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.from(encodeResponse({ id: request.id,
      state: { build: 20, config: { name: 'Older light', stripType: 'WS2805', ledCount: 60 } } as any,
      ...(request.operation === 5 ? { scripts: [script] } : request.operation === 6 ? { script } : {}) })) });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Device', exact: true }).click();
  await page.getByRole('option', { name: 'Older light' }).click();
  await expect(page.getByRole('slider', { name: 'Speed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.locator('.error-message')).toContainText('firmware build 21 or newer');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.error-message')).toContainText('firmware build 21 or newer');
  expect(calls.filter(operation => [7, 8, 31].includes(operation))).toEqual([]);
});
