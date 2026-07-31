---
name: blame
description: Per-line git blame parsed from porcelain, shown in a dialog from the DiffViewer.
metadata:
  type: decision
---

Milestone 4 blame: who last changed each line of a file.

- **Backend** ([[git-service]]): `blame(filePath)` runs `git blame --porcelain -- <file>` and parses
  it into `BlameLine[]` (`{ line, content, hash, shortHash, author, authorTime, summary }`).
  Porcelain lists full commit metadata (author/author-time/summary) once per commit, then repeats
  just the `<sha> <orig> <final>` header + a `\t`-prefixed content line for each blamed line — so
  the parser caches metadata in a Map keyed by sha and emits one BlameLine per content line.
  Not-yet-committed lines have an all-zero sha (`shortHash === '0000000'`). Channel `GitBlame`.
- **UI**: a **"Blame"** button in the `DiffViewer` header (only for non-binary files). `BlameDialog`
  (mounted in `App.tsx`) shows each line: `shortHash · author · relative-time | line# | content`
  in monospace. Clicking a line's commit → `viewFileAtCommit(hash, path)` (jumps the main view;
  disabled for uncommitted lines).
- Store: `blame: { path, lines } | null` + `openBlame(path)` / `closeBlame()`.
- Test: `describe('gitService blame')` checks line content + author + a real (non-zero) sha.

Related: [[file-history]], [[git-service]], [[milestone-roadmap]].
