---
name: interactive-rebase
description: How interactive rebase (reorder/pick/squash/fixup/drop) runs non-interactively.
metadata:
  type: decision
---

Milestone 3 interactive rebase. Supports **reorder + pick / squash / fixup / drop**. Reword is
excluded on purpose (it needs live message input; HEAD reword = amend, [[history-ops]]/CommitPanel).

- **Feeding git the todo without an editor** ([[git-service]] `rebaseInteractive`): write the
  todo (`<action> <hash>` per line, in order) to a temp file, then run `git rebase -i <base>`
  with `GIT_SEQUENCE_EDITOR='cp <tmp>'` (git appends the real todo path → `cp <tmp> <todofile>`;
  `cp` ships with Git-for-Windows too, so this is cross-platform) and `GIT_EDITOR=true` so
  squash/fixup accept the default message without opening an editor. **squash keeps the combined
  message; fixup discards; reword would be a no-op → unsupported.**
- **simple-git gotcha:** simple-git's block-unsafe-operations plugin rejects `GIT_*_EDITOR` env
  with *"Use of EDITOR is not permitted without enabling allowUnsafeEditor"*. Create the instance
  as `simpleGit(repo, { unsafe: { allowUnsafeEditor: true } }).env(...)`. Safe here — the editor
  value is our own `cp`/`true`, never user input. Use a FRESH instance so the editor env doesn't
  leak onto the shared singleton.
- **base**: `rebaseInteractive(fromHash, root, items)` runs `-i --root` when the range starts at
  the first commit (`root`), else `-i <fromHash>~1` (so `fromHash` itself is editable).
- **Listing the range**: `rebaseRange(fromHash, root)` = `git log --reverse <fromHash>~1..HEAD`
  (or `HEAD` for root), oldest-first — git's todo order. Log parsing was factored into
  `parseCommits()` shared by `log()` and `rebaseRange()`.
- **UI**: graph commit menu → "Interactive rebase from here…" → `store.startInteractiveRebase`
  fetches the range into `rebasePlan`, `RebaseDialog` shows rows with an action `<select>` +
  ▲/▼ reorder. Validation: the first non-drop row must be `pick` (git rule). Start →
  `runInteractiveRebase` via `runHistoryOp` (a conflict pauses into the [[conflict-resolution]] UI).
- Test: `test/gitService.integration.test.ts` → drops a middle commit end-to-end (also proves the
  `cp` editor trick works on Windows).

Related: [[history-ops]], [[conflict-resolution]], [[git-service]], [[milestone-roadmap]].
