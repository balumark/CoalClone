---
name: branch-manage
description: Branch rename/delete wiring (M2) incl. the NOT_MERGED force-delete flow.
metadata:
  type: decision
---

Branch delete/rename UI, added in Milestone 2 via the [[ipc-contract]] recipe. The delete
backend (`gitService.deleteBranch(name, force)`, `GitDeleteBranch`, preload) predated M2; M2
added the store action + UI for delete, and the whole stack for rename.

- **rename** in [[git-service]]: `renameBranch(oldName, newName)` → `git branch -m` (works on the
  current branch too). Channel `GitRenameBranch`.
- **NOT_MERGED code**: `toGitError()` tags `/not fully merged/i` as `code: 'NOT_MERGED'`, so the
  UI can offer a force-delete. `store.deleteBranch(name, force)` **returns the `Result<void>`**
  (unlike most void actions) and does NOT toast on NOT_MERGED — the Sidebar handles that case by
  re-confirming and calling `deleteBranch(name, true)`. Other errors are toasted by the store.
- **Sidebar** local branch rows (`!b.isRemote`) show hover ✎ (rename, `window.prompt`) and, when
  not current (`!b.current`), ⨯ (delete, `window.confirm`). Remote rows show no actions. The row
  is a `div` (not a `button`) so the action buttons can nest without invalid HTML; the main area
  keeps double-click-to-checkout.
- **Tests**: `test/gitService.integration.test.ts` → `describe('gitService branches')` covers
  rename-current, delete-merged, and refuse-then-force-delete-unmerged.

Related: [[milestone-roadmap]], [[ipc-contract]], [[git-service]], [[stash-feature]].
