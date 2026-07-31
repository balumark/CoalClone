---
name: milestone-roadmap
description: What's built (M1) and the planned feature milestones toward full GitKraken parity.
metadata:
  type: roadmap
---

Goal: a GitCoal Clone with **full functionality**, built incrementally.

- **M1 — Core read + commit loop (DONE / current):** open repo (native + WSL), commit graph
  (SVG lanes), diff viewer (diff2html), stage/unstage/discard, commit, branch list + create +
  checkout, fetch/pull/push, live refresh via watcher, recent repos, dubious-ownership fix.
- **M2 — Branch operations (in progress):** ~~merge, rebase, cherry-pick, revert, reset~~ **DONE**
  (see [[history-ops]]); ~~full stash (save/apply/pop/drop)~~ **DONE** (see [[stash-feature]]);
  ~~branch delete/rename UI~~ **DONE** (see [[branch-manage]]); ~~drag-and-drop on the graph~~
  **DONE** (drag a local branch onto a commit to move it — see [[tags-and-dnd]]).
- **M3 — Conflicts & rewrite (DONE):** ~~conflict resolution UI (ours/theirs/manual)~~
  (see [[conflict-resolution]]); ~~3-way merge editor~~ (see [[merge-tool]]); ~~amend UI~~ (CommitPanel "Amend last commit" toggle);
  ~~interactive rebase editor~~ (see [[interactive-rebase]]; reorder/pick/squash/fixup/drop,
  reword excluded); ~~commit signing~~ (see [[commit-signing]]). Still deferred from M2:
  graph drag-and-drop.
- **M4 — Remotes & history (DONE):** ~~remote add/edit/remove~~ (see [[remote-manage]]),
  ~~tag create / push / delete~~ (see [[history-ops]], [[tags-and-dnd]]), ~~per-file history~~
  (see [[file-history]]), ~~blame~~ (see [[blame]]), ~~commit search/filter~~ (see
  [[commit-search]]). Optional `wsl git` for WSL repos deferred to M5/later.
- **M5 — Polish & platform (in progress):** ~~graph virtualization for large repos~~ **DONE**
  (see [[graph-virtualization]]); ~~settings/preferences + themes (accent)~~ **DONE** (see
  [[settings]]); ~~submodules (listing)~~ **DONE** (see [[submodules]]); **packaging verified**
  (`package:win` builds `Coal Clone.exe` win-unpacked; NSIS installer needs Windows Developer Mode
  — see [[platform]]); ~~optional AI assistance (commit messages, explain commit)~~ **DONE**
  (see [[ai-assistance]]); hooks, GPG, CI for all three OSes (remaining).

Current known simplifications to revisit: per-branch ahead/behind is only filled for the
current branch (`gitService.branches`); the commit log is capped at 500; the graph is not
virtualized. Related: [[commit-graph-algorithm]], [[git-service]].
