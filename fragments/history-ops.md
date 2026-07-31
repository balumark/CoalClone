---
name: history-ops
description: merge/rebase/cherry-pick/revert/reset wiring, the CONFLICT code, and the context-menu UI.
metadata:
  type: decision
---

Milestone 2 history/apply operations, added via the [[ipc-contract]] recipe. Channels
`GitMerge/Rebase/CherryPick/Revert/Reset`; `ResetMode = 'soft'|'mixed'|'hard'` in `types.ts`.

- **gitService** ([[git-service]]): `merge(branch)`, `rebase(branch)` (both strip a leading
  `remotes/`), `cherryPick(hash)`, `revert(hash)` (`--no-edit`), `reset(hash, mode)` (`--<mode>`).
- **CONFLICT code**: `toGitError()` tags `/conflict|could not apply|fix conflicts/i` as
  `code: 'CONFLICT'`. Full conflict-resolution UI is M3; for now the store surfaces a friendly
  toast and refreshes so the conflicted files appear in the working tree.
- **Store**: a shared `runHistoryOp(get, fn, successMsg)` helper runs each op, toasts
  success / a friendly CONFLICT message / the raw error, and **always refreshes** afterward.
- **UI — context menus** via the reusable `components/ContextMenu` (fixed-position; closes on
  outside-click / Escape / leaf-item run; supports one-level `submenu` and `separator` items —
  `label` is optional for separators):
  - **Graph** commit rows (right-click): Checkout commit (detached), Create branch here…,
    Create tag here… │ Cherry-pick, Revert, Reset <branch> here ▸ (Soft/Mixed/Hard; Hard is
    danger-styled + confirms) │ Copy SHA, Copy message (clipboard via `navigator.clipboard`,
    with an info toast). Checkout-commit reuses `store.checkout(hash)` (git checks out a hash
    detached — no new backend). Create-branch-here uses `createBranch(name, true, hash)` (the
    `startPoint` arg added in M2); Create-tag-here uses `createTag(name, hash)` (lightweight;
    `gitService.createTag` also does annotated when given a message — channel `GitCreateTag`).
  - **Sidebar** branch rows (right-click): Check out, Merge "<b>" into <current>,
    Rebase <current> onto "<b>" (confirms — rewrites history) │ Rename…, Delete │ Copy branch
    name. The hover ✎/⨯ buttons ([[branch-manage]]) stay for quick access.
  - Advanced commit ops still missing (drop/reorder/edit-message) need interactive rebase — M3.
- **Tests**: `test/gitService.integration.test.ts` → `describe('gitService history ops')` covers
  ff-merge, cherry-pick, revert, mixed-reset. Note Windows autocrlf: assert on `.trim()`ed file
  content, not exact `\n`.

Related: [[milestone-roadmap]], [[branch-manage]], [[stash-feature]], [[ipc-contract]].
