---
name: ipc-contract
description: Where IPC channels/types live and the invoke pattern to follow when adding one.
metadata:
  type: convention
---

The IPC contract is the single source of truth shared by main, preload and renderer,
under `src/shared/` (aliased `@shared/*`):

- **`src/shared/ipc.ts`** — the `IPC` object with every channel-name constant (never hardcode
  channel strings) plus event payload types like `ProgressEvent`.
- **`src/shared/types.ts`** — all data types crossing the boundary: `Commit`, `GraphRow`,
  `FileStatus`, `StatusResult`, `Branch`, `Remote`, `Tag`, `Stash`, `DiffFile`,
  `RepoSnapshot`, and the `Result<T>` wrapper.

**Result pattern:** every main handler returns `Result<T>` (`{ok:true,value}` |
`{ok:false,error,code}`) — errors cross as DATA, never as a throw. The renderer's store has
an `unwrap()` helper that surfaces failures as toasts. `code` carries machine-readable error
kinds (e.g. `DUBIOUS_OWNERSHIP`, `NOT_A_REPO`) so the UI can offer contextual fixes.

**Rejections still exist (gotcha):** `Result` covers handler *failures*, not bridge failures.
`ipcRenderer.invoke` **rejects** when no handler is registered for a channel, and
`window.api.<group>` is **undefined** when the renderer outlives the preload that defined it —
exactly what happens in `npm run dev` when the renderer hot-reloads new UI while main/preload
still run the old bundle (symptom: a pane stuck on "Loading…" forever). Wrap such calls in the
store's `call()` helper, which converts both into a failed `Result` with code `IPC_FAILED`, and
give the pane an error state instead of an endless spinner. After changing main or preload,
**restart `npm run dev`** — a renderer reload is not enough.

**To add an operation:** (1) add a channel to `IPC`; (2) add types to `types.ts`;
(3) implement in `gitService`; (4) register in `main/ipc/index.ts` (wrap mutations with
`action()` for progress events); (5) expose in `preload/index.ts` under `window.api`;
(6) call from the store. Related: [[architecture-overview]], [[git-service]].
