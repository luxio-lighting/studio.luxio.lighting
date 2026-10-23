# Luxio Studio

A compact Lua workspace built with React, shadcn components, and Monaco. All protocol and simulator sources are included under `shared/`; no other Luxio checkout is needed.

```sh
npm ci
npm run check
npm run build
npm run dev
```

Select a discovered device or **Enter IP...** to connect directly. **Test** runs the current script in the simulator and, when selected, on the device. Device tests use a temporary script; Stop removes it without overwriting a saved animation. Reloading the same tab cleans up an interrupted test. **Save** saves to the selected device, or this browser when Simulator is selected. Local drafts recover automatically. Double-click a filename to rename it; Enter or leaving the field saves immediately, and Escape cancels. The file menu also offers duplicate, download, and delete. Cmd/Ctrl+S saves, and Cmd/Ctrl+Enter starts or stops a test.

Gradient scripts keep their firmware mode: the simulator runs `setup()` once without calling `loop()`. The simulator renders at full brightness. Device playback uses the device’s current brightness.

Studio attempts to redirect HTTPS visits to HTTP once per tab so it can connect to HTTP LAN devices. The redirect preserves the path, query, and fragment. If the browser upgrades back to HTTPS, Studio stays there instead of looping; HTTP device access may still be blocked. If session storage is unavailable, the automatic redirect is skipped. Direct device requests remain subject to the browser’s local-network permissions. Discovery uses the public Luxio API; device control stays on the local network. Browser storage is separate for HTTP and HTTPS, so drafts previously saved on HTTPS do not appear in the HTTP workspace.

## Browser checks

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.sdk/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.sdk/playwright" npm test
```

Alternatively, set `CHROME_PATH` to a local Chrome executable. Tests start their own development server on port 5174; set `STUDIO_TEST_URL` to use another running server. Tests cover editing and recovery, simulator execution and errors, manual IP connection, discovery, device pagination, temporary tests, gradient mode, failed saves, and a narrow viewport.

Production output is `dist/`. Monaco, its worker, and the Lua runtime are bundled locally. CI builds and tests this repository alone. Shared snapshots are updated explicitly. Installed command launchers are ordinary files, not symlinks.

## Deployment

GitHub Actions deploys `main` to GitHub Pages after type checking, building, and browser tests pass. Pull requests and other branches run checks without deploying. The workflow can also be run manually on `main`.

In repository Settings → Pages, select **GitHub Actions** as the source and set the custom domain to **studio.luxio.lighting**. Point that domain's DNS CNAME to **luxio-lighting.github.io** and leave **Enforce HTTPS** disabled to avoid a redirect loop with Studio’s JavaScript redirect. Vite uses the root base path for this custom domain; `public/CNAME` is included in the build output.
