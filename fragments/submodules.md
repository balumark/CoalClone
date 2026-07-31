---
name: submodules
description: Submodule listing parsed from git submodule status, shown in the Sidebar.
metadata:
  type: decision
---

Milestone 5 submodule listing (read-only for now).

- **Backend** ([[git-service]]): `submodules()` runs `git submodule status` and parses each line
  into `Submodule { path, hash, shortHash, state, ref? }`. The leading status char maps to
  `state`: ` ` → ok, `+` → modified (different commit checked out), `-` → uninitialized,
  `U` → conflict. Returns `[]` (not throws) when there are none. Included in `RepoSnapshot`
  (added to the `snapshot()` `Promise.all`), so it refreshes live like tags/stashes — no separate
  channel.
- **UI**: Sidebar renders a **"Submodules"** section only when the repo has any; each row shows a
  colored state glyph, the path, and the short hash (tooltip = state + full hash + ref).
- Init/update/sync actions are **not** built yet (listing only).
- **TS note:** `Submodule.ref` is optional under `exactOptionalPropertyTypes`, so build the object
  with `...(m[3] ? { ref: m[3] } : {})` — never assign `ref: undefined`.
- Test: `submodules()` / `snapshot().submodules` return `[]` for the submodule-free test repo.

Related: [[git-service]], [[architecture-overview]], [[milestone-roadmap]].
