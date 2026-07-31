---
name: stash-feature
description: How stash save/apply/pop/drop is wired (M2's first feature) and its conventions.
metadata:
  type: decision
---

Stash was the first Milestone 2 feature, added end-to-end via the [[ipc-contract]] recipe.
The read side already existed before M2 (`gitService.stashes()`, `Stash` type, snapshot field,
Sidebar list); M2 added the four mutations.

- **Mutations** in [[git-service]]: `stashSave(opts)`, `stashApply(index)`, `stashPop(index)`,
  `stashDrop(index)` — each `git stash …` via simple-git's `.stash([...])`. apply/pop/drop
  address a stash by its list position as `stash@{index}` (the same `index` the read side returns).
- **Save defaults to `--include-untracked`** (GitKraken-style): the "Stash" button in
  `CommitPanel` stashes the whole working tree incl. untracked files, and reuses the commit
  message box as an optional stash label (no modal). Button is disabled on a clean tree.
- **Channels**: `GitStashSave/Apply/Pop/Drop` in `shared/ipc.ts`; save takes `StashSaveOptions`
  (`message?`, `includeUntracked?`), the others take a numeric `index`.
- **Sidebar** Stashes rows have hover actions Pop / Apply / Drop. Only **Drop** confirms
  (`window.confirm`) since it is the sole destructive one; apply/pop are recoverable.
- **Graph markers (GitKraken-style):** `Stash` now also carries `hash` + `parentHash`
  (`stashes()` reads them via `git stash list --format=%H\x1f%P\x1f%gs`; first parent = base
  commit). `CommitGraph` groups stashes by `parentHash` and renders a dotted-square badge
  (`StashBadges`, warn-colored, `border-dotted`) on that base commit's row, with a right-click
  menu (Apply/Pop/Drop).
- **`refs/stash` is excluded from the log.** `refs/stash` lives under `refs/`, so a bare
  `git log --all` DOES pull the stash's internal WIP/index/untracked commits in as regular graph
  rows (with a `refs/stash` badge). `log()` now passes `--exclude=refs/stash --all` so only the
  dotted-square markers represent stashes. (An earlier note here wrongly claimed `--all` skips
  stashes — it does not.)
- **But the stash BASE must stay in the log.** After a squash/rebase the base commit a stash sits
  on can be unreachable from every branch (only via `refs/stash`), so excluding `refs/stash` also
  dropped it and the marker had no row → stashes invisible. `log()` therefore appends each stash's
  base hash (`stashBaseHashes()` = `git stash list --format=%P`, first parent) as an explicit rev,
  bringing the base back **without** the WIP/index commits. Regression test: `gitService stash base
  visibility`.
- **Tests**: `test/gitService.integration.test.ts` → `describe('gitService stash')` covers
  save-leaves-clean, pop-restores, drop-discards on the real throwaway repo.

Related: [[milestone-roadmap]], [[ipc-contract]], [[git-service]].
