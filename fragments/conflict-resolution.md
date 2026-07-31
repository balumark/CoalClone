---
name: conflict-resolution
description: How paused ops (merge/rebase/cherry-pick/revert) are detected and resolved in the UI.
metadata:
  type: decision
---

First Milestone 3 feature: resolving conflicts from merge/rebase/cherry-pick/revert. Built on the
`CONFLICT` code ([[history-ops]]) which previously only toasted.

- **Detecting the paused op** ([[git-service]] `detectOperation()`): checks `.git` markers under
  `git rev-parse --absolute-git-dir` — `rebase-merge`/`rebase-apply` → rebase, `REVERT_HEAD`,
  `CHERRY_PICK_HEAD`, `MERGE_HEAD` (checked in that order). Surfaced as `StatusResult.operation`
  (`GitOperation | null` in `types.ts`), so every status refresh knows if an op is in progress.
- **gitService methods**: `resolveConflict(paths, 'ours'|'theirs'|'mark')` runs
  `git checkout --ours/--theirs` (nothing for 'mark') then `git add` (all three end staged as
  resolved); `continueOperation()` detects the op and runs the matching continue — merge uses
  `git commit --no-edit`, the others use `git -c core.editor=true <op> --continue` (the
  `core.editor=true` no-op prevents a hung editor); `abortOperation()` runs `<op> --abort`.
- **Store**: `resolveConflict` (unwrap+refresh), `continueOperation` via `runHistoryOp`
  (a multi-step rebase can conflict again → CONFLICT toast re-shows), `abortOperation`
  (info toast + refresh).
- **UI** in `CommitPanel`: a banner shows when `status.operation` is set ("Merging — N conflicts")
  with **Continue** (disabled until 0 conflicts) + **Abort**. Conflicted files (status type
  `conflicted`) render in a "Conflicted files (N)" section as `ConflictRow`s with **Merge / AI /
  Ours / Theirs / ✓**, and a "Mark all resolved" button in the section header; files resolved
  during the operation move to a "Resolved files (M)" section with an **Undo**. Note: ours/theirs
  map directly to git's `--ours/--theirs`, which are swapped during a rebase — labels are literal,
  not branch-named (the merge tool does name both sides, see [[merge-tool]]).
- **Hunk-level resolution** happens in the built-in 3-way merge editor — see [[merge-tool]].
  The row's **Merge** button (or a double-click) opens it; the buttons here stay as the fast
  path for "just take one side".
- **Manual resolution** = edit the file (with `<<<<<<<` markers) externally, then click
  **✓** (`git add`).
- Test: `test/gitService.integration.test.ts` → `describe('gitService conflicts')` drives a real
  merge conflict → detect → resolve ours → continue.

Related: [[history-ops]], [[git-service]], [[ipc-contract]], [[milestone-roadmap]].
