---
name: context-menu-parity
description: The shared branch/commit right-click menu builder, its new git ops, native dialogs, and Solo focus.
metadata:
  type: decision
---

Milestone-5 push toward GitKraken menu parity. A single shared builder feeds both the Sidebar
branch rows and the graph, so both offer the same rich action set.

- **Shared builder** `src/renderer/lib/branchMenu.ts`: `buildBranchMenu(b: Branch)` returns the
  full `MenuItem[]` (checkout, pull/push/set-upstream/fast-forward, merge/rebase, create
  branch/worktree/tag here, cherry-pick/reset/revert on tip, create patch, rename/delete, copy
  name + links, Solo). It reads everything from `useRepoStore.getState()` — callers just pass the
  branch. Also exports `remoteHttpBase(url)` (git@/ssh/https → https browse base), `copyItems(hash)`
  and `resetSubmenu(hash, current)`. `ContextMenu` only supports **one** submenu level, so the
  builder is never nested inside another submenu.
- **Sidebar** `openBranchMenu` is now a one-liner delegating to `buildBranchMenu`. The **graph**
  makes ref badges right-clickable: `RefBadges`/`RowContent` take an `onRefMenu`; `openRefMenu`
  resolves the badge to its `Branch` (or a tag menu) and opens the same menu. The commit-node menu
  gained worktree / create-patch / copy-link items via the shared helpers.
- **New git ops** in [[git-service]] (all real git, no external services): `setUpstream`,
  `fastForward` (current branch → `merge --ff-only`; else `fetch . <to>:<branch>`), `worktreeAdd`,
  `createPatch` (`format-patch -1 --stdout` → file). Wired through the [[ipc-contract]] as
  `GitSetUpstream/FastForward/WorktreeAdd/CreatePatch` + store actions `setUpstream`, `fastForward`,
  `createWorktree`, `createPatch`.
- **Native dialogs**: `DialogPickFolder` / `DialogSaveFile` channels → `window.api.dialog.pickFolder()`
  / `saveFile(defaultName)` (electron `dialog`), used by worktree (pick dir) and patch (save path).
- **Solo focus** (not a hard filter): store `soloBranch` + `setSolo`. `CommitGraph` BFS-walks
  parents from the soloed branch tip into a `soloSet`; rows/nodes/edges outside it render at low
  opacity, with an "Solo: … / Exit" banner. Cheap, no graph recompute.
- **Deliberately skipped**: "Share as Cloud Patch" (GitKraken-proprietary — we do local
  `createPatch` instead).

Related: [[git-service]], [[ipc-contract]], [[branch-manage]], [[history-ops]], [[tags-and-dnd]],
[[stash-feature]].
