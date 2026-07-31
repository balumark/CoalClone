---
name: commit-search
description: Commit search/filter is a client-side filter over the loaded snapshot commits.
metadata:
  type: decision
---

First Milestone 4 feature: a search box at the top of `CommitGraph`. It filters the **already
loaded** `snapshot.commits` client-side (instant, no git round-trip) — case-insensitive match on
subject, author name/email, hash prefix, or ref names.

- When the query is non-empty the graph switches to a **flat result list** (no SVG lanes — lanes
  are meaningless for a filtered subset) with a "N matches" header; empty query shows the normal
  graph. Escape clears. Row rendering is shared via the `RowContent` component (badges + subject
  + author + relative time + short hash), used by both the graph and the results list.
- **Caveat:** it only searches the loaded commits, which are capped at 500 (`gitService.log`,
  [[git-service]]/[[milestone-roadmap]]). A commit older than that won't be found. A future
  upgrade would run a git-side `git log --grep/--author` search for the full history.

Related: [[commit-graph-algorithm]], [[milestone-roadmap]].
