import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Light } from '../src/model';
import type { Request, Config } from '../shared/protocol/src/index';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
// jsdom has no top layer; exercise the popover lifecycle with DOM markers.
dom.window.HTMLElement.prototype.showPopover = function () { this.dataset.popoverOpen = 'true'; };
dom.window.HTMLElement.prototype.hidePopover = function () { delete this.dataset.popoverOpen; };
const { act, createElement, StrictMode } = await import('react');
const { createRoot } = await import('react-dom/client');
const { Settings } = await import('../src/Settings');
const { connections, DeviceConnection } = await import('../src/transport');
const { encodeRequest, decodeRequest } = await import('../shared/protocol/src/index');

test('scan budget and temporary config survive protocol encoding', () => {
  const decoded = decodeRequest(encodeRequest({ id: 1, operation: 16, wifiScanTimeoutMs: 2000, configPreview: true }));
  assert.equal(decoded.wifiScanTimeoutMs, 2000); assert.equal(decoded.configPreview, true);
});

test('post-flash setup scans, waits for Wi-Fi, previews latest LED count and commits or restores', async () => {
  const original: Config = { name: 'Desk', stripType: 'WS2812', ledCount: 60, gpio: 16, channel: 0 };
  const light: Light = { id:'usb:setup-test', address:'', transport:'usb', online:true,
    state: { build:45, deviceId:'setup-test', config:structuredClone(original), on:false, brightness:100, color:{red:0,green:255,blue:150,white:0,warmWhite:0,coolWhite:0}, activeScriptId:'',lanIp:'' },
    library: { colors:[], gradients:[], scripts:[] } };
  const writes: Request[] = [];
  let rejectSave = false;
  let stored = structuredClone(original), scanReads = 0, waiting = false, connected = false, hold: Promise<void> | undefined;
  let release: (() => void) | undefined;
  connections.set(light.id, { request: async (request: Request) => {
    writes.push(structuredClone(request));
    if (request.operation === 16) scanReads = 1;
    else if (request.operation === 0 && scanReads) scanReads--;
    if (request.operation === 4) waiting = true;
    if (request.operation === 3) {
      if (!request.configPreview && rejectSave) throw new Error('Storage unavailable');
      if (request.configPreview && hold) await hold;
      light.state.config = structuredClone(request.config!);
      if (!request.configPreview) stored = structuredClone(request.config!);
    }
    if (request.operation === 15) light.state.on = !!request.on;
    light.state.lanIp = connected ? '192.0.2.42' : '';
    return { id:request.id,error:'',state:structuredClone(light.state),networkStatus:{ connected, ssid:connected?'Guest':'',disconnectCount:0,uptimeMs:10000 },wifiScanning:!!scanReads,wifiNetworks:scanReads?[]:[{ssid:'Home',rssi:-45,passwordRequired:true},{ssid:'Guest',rssi:-60,passwordRequired:false}],scripts:[],colors:[],gradients:[] };
  }} as unknown as InstanceType<typeof DeviceConnection>);
  const root = createRoot(document.getElementById('root')!);
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label)!;
  const click = async (label: string) => { assert.ok(button(label), `Missing ${label}`); await act(async () => button(label).click()); };
  const settle = async (ms = 100) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
  let key = 0, closed = 0, closedAt = 0;
  const mount = async () => { await act(async () => root.render(createElement(StrictMode, {}, createElement(Settings, { key: ++key, setup:true, light, close() { closed++; closedAt = Date.now(); root.render(null); }, removed() {}, notice() {} })))); };
  try {
    await mount();
    assert.match(document.querySelector('dialog')!.getAttribute('aria-label')!, /Connect to Wi-Fi/);
    assert.equal(writes.find(r => r.operation === 16)?.wifiScanTimeoutMs, 2000);
    assert.match(document.querySelector('#wifi-network-trigger')!.textContent!, /Scanning…/);
    assert.equal(document.querySelector('#wifi-scan-status')!.textContent, '');
    await settle(550);
    await click('Refresh Wi-Fi networks'); await settle(550);
    assert.equal(writes.filter(r => r.operation === 16).at(-1)?.wifiScanTimeoutMs, 8000);
    await click('Select a network');
    assert.equal(document.querySelector<HTMLElement>('#wifi-network-options')!.dataset.popoverOpen, 'true');
    assert.equal(document.querySelector('#wifi-network-options')!.getAttribute('popover'), 'manual');
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role=option]')].find(o => o.textContent === 'Home')!.click());
    assert.ok(document.querySelector('input[type=password]'));
    assert.equal(document.querySelector<HTMLElement>('#wifi-network-options')!.dataset.popoverOpen, undefined);
    await click('Home');
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role=option]')].find(o => o.textContent === 'Guest')!.click());
    assert.equal(document.querySelector('input[type=password]'), null);
    await click('Connect'); assert.equal(waiting, true);
    assert.match(document.body.textContent!, /Connecting…/);
    assert.equal(button('Skip').disabled, true);
    await settle(1050); assert.match(document.body.textContent!, /Connecting…/);
    connected = true; await settle(1050); await settle();
    assert.equal(document.querySelector('dialog')!.getAttribute('aria-label'), 'LED Strip');
    assert.ok(button('More LEDs')); assert.equal(document.querySelector('[aria-label="Device name"]'), null);
    assert.equal(light.state.on, true);
    // OS key-repeat must update the physical preview before any keyup or pause.
    const countInput = document.querySelector<HTMLInputElement>('#led-count')!;
    for (const [key, repeat, expected] of [['ArrowUp', false, 61], ['ArrowUp', true, 62], ['ArrowUp', true, 63], ['ArrowDown', false, 62], ['ArrowDown', true, 61], ['ArrowDown', true, 60]] as const) {
      await act(async () => countInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, repeat, bubbles:true, cancelable:true })));
      assert.equal(countInput.value, String(expected));
      assert.equal(light.state.config.ledCount, expected, 'LED preview updates while the arrow is held');
      assert.equal(stored.ledCount, 60, 'key-repeat preview does not persist each step');
    }

    assert.equal(button('Enable Relay').getAttribute('aria-checked'), 'false');
    await click('Enable Relay'); await settle();
    assert.equal(light.state.config.relay?.enabled, true);
    assert.equal(stored.relay?.enabled, undefined, 'relay preview is not persisted');
    assert.ok(document.querySelector('[aria-label="Relay GPIO"]'));
    await click('Invert Relay'); await settle();
    assert.equal(light.state.config.relay?.inverted, true);
    const previewsBefore = writes.filter(r => r.operation === 3 && r.configPreview).length;
    hold = new Promise(resolve => { release = resolve; });
    await click('More LEDs'); await settle();
    await act(async () => { button('More LEDs').click(); button('More LEDs').click(); button('More LEDs').click(); });
    await settle();
    assert.equal((document.querySelector('#led-count') as HTMLInputElement).value, '64');
    const savingStarted = Date.now();
    await click('Save');
    assert.equal(document.querySelector('dialog')!.getAttribute('aria-label'), 'LED Strip');
    release!(); hold = undefined; await settle();
    const savingButton = document.querySelector<HTMLButtonElement>('.settings-save .sheet-button')!;
    assert.equal(savingButton.disabled, true);
    assert.equal(savingButton.getAttribute('aria-busy'), 'true');
    assert.ok(savingButton.querySelector('.spinning'));
    assert.equal(closed, 0, 'fast save keeps the feedback visible');
    await settle(1000);
    assert.ok(closedAt - savingStarted >= 1000, 'setup must not close before one second');
    assert.equal(document.querySelector('dialog'), null, 'setup closes directly to the light');
    assert.equal(stored.ledCount, 64);
    assert.equal(writes.filter(r => r.operation === 3 && r.configPreview).length, previewsBefore + 1, 'queued obsolete preview is discarded on save');
    assert.equal(closed, 1);
    assert.equal(stored.relay?.enabled, true);
    assert.equal(stored.relay?.inverted, true);
    const committed = structuredClone(stored);
    await mount(); await click('Skip'); await settle();
    await click('More LEDs'); await settle();
    const closesBeforeFailure = closed;
    rejectSave = true; await click('Save'); await settle(1050);
    assert.equal(document.querySelector('dialog')!.getAttribute('aria-label'), 'LED Strip');
    assert.match(document.querySelector('[role=alert]')!.textContent!, /Storage unavailable/);
    assert.equal(closed, closesBeforeFailure, 'failed save leaves setup open');
    assert.equal(stored.ledCount, 64);
    rejectSave = false; await click('Skip'); await settle();
    await mount(); await click('Skip'); await settle();
    await click('Fewer LEDs'); await settle();
    assert.equal(light.state.config.ledCount, 63); assert.equal(stored.ledCount, 64);
    await click('Skip'); await settle();
    assert.equal(document.querySelector('dialog'), null, 'setup closes directly to the light');
    assert.deepEqual(stored, committed); assert.deepEqual(light.state.config, committed);
    await mount(); await click('Skip'); await settle(); await click('More LEDs'); await settle();
    await act(async () => root.unmount()); await settle();
    assert.deepEqual(light.state.config, committed, 'unmount restores an unfinished preview');
  } finally {
    await act(async () => root.unmount());
    connections.delete(light.id);
  }
});

