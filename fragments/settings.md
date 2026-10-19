---
name: settings
description: Persisted user preferences (auto-fetch, startup, safety, appearance) and the sectioned Settings dialog.
metadata:
  type: decision
---

Milestone 5 settings/preferences, persisted to `userData/settings.json` (main `settings.ts`,
same pattern as recent-repos). Shape `AppSettings { accent, avatars, commitLimit, pullMode }` in `types.ts`;
channels `SettingsGet`/`SettingsSet` → `window.api.settings.get/set`. Store holds `settings` +
`settingsOpen`; `init()` loads them and applies the accent; `updateSettings(patch)` persists,
updates state, re-applies accent, and re-`refresh()`es when `commitLimit` changed.

- **Accent theming (no light mode):** `tailwind.config.js` accent token is
  `rgb(var(--accent) / <alpha-value>)` / `--accent-hover`, with defaults in `index.css :root`.
  `lib/accents.ts` holds the presets and `applyAccent(key)` sets those CSS vars on
  `documentElement` — retinting every `accent`/`accent/alpha` class app-wide, no rebuild. Only the
  accent is themeable; base/text stay dark (a full light theme was out of scope).
- **Avatars toggle:** `Avatar` reads `settings.avatars`; off → identicon only, no Gravatar network
  ([[author-avatars]]).
- **Commit limit:** the `RepoSnapshot` ipc handler reads `settings.commitLimit` and passes it to
  `gitService.snapshot(ref, logLimit)` → `log(limit)`. Safe to raise now that the graph is
  windowed ([[graph-virtualization]]).
- **Auto-fetch (`autoFetchMinutes`, 0 = off):** a single renderer-side `setInterval` in the store
  (`scheduleAutoFetch`), re-armed by `init()` and by `updateSettings`. It skips while `busy`/
  `loading` (never competes with a checkout for the index lock) and **stays silent on failure** —
  an unreachable remote must not toast every few minutes. Kept in the renderer deliberately: it
  reuses the existing fetch IPC + refresh coalescing instead of a second timer in main.
- **`reopenLastRepo`** (default on): `init()` opens `recent[0]` after booting.
- **`confirmDiscard`** (default on): gates every `window.confirm` before a discard in `CommitPanel`,
  including the hover ⨯ on a file row (which previously had no confirmation at all).
- **`diffFormat`**: the DiffViewer's side-by-side/unified toggle now *is* this setting, so the
  layout survives restarts.

**UI:** the gear in the `Toolbar` opens `SettingsDialog`, a GitKraken-style two-pane modal —
section list on the left, settings on the right. Sections: **General** (auto-fetch, pull mode,
commit limit, reopen last repo, confirm discard), **Git profile** (`ProfileSection.tsx`),
**SSH & auth** (`SshSection.tsx`, see [[ssh-auth]]), **Appearance** (accent, avatars, diff layout).
`setSettingsOpen(open, tab?)` deep-links a section — used by the "Fix authentication…" button in
the Remote Diagnostics dialog and the "SSH keys…" toast action. Shared `Row`/`Check`/`inputClass`
helpers are exported from `SettingsDialog.tsx`; new sections should reuse them.

Related: [[ssh-auth]], [[graph-virtualization]], [[author-avatars]], [[architecture-overview]], [[milestone-roadmap]].

**Dialog look (shared building blocks):** `SettingsDialog.tsx` exports `Row`, `Card` (rounded group of rows), `SectionTitle`, `Check` (renders an on/off *switch* — the name stayed for existing call sites), `inputClass` and `btn.{primary,secondary,danger,small}`. New settings UI should use these rather than inline Tailwind so every page stays consistent. The nav has an icon per tab (icons in `components/icons/UiIcons.tsx`), each page gets a header from `TABS[].description`, the nav footer names the profile being edited, and the dialog footer says where the page writes: profile (auto-saved), git config (Git identity), or ~/.ssh / repo config (SSH).
