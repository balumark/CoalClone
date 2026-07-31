---
name: git-service
description: gitService is the single git touch-point; conventions for extending it.
metadata:
  type: convention
---

`src/main/git/gitService.ts` is the ONLY module that talks to git. Everything else reaches
git through it via IPC. It wraps `simple-git` (which shells out to system git), so it behaves
identically on all platforms (see [[platform]]).

Conventions:
- Every method wraps errors through `toGitError()`, which tags known cases with a `code`:
  `DUBIOUS_OWNERSHIP` (WSL/Windows boundary), `NOT_A_REPO`, `NO_REPO`. The UI keys off `code`.
- `openRepo()` validates via `checkIsRepo()` and normalizes to `--show-toplevel`.
- **Commit log** is read with a custom `--pretty=format` using unit (`\x1f`) and record (`\x1e`)
  separators so parents (`%P`) and ref names (`%D`) parse reliably; `--all` includes all branches.
  A repo with no commits returns `[]` instead of throwing.
- **Diffs**: tracked files use `git diff` / `git diff --cached`; an untracked file has no git
  diff, so `untrackedDiff()` synthesizes an all-additions unified patch from the file content
  (with binary detection via NUL byte). `splitPatch()` breaks a combined patch into per-file
  `DiffFile`s and counts +/- lines.
- `snapshot()` gathers status/log/branches/remotes/tags/stashes in parallel and runs
  `computeGraph()` (see [[commit-graph-algorithm]]).
- Core mutations: `stage`/`unstage`/`discard`/`commit`/`checkout`/`createBranch`/`deleteBranch`/
  `renameBranch`/`createTag`/`fetch`/`pull`/`push`. `push` uses `--force-with-lease` (never bare
  `--force`) and auto-adds `--set-upstream` when there is no upstream. `commit` takes `amend`/`sign`.
- History/rewrite mutations live here too but are documented in their feature fragments:
  stash ([[stash-feature]]); merge/rebase/cherry-pick/revert/reset ([[history-ops]]);
  resolveConflict/continueOperation/abortOperation + `detectOperation` ([[conflict-resolution]]);
  rebaseRange/rebaseInteractive ([[interactive-rebase]]); signatureInfo + signingConfigured
  ([[commit-signing]]). Log parsing is shared via `parseCommits()`.

Exported as a singleton `gitService`. Related: [[ipc-contract]], [[architecture-overview]].