for (const reason of [15, 202, 204, 201, 210, 0]) test(`Wi-Fi connection reports fresh failure ${reason} promptly and allows retry`, async context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  localStorage.setItem('luxio-wifi-password-v1:Home', 'previous-good-password');
  const light: Light = { id:`usb:wifi-failure-${reason}`, address:'', transport:'usb', online:true,
    state:{ build:45, deviceId:`wifi-failure-${reason}`, config:{name:'Desk',stripType:'WS2812',ledCount:60,gpio:16,channel:0}, on:true,brightness:100,color:{red:0,green:255,blue:150,white:0,warmWhite:0,coolWhite:0},activeScriptId:'',lanIp:'' },
    library:{colors:[],gradients:[],scripts:[]} };
  let disconnects = 7, connected = false, credentialWrites = 0;
  connections.set(light.id, { request: async (request: Request) => {
    if (request.operation === 4) credentialWrites++;
    return { id:request.id,error:'',state:{...structuredClone(light.state),lanIp:connected?'192.0.2.42':''},
      networkStatus:{connected,ssid:connected?'Home':'',disconnectCount:disconnects,lastDisconnectReason:reason || 202,uptimeMs:10000 + Date.now()},
      wifiScanning:false,wifiNetworks:[{ssid:'Home',rssi:-40,passwordRequired:true}],scripts:[],colors:[],gradients:[] };
  }} as unknown as InstanceType<typeof DeviceConnection>);
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(Settings, {setup:true,light,close(){},removed(){},notice(){}})));
    await act(async () => context.mock.timers.tick(500));
    await act(async () => document.querySelector<HTMLButtonElement>('#wifi-network-trigger')!.click());
    await act(async () => document.querySelector<HTMLElement>('[role=option]')!.click());
    assert.equal(document.querySelector<HTMLInputElement>('#wifi-password-input')!.value, 'previous-good-password');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Show password"]')!.click());
    assert.equal(document.querySelector<HTMLInputElement>('#wifi-password-input')!.type, 'text');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Hide password"]')!.click());
    assert.equal(document.querySelector<HTMLInputElement>('#wifi-password-input')!.type, 'password');
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type=password]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'wrong-password');
      input.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    });
    await act(async () => document.querySelector<HTMLButtonElement>('.wifi-form .primary-button')!.click());
    assert.equal(credentialWrites, 1);
    await act(async () => context.mock.timers.tick(1000));
    assert.match(document.body.textContent!, /Connecting…/);
    assert.equal(document.querySelector('[role=alert]'), null, 'stale failure must not reject this attempt');
    if (reason) {
      disconnects++;
      await act(async () => context.mock.timers.tick(1000));
      assert.match(document.querySelector('[role=alert]')!.textContent!, [201,210].includes(reason) ? /compatible Wi-Fi network/ : /authentication failed/);
    } else {
      // Older devices may not report a new disconnect. The fallback is 20 s.
      for (let i = 0; i < 19; i++) await act(async () => context.mock.timers.tick(1000));
      assert.match(document.querySelector('[role=alert]')!.textContent!, /Couldn’t confirm connection/);
    }
    assert.equal(localStorage.getItem('luxio-wifi-password-v1:Home'), 'previous-good-password', 'failed attempts never replace a saved password');
    const connect = document.querySelector<HTMLButtonElement>('.wifi-form .primary-button')!;
    assert.equal(connect.disabled, false);
    assert.equal(connect.textContent, 'Connect');
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type=password]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'correct-password');
      input.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    });
    await act(async () => connect.click());
    assert.equal(credentialWrites, 2);
    await act(async () => context.mock.timers.tick(1000));
    assert.match(document.body.textContent!, /Connecting…/, 'retry ignores previous retained failure');
    connected = true;
    await act(async () => context.mock.timers.tick(1000));
    assert.equal(document.querySelector('dialog')!.getAttribute('aria-label'), 'LED Strip');
    assert.equal(localStorage.getItem('luxio-wifi-password-v1:Home'), 'correct-password', 'remember only after SSID and IP confirm connection');
  } finally {
    await act(async () => root.unmount());
    connections.delete(light.id);
    context.mock.timers.reset();
    localStorage.removeItem('luxio-wifi-password-v1:Home');
  }
});

