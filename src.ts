import './shared/web/style.css';
import { presets } from './shared/web/presets.js';
import { requestHttp, type Color } from './shared/protocol/src/index.js';
const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
const name = document.querySelector<HTMLInputElement>('#name')!;
const count = document.querySelector<HTMLInputElement>('#count')!;
const type = document.querySelector<HTMLSelectElement>('#strip-type')!;
const brightness = document.querySelector<HTMLInputElement>('#brightness')!;
const address = document.querySelector<HTMLInputElement>('#address')!;
const message = document.querySelector<HTMLElement>('#message')!;
const canvas = document.querySelector<HTMLCanvasElement>('#strip')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const status = document.querySelector<HTMLElement>('#simulation-status')!;
let worker: Worker | undefined;
let running = false;
let pixels: Color[] = [];
let workerTimeout: ReturnType<typeof setTimeout>;
let savedScript: { address: string; id: string } | undefined;
let nextId = 1;
try {
  const draft = JSON.parse(localStorage.getItem('luxio-studio-draft') ?? 'null');
  editor.value = draft?.source ?? presets[0].source; name.value = draft?.name ?? presets[0].name;
  address.value = localStorage.getItem('luxio-studio-device') ?? '';
} catch { editor.value = presets[0].source; }
function save() {
  document.querySelector('#lines')!.textContent = editor.value.split('\n').map((_, i) => i + 1).join('\n');
  try { localStorage.setItem('luxio-studio-draft', JSON.stringify({ name: name.value, source: editor.value })); }
  catch { document.querySelector('#draft-status')!.textContent = 'Browser storage unavailable — download your draft'; }
}
function draw() {
  const scale = devicePixelRatio;
  const bounds = canvas.getBoundingClientRect(); canvas.width = bounds.width * scale; canvas.height = bounds.height * scale;
  const ctx = canvas.getContext('2d')!; ctx.scale(scale, scale);
  const total = Math.min(1024, Math.max(1, Number(count.value) || 1));
  const cell = (bounds.width - 12) / total; const y = bounds.height / 2;
  const level = Number(brightness.value) / 255;
  ctx.fillStyle = '#252630'; ctx.fillRect(0, y - 7, bounds.width, 14);
  for (let i = 0; i < total; i++) {
    const pixel = pixels[i] ?? { red: 35, green: 30, blue: 48, white: 0, warmWhite: 0, coolWhite: 0 };
    const r = Math.min(255, pixel.red + pixel.white + pixel.warmWhite + pixel.coolWhite * .8) * level;
    const g = Math.min(255, pixel.green + pixel.white + pixel.warmWhite * .73 + pixel.coolWhite * .9) * level;
    const b = Math.min(255, pixel.blue + pixel.white + pixel.warmWhite * .4 + pixel.coolWhite) * level;
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
    ctx.fillRect(6 + i * cell, y - 3, Math.max(.5, cell - 2), 6);
  }
}
function preview() {
  worker?.terminate(); clearTimeout(workerTimeout);
  const length = Number(count.value);
  if (!Number.isInteger(length) || length < 1 || length > 1024) { message.textContent = 'Choose 1–1024 controllers.'; message.classList.add('error'); return; }
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  running = true; run.textContent = '■ Stop preview'; status.textContent = '● Running'; message.textContent = ''; message.classList.remove('error');
  workerTimeout = setTimeout(() => { worker?.terminate(); running = false; run.textContent = '▶ Run preview'; status.textContent = 'Stopped'; message.textContent = 'Animation stopped responding.'; message.classList.add('error'); }, 5000);
  worker.onmessage = event => {
    clearTimeout(workerTimeout);
    workerTimeout = setTimeout(() => { worker?.terminate(); running = false; run.textContent = '▶ Run preview'; status.textContent = 'Stopped'; message.textContent = 'Animation stopped responding.'; message.classList.add('error'); }, 5000);
    if (event.data.error) {
      worker?.terminate(); clearTimeout(workerTimeout); running = false; run.textContent = '▶ Run preview'; status.textContent = 'Stopped';
      message.textContent = event.data.error; message.classList.add('error');
    } else if (event.data.pixels) { pixels = event.data.pixels; draw(); }
  };
  worker.onerror = event => { worker?.terminate(); clearTimeout(workerTimeout); running = false; run.textContent = '▶ Run preview'; status.textContent = 'Stopped'; message.textContent = event.message; message.classList.add('error'); };
  worker.postMessage({ source: editor.value, count: length, stripType: type.value });
}
editor.addEventListener('input', save); name.addEventListener('input', save);
editor.addEventListener('keydown', event => {
  if (event.key === 'Tab') { event.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); save(); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); preview(); }
});
run.onclick = () => { if (running) { worker?.terminate(); clearTimeout(workerTimeout); running = false; run.textContent = '▶ Run preview'; status.textContent = 'Paused'; } else preview(); };
count.onchange = type.onchange = () => { if (running) preview(); else draw(); };
brightness.oninput = () => { document.querySelector('#brightness-value')!.textContent = `${Math.round(Number(brightness.value) / 255 * 100)}%`; draw(); };
new ResizeObserver(draw).observe(canvas);
for (const preset of presets) {
  const button = document.createElement('button'); button.className = 'preset'; button.setAttribute('aria-pressed', 'false');
  const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = `radial-gradient(ellipse at 20% 100%,${preset.colors[0]},transparent 75%),linear-gradient(140deg,${preset.colors[1]},#24212d)`;
  const title = document.createElement('strong'); title.textContent = preset.name;
  const description = document.createElement('small'); description.textContent = preset.description;
  button.append(swatch, title, description);
  button.onclick = () => {
    if (editor.value !== preset.source && !presets.some(p => p.source === editor.value) && !confirm('Replace your current draft? Download it first if you want to keep it.')) return;
    editor.value = preset.source; name.value = preset.name; savedScript = undefined; save();
    document.querySelectorAll('.preset').forEach(el => el.setAttribute('aria-pressed', String(el === button))); preview();
  };
  document.querySelector('#presets')!.append(button);
}
document.querySelector<HTMLButtonElement>('#new')!.onclick = () => {
  if (!confirm('Start a new draft? Download your current draft first to keep it.')) return;
  editor.value = 'function setup()\nend\n\nfunction loop()\n  for i = 0, luxio_get_pixel_count() - 1 do\n    luxio_set_pixel_color(i, 255, 120, 80)\n  end\nend';
  name.value = 'Untitled'; savedScript = undefined; save(); preview();
};
document.querySelector<HTMLButtonElement>('#download')!.onclick = () => {
  const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain' }));
  const link = document.createElement('a'); link.href = url; link.download = `${name.value.replace(/[^\w -]/g, '') || 'animation'}.lua`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.querySelector<HTMLButtonElement>('#discover')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  const list = document.querySelector('#devices')!; list.replaceChildren();
  try {
    const response = await fetch('https://api.luxio.lighting/devices', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Discovery returned HTTP ${response.status}`);
    const devices = await response.json() as any[];
    if (!devices.length) { message.textContent = 'No recently reported lights found on this network. You can enter a device’s local address.'; message.classList.remove('error'); }
    for (const device of devices) {
      const item = document.createElement('button'); item.textContent = device.name; item.title = device.lan_ip;
      item.onclick = () => { address.value = device.lan_ip.includes(':') ? `[${device.lan_ip}]` : device.lan_ip; message.textContent = `${device.name} selected.`; message.classList.remove('error'); };
      list.append(item);
    }
  } catch (error) { message.textContent = `${error}. Enter a local address to connect directly.`; message.classList.add('error'); }
  finally { button.disabled = false; }
};
document.querySelector<HTMLButtonElement>('#upload')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  try {
    if (!address.value.trim()) throw new Error('Enter a device address');
    if (!name.value.trim()) throw new Error('Give this animation a name');
    const existing = savedScript?.address === address.value ? savedScript.id : undefined;
    const result = await requestHttp(address.value.trim(), { id: nextId++, operation: existing ? 8 : 7, script: { id: existing ?? crypto.randomUUID(), name: name.value.trim(), source: editor.value } });
    if (!result.script?.id) throw new Error('Device did not return a script ID');
    savedScript = { address: address.value, id: result.script.id };
    await requestHttp(address.value.trim(), { id: nextId++, operation: 10, scriptId: result.script.id });
    try { localStorage.setItem('luxio-studio-device', address.value); } catch {}
    message.textContent = `${name.value} is running on your light. Script ID: ${result.script.id}`; message.classList.remove('error');
  } catch (error) { message.textContent = `${error}. If the device is reachable, check your browser’s local-network permission and mixed-content policy.`; message.classList.add('error'); }
  finally { button.disabled = false; }
};
document.querySelector<HTMLButtonElement>('#stop-device')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  try { await requestHttp(address.value, { id: nextId++, operation: 11 }); message.textContent = 'Animation stopped on the device.'; message.classList.remove('error'); }
  catch (error) { message.textContent = String(error); message.classList.add('error'); }
  finally { button.disabled = false; }
};
save(); draw();
