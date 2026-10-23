# Luxio Studio

A compact Lua workspace built with React, shadcn components, and Monaco. All protocol and simulator sources are included under `shared/`; no other Luxio checkout is needed.

```sh
npm ci
npm run check
npm run build
npm run dev
```

Select a discovered device or **Enter IP...** to connect directly. **Test** runs the current animation in the simulator and, when selected, on the device. With firmware build 13, device tests send Lua directly to RAM; only Save writes a file. Stop ends this tab’s preview without stopping a newer preview from another tab. Reloading the same tab stops an interrupted preview. **Save** saves to the selected device, or this browser when Simulator is selected. Local drafts recover automatically. Double-click a filename to rename it; Enter or leaving the field saves immediately, and Escape cancels. The file menu also offers duplicate, download, and delete. Cmd/Ctrl+S saves, and Cmd/Ctrl+Enter starts or stops a test.

Studio edits Lua animations. Native colors and gradients have separate device libraries and do not appear in the animation sidebar. The simulator renders at full brightness. Device playback uses the device’s current brightness.

Studio stays on HTTPS. Outside desktop and Android Google Chrome, the first device selection in each page session shows a dialog recommending current Google Chrome on a computer or Android device and explains the Local Network Access permission. Chrome can connect to HTTP LAN devices from HTTPS after permission is granted; other browsers may block these requests. Discovery uses the public Luxio API; device control stays on the local network. The simulator needs no device connection.

## Browser checks

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.sdk/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.sdk/playwright" npm test
```

Alternatively, set `CHROME_PATH` to a local Chrome executable. Tests start their own development server on port 5174; set `STUDIO_TEST_URL` to use another running server. Tests cover editing and recovery, simulator execution and errors, manual IP connection, discovery, device pagination, RAM-only tests, failed saves, and a narrow viewport.

Production output is `dist/`. Monaco, its worker, and the Lua runtime are bundled locally. CI builds and tests this repository alone. Shared snapshots are updated explicitly. Installed command launchers are ordinary files, not symlinks.

## Deployment

GitHub Actions deploys `main` to GitHub Pages after type checking and building pass. Browser tests run locally with `npm test`. Pull requests and other branches run checks without deploying. The workflow can also be run manually on `main`.

In repository Settings → Pages, select **GitHub Actions** as the source and set the custom domain to **studio.luxio.lighting**. Point that domain's DNS CNAME to **luxio-lighting.github.io** and enable **Enforce HTTPS**. Vite uses the root base path for this custom domain; `public/CNAME` is included in the build output.

**Documentation** in the status bar opens `/docs.html` in a new tab. The page is static HTML from `public/docs.html`, copied unchanged into `dist/` for GitHub Pages. It documents the Lua animation API, lifecycle, strip channels, runnable examples, Test/Save workflow, and device limits.

Animation parameters use leading comments such as `-- @parameter Flicker,Checkbox,true` and `-- @parameter Speed,Slider,50,0,100`. The Parameters panel shows checkboxes, sliders, and numeric inputs, applies live values to the simulator/device without restarting, and includes values when explicitly saving. Slider and Checkbox require firmware build 21+. Number uses a numeric input; Boolean remains a legacy alias for Checkbox. Draft values recover in browser storage. `/docs.html#parameters` documents the syntax and `luxio_get_parameter(name)` API.