test('selecting a USB board immediately starts flashing; cancelling does not; failed installs can retry', async context => {
  const { Flasher } = await import('../src/Flasher');
  const { ESPLoader, Transport } = await import('esptool-js');
  const port = { getInfo: () => ({usbVendorId:0x303a,usbProductId:0x1001}) } as SerialPort;
  let cancel = true, selections = 0, starts = 0;
  let rejectDetection: ((error: Error) => void) | undefined;
  const detection = new Promise<string>((_resolve, reject) => { rejectDetection = reject; });
  const serialBefore = Object.getOwnPropertyDescriptor(navigator, 'serial');
  const usbBefore = Object.getOwnPropertyDescriptor(navigator, 'usb');
  Object.defineProperty(navigator, 'serial', { configurable:true,value:{requestPort:async () => {
    selections++;
    if (cancel) throw new DOMException('Cancelled', 'NotFoundError');
    return port;
  }} });
  Object.defineProperty(navigator, 'usb', {configurable:true,value:{}});
  context.mock.method(ESPLoader.prototype, 'main', async function (this: InstanceType<typeof ESPLoader>) {
    assert.equal(this.transport.device, port, 'uses the newly selected port');
    starts++;
    if (starts === 1) return detection;
    throw new Error('Test device unavailable');
  });
  context.mock.method(Transport.prototype, 'disconnect', async () => {});
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(Flasher, {close(){},added(){}})));
    const connect = document.querySelector<HTMLButtonElement>('.flasher-actions .sheet-button')!;
    await act(async () => connect.click());
    assert.equal(starts, 0); assert.equal(selections, 1);
    assert.equal(document.querySelector('[role=alert]'), null);
    cancel = false;
    await act(async () => connect.click());
    assert.equal(starts, 1); assert.equal(selections, 2);
    assert.ok(document.querySelector('.flash-install.is-flashing'));
    assert.match(document.querySelector('.flasher-intro')!.textContent!, /Flashing…/);
    assert.equal([...document.querySelectorAll('button')].some(b => b.textContent === 'Install Luxio'), false);
    await act(async () => rejectDetection!(new Error('Test detection failed')));
    assert.match(document.querySelector('[role=alert]')!.textContent!, /Test detection failed/);
    const retry = document.querySelector<HTMLButtonElement>('.flasher-actions .sheet-button')!;
    assert.equal(retry.textContent, 'Retry'); assert.equal(retry.disabled, false);
    await act(async () => retry.click());
    assert.equal(starts, 2); assert.equal(selections, 2, 'retry reuses the same selected port');
  } finally {
    await act(async () => root.unmount());
    if (serialBefore) Object.defineProperty(navigator, 'serial', serialBefore); else Reflect.deleteProperty(navigator, 'serial');
    if (usbBefore) Object.defineProperty(navigator, 'usb', usbBefore); else Reflect.deleteProperty(navigator, 'usb');
  }
});

