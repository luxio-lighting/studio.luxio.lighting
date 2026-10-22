import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
  // Fengari's Node entry reads process.env at module initialization. This
  // generated browser bundle eliminates Node-only modules before Vite runs.
  resolve: { alias: { fengari: fileURLToPath(new URL('./shared/web/vendor/fengari.mjs', import.meta.url)) } },
});
