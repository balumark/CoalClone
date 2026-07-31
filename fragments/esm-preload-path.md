---
name: esm-preload-path
description: Under "type":"module" the preload builds to .mjs; main must reference index.mjs or window.api is undefined.
metadata:
  type: convention
---

`package.json` has `"type": "module"`, so electron-vite emits the **preload as
`out/preload/index.mjs`** (not `.js`). `src/main/index.ts` must therefore set
`webPreferences.preload` to `../preload/index.mjs`.

If it points to `../preload/index.js` the file doesn't exist, the preload silently fails to
load, `window.api` is `undefined` in the renderer, and **every UI action that calls
`window.api.*` does nothing** (e.g. the Welcome "Open a repository" button appears dead, the
store's `openDialog()`/`init()` reject unhandled). This shipped unnoticed through M1 because the
GUI window was never click-tested (see docs/HANDOFF.md); fixed during M2 live testing.

Electron 33 supports ESM preload; it requires `sandbox: false` (already set). `__dirname` is
`out/main` in both dev and prod, so `../preload/index.mjs` resolves correctly in both. The main
bundle itself stays `out/main/index.js` (ESM `.js` under type:module) and is fine.

Gotcha check when the app "does nothing": open DevTools console — `window.api` being `undefined`
points straight here. Related: [[architecture-overview]], [[platform]].
