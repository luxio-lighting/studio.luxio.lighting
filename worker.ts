import { Animation } from './shared/device/src/lua.js';
let animation: Animation | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
self.onmessage = event => {
  clearInterval(timer); animation?.close(); animation = undefined;
  if (event.data.stop) return;
  try {
    animation = new Animation(event.data.source, event.data.count, event.data.stripType);
    timer = setInterval(() => {
      try { self.postMessage({ pixels: event.data.mode === 1 ? animation!.pixels : animation!.tick() }); }
      catch (error) { clearInterval(timer); animation?.close(); self.postMessage({ error: String(error) }); }
    }, 33);
    self.postMessage({ ready: true });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
