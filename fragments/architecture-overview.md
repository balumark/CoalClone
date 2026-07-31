---
name: architecture-overview
description: The three-layer Electron structure and how data flows through the app.
metadata:
  type: architecture
---

Three Electron layers, with a shared typed contract between them (see [[ipc-contract]]):

- **`src/main/`** — Electron main process. Owns all git work and the filesystem watcher.
  - `index.ts` — app lifecycle + the single `BrowserWindow`.
  - `ipc/index.ts` — registers every `ipcMain.handle` channel; wraps results as `Result<T>`.
  - `git/gitService.ts` — the ONLY code that touches git (see [[git-service]]).
  - `git/graph.ts` — pure commit-graph lane assignment (see [[commit-graph-algorithm]]).
  - `git/watcher.ts` — chokidar watch on the repo → debounced `repo-changed` event.
  - `repo/repoManager.ts` — open-folder dialog + recent-repos persistence (userData).
- **`src/preload/`** — `contextBridge` exposes a single typed `window.api` (no direct ipcRenderer in the UI).
- **`src/renderer/`** — React UI, driven by the zustand store `store/useRepoStore.ts`.
  Components: `Toolbar`, `Sidebar`, `Graph/CommitGraph`, `CommitDetail`, `CommitPanel`,
  `DiffViewer`, `Welcome`, `Toasts`, plus `ContextMenu`, `PromptDialog` ([[input-prompt]]),
  `RebaseDialog` ([[interactive-rebase]]), `LoadingOverlay`, `Identicon`/`Identicon/Avatar`
  ([[author-avatars]]), and `icons/RefIcons`.
- **`src/shared/`** — the IPC contract (`ipc.ts`, `types.ts`) plus `appInfo.ts`, the single source
  of the app **display name** (`APP_NAME = 'Coal Clone'`) + tagline — used by Welcome, the
  window/tab title, and `main/index.ts`'s `app.setName(APP_NAME)` (so main + renderer/GPU/utility
  processes all show "Coal Clone" in the OS task manager, not "Electron"). `appInfo.ts` also holds
  `APP_ID` (used by `app.setAppUserModelId`). `package.json` mirrors these: top-level
  `productName: "Coal Clone"` (what `app.getName()` reads) + `build.appId`/`build.productName`.
  Rename the app in `appInfo.ts` + package.json (`productName`, `build.appId`) — the only places.
  (Changing `APP_ID`/appId moves the userData folder → settings/recent reset.)

**Data flow:** renderer → `window.api.git.*` → preload `ipcRenderer.invoke` → main
`ipcMain.handle` → `gitService` → typed result back. Separately, `watcher` emits
`repo-changed`; the store calls `refresh()` (re-fetch snapshot + re-load the open diff),
so the UI stays live like GitKraken.

The renderer usually pulls a whole `RepoSnapshot` in one call (`repo:snapshot`), which
`gitService.snapshot()` builds by running status/log/branches/remotes/tags/stashes in parallel.