test('Button settings edit and save independently, hide when off, and reject shared pins', async () => {
  const light: Light = { id: 'usb:button-test', address: '', transport: 'usb', online: true,
    state: { build: 46, deviceId: 'button-test', config: { name: 'Desk', stripType: 'WS2805', ledCount: 60, gpio: 16, channel: 0, relay: { enabled: true, gpio: 17, inverted: false }, button: { enabled: false, gpio: 18, press: 0 } }, on: true, brightness: 80, color: { red: 0, green: 255, blue: 0, white: 0, warmWhite: 0, coolWhite: 0 }, activeScriptId: '', lanIp: '' },
    library: { colors: [], gradients: [], scripts: [] } };
  const writes: Request[] = [];
  connections.set(light.id, { request: async (request: Request) => {
    writes.push(structuredClone(request));
    if (request.config) light.state.config = structuredClone(decodeRequest(encodeRequest(request)).config!);
    return { id: request.id, error: '', state: structuredClone(light.state), scripts: [], colors: [], gradients: [] };
  }} as unknown as InstanceType<typeof DeviceConnection>);
  const root = createRoot(document.getElementById('root')!);
  const toggle = () => document.querySelector<HTMLButtonElement>('[aria-label="Enable Button"]')!;
  const save = () => document.querySelector<HTMLButtonElement>('button[form="settings-form"]')!;
  try {
    await act(async () => root.render(createElement(Settings, { light, close() {}, removed() {}, notice() {} })));
    assert.equal(document.querySelector('[aria-label="Button GPIO"]'), null);
    await act(async () => toggle().click());
    const gpio = document.querySelector<HTMLInputElement>('[aria-label="Button GPIO"]')!;
    assert.equal(gpio.value, '18');
    assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="Button Long Press"]')!.disabled, true);
    const action = document.querySelector<HTMLSelectElement>('[aria-label="Button Press"]')!;
    await act(async () => { action.value = '1'; action.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
    for (const pin of ['16', '17', '-1', '62']) {
      await act(async () => { setValue.call(gpio, pin); gpio.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
      assert.equal(save().disabled, true, `GPIO ${pin} must not be saved`);
    }
    await act(async () => { setValue.call(gpio, '18'); gpio.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await act(async () => save().click());
    assert.deepEqual(writes.at(-1)?.config?.button, { enabled: true, gpio: 18, press: 1 });
    assert.equal(light.state.brightness, 80);
    await act(async () => toggle().click());
    assert.equal(document.querySelector('[aria-label="Button Press"]'), null);
    await act(async () => save().click());
    assert.deepEqual(writes.at(-1)?.config?.button, { enabled: false, gpio: 18, press: 1 });
  } finally {
    await act(async () => root.unmount()); connections.delete(light.id);
  }
});
