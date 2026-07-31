---
name: file-history
description: Per-file commit history (git log --follow) shown in a dialog from the DiffViewer.
metadata:
  type: decision
---

Milestone 4 feature: the commit history of a single file.

- **Backend** ([[git-service]]): `fileHistory(filePath)` = `git log --follow --date-order
  --pretty=<LOG_FORMAT> -- <filePath>`, parsed via the shared `parseCommits()`. `--follow`
  tracks the file across renames. Channel `GitFileHistory` → `window.api.git.fileHistory`.
- **Trigger**: a **"History"** button in the `DiffViewer` header (works for both working-tree and
  commit diffs, using the currently shown `diff.path`).
- **Store**: `fileHistory: { path, commits } | null`; `openFileHistory(path)` fetches + opens,
  `closeFileHistory()`, and `viewFileAtCommit(hash, path)` = `selectCommit(hash)` then
  `selectCommitFile(path)` so clicking a history row jumps the main view to that commit AND
  selects this file's diff.
- **UI**: `FileHistoryDialog` (mounted in `App.tsx`) lists subject/author/relative-time/hash;
  row click → `viewFileAtCommit`.

Related: [[commit-search]], [[git-service]], [[milestone-roadmap]].
