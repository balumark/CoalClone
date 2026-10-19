---
name: file-context-menu
description: Right-click menu on unstaged/staged files in CommitPanel + the shell:* OS-integration IPC channels behind it.
metadata:
  type: architecture
---

Working-tree file rows in `CommitPanel` (`FileRow`) have a GitKraken-style
right-click menu (`buildFileMenu(file, isStaged)`), rendered with the shared
`ContextMenu`. Items: Stage/Unstage · Ignore (submenu: this file / all `*.ext`) ·
Stash file (unstaged only) · Open in external diff tool · Open in VS Code · Open
in default program · Show in folder · Copy file path · Create patch from file
changes · Discard changes (unstaged) · Delete file (→ OS trash).

OS integrations live under a new **`shell:*` IPC namespace** (handlers in
`main/ipc/index.ts`, exposed as `window.api.shell.*`), separate from git:
- `resolvePath` → absolute path for Copy-path (clipboard write happens in renderer)
- `showInFolder` / `openPath` (default program) → Electron `shell`
- `openInEditor` → spawns the `code` CLI (`code.cmd` + `shell:true` on Windows;
  rejects `NO_EDITOR` if not on PATH)
- `trashFile` → `shell.trashItem` (reversible, not `fs.unlink`)

All shell handlers resolve the repo-relative path via `repoAbs()`, which refuses
paths escaping the repo root (`BAD_PATH`). New git ops added for the menu:
`filePatch` (single-file `git diff [--cached] -- <path>`), `addToIgnore` (append
to root `.gitignore`, dedup), `stashFile` (`stash push -u -- <path>`), and
`externalDiff` — the only fire-and-forget one: a GUI difftool blocks until closed,
so it's a **detached spawn**, not awaited, and does NOT pause the watcher.

**Ignore gotcha:** `.gitignore` only hides UNtracked files. Ignoring a single file
routes through `ignorePath(file)`/`gitService.ignorePath`, which for a *tracked*
file (`type !== 'untracked'`) also runs `git rm --cached` so git stops surfacing it
(shows as a staged deletion; file stays on disk). The "Ignore all *.ext" item uses
the plain `addToIgnore` (pattern only, no untrack).
See [[context-menu-parity]] (graph/sidebar menus) and [[ipc-contract]].

**Row look & views:** `FileRow` shows the file name first and its folder dimmed after it, a colored status badge, and hover icon actions (+ stage / − unstage / trash discard; always visible on the selected row). The discard checkbox *replaces the badge* on hover (or while anything is ticked) so it costs no width. `FileList` renders either a flat Path view or a Tree view (`buildTree` + `compactTree` from `lib/refTree.ts` — single-child folder chains fold into one row; folders stage/unstage/discard as a whole). The Path/Tree choice is per-viewer UI state in `localStorage['coal.commitPanel.view']`. Both list headers collapse; the summary box shows a 72-char countdown.
