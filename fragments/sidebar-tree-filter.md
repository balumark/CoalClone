---
name: sidebar-tree-filter
description: GitKraken-style Sidebar — Ctrl+Alt+F filter with "Filtering n/total" bar, refs grouped into `/` folders (pure `lib/refTree.ts`), sticky section headers, persisted collapse state.
metadata:
  type: architecture
---

`Sidebar.tsx` renders LOCAL / REMOTE / TAGS / STASHES / SUBMODULES as collapsible sections with
sticky headers. Branch and tag names are split on `/` into a folder tree by
`buildTree()` in `src/renderer/lib/refTree.ts` (pure, tested in `test/refTree.test.ts`): folders
first, then leaves, case-insensitive + numeric sort; each node carries `offset` = where its segment
starts in the full matched string, so highlighting works per segment (remote trees pass
`origin/`'s length as the base offset).

**Filter**: substring, case-insensitive, over the full ref name (`origin/feature/x` for remotes,
message+branch for stashes). Ctrl+Alt+F focuses it from anywhere, Esc clears. While filtering,
every *folder* is forced open (sections keep their own state), sections with no matches are
hidden, and a remote stays visible if its name/URL matches. Folders don't match by themselves —
`folderRange()` borrows the first descendant's match to highlight the folder segment.

Collapse state (`section:*`, `local:<path>`, `remote:<name>`, `remote:<name>:<path>`, `tags:<path>`)
lives in `localStorage['coal.sidebar.collapsed']` — per-viewer UI state, wrapped in try/catch.
`origin/HEAD` is hidden. Related: [[branch-manage]], [[remote-manage]], [[tags-and-dnd]], [[context-menu-parity]].
