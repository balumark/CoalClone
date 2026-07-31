---
name: optimistic-updates
description: Why stage/unstage/discard/checkout update the UI before the snapshot reloads, and how the reconcile works.
metadata:
  type: convention
---

**A git write is fast; the snapshot after it is not.** `git add` returns in milliseconds, but
`repo.snapshot()` re-reads the log, graph, branches, remotes, tags, stashes and submodules — over
a WSL/UNC path that is seconds. Anything that `await`s `refresh()` before touching the UI
therefore *looks* broken: the click lands, the spinner comes and goes, and the row only jumps a
few seconds later.

So the rule for cheap, predictable index/working-tree ops in `useRepoStore`:

1. **Mutate the snapshot locally first** — `moveFilesLocally` (stage/unstage) and
   `dropFilesLocally` (discard) rewrite `snapshot.status.staged/unstaged` in place and return an
   **undo** closure. Types are adjusted the way git would: staged untracked → `added`, staged
   conflicted → `modified`, unstaged `added` → `untracked`. Lists are re-sorted bytewise
   (`byPath`), not with `localeCompare`, so the reconcile doesn't visibly reorder them.
2. **Then run the git call.** On failure call `undo()` (the toast already explains why).
3. **Never `await refresh()`** in these paths — `void get().refresh()` reconciles in the
   background, and its existing coalescing absorbs the watcher's event for the same change.
   **The coalescing alone is not enough, though:** a snapshot request that was *already in
   flight* when the local edit happened describes the world before it, so applying it bounces
   the row back to the old list until the next round lands (the exact "moves, jumps back, then
   moves again 2-3s later" bug). Every optimistic edit therefore bumps a module-level
   `localMutation` counter; `refresh()` captures it before the request and **discards the
   snapshot if it changed**, re-queueing instead of applying stale truth.
4. **`followSelection`** moves the DiffViewer to the other side when the file being staged is the
   one on screen; otherwise it would keep showing the side it just left (now empty).

`checkout` follows the same shape by hand (flip `status.branch` + the branches' `current` flag,
clear `busy` as soon as git returns, reconcile in the background) — see the comment there.

Do **not** extend this to operations whose result you can't predict (merge, rebase, pull, reset):
there the snapshot *is* the answer, so they keep awaiting `refresh()`.

Related: [[pull-options]] (the progress indicators these ops drive), [[architecture-overview]],
[[platform]].
