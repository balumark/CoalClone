# Project Memory Index

This file is the index of the project's durable memory. Each entry points to one
fact file in `fragments/`. Read this first, then open the fragments relevant to your
task. See the Memory Protocol in [CLAUDE.md](CLAUDE.md) for how to add/update entries.

- [Tech stack](fragments/tech-stack.md) — Electron + React + TS, electron-vite, simple-git, zustand, Tailwind, and why each was chosen.
- [Architecture overview](fragments/architecture-overview.md) — the three-layer Electron model (main / preload / renderer) and how data flows.
- [IPC contract](fragments/ipc-contract.md) — where channels/types live (`src/shared/`), the `Result<T>` pattern, and how to add an operation.
- [Git service](fragments/git-service.md) — `gitService` is the only place git is touched; simple-git wrapper conventions and gotchas.
- [Commit graph algorithm](fragments/commit-graph-algorithm.md) — pure lane assignment in `graph.ts` and how the SVG graph is rendered.
- [Platform rules](fragments/platform.md) — cross-platform conventions (paths, line endings, packaging) + the WSL/Windows mixed-repo & dubious-ownership handling.
- [Milestone roadmap](fragments/milestone-roadmap.md) — what M1 shipped and the M2–M5 plan toward full GitKraken parity.
- [Stash feature](fragments/stash-feature.md) — M2's first feature: stash save/apply/pop/drop wiring, `-u` default, and UI/confirm conventions.
- [Branch manage](fragments/branch-manage.md) — M2 branch rename/delete UI, the `NOT_MERGED` force-delete flow, and Sidebar hover-action conventions.
- [History ops](fragments/history-ops.md) — M2 merge/rebase/cherry-pick/revert/reset wiring, the `CONFLICT` code, and the right-click context-menu UI.
- [Conflict resolution](fragments/conflict-resolution.md) — M3 paused-op detection (`StatusResult.operation`) + ours/theirs/mark, Continue/Abort in CommitPanel.
- [Merge tool](fragments/merge-tool.md) — the 3-way merge editor: `merge3.ts` diff3 model from the index stages, aligned A/B/Output panes, per-line picks, Save = write + stage.
- [Interactive rebase](fragments/interactive-rebase.md) — M3 reorder/pick/squash/fixup/drop via `GIT_SEQUENCE_EDITOR=cp` + `allowUnsafeEditor`; RebaseDialog editor.
- [Commit signing](fragments/commit-signing.md) — M3 `-S` signing (Sign toggle when a key is set) + on-demand signature verification badge in CommitDetail.
- [Commit search](fragments/commit-search.md) — M4 client-side filter over loaded commits (subject/author/hash/ref); flat result list; only covers the 500 loaded commits.
- [File history](fragments/file-history.md) — M4 per-file `git log --follow` in a dialog opened from the DiffViewer "History" button.
- [Remote manage](fragments/remote-manage.md) — M4 remote add/edit-URL/remove from the Sidebar Remotes section (+ / hover ✎ ⨯).
- [Remote diagnostics](fragments/remote-diagnostics.md) — "Test connection" reachability check (ls-remote + SSH-key identity probes) explaining why fetch/pull fails; Sidebar Test button + REMOTE_ACCESS toast action.
- [Blame](fragments/blame.md) — M4 per-line `git blame --porcelain` in a dialog from the DiffViewer "Blame" button.
- [Tags & drag-and-drop](fragments/tags-and-dnd.md) — M4 tag push/delete (Sidebar) + graph DnD to force-move a local branch onto a commit (`git branch -f`).
- [Graph virtualization](fragments/graph-virtualization.md) — M5 windowed commit graph: only viewport rows/nodes/edges render; scroll/ResizeObserver-driven.
- [Settings](fragments/settings.md) — persisted prefs (auto-fetch, reopen last repo, confirm discard, diff layout, accent/avatars) + the sectioned SettingsDialog and its deep links.
- [SSH & auth](fragments/ssh-auth.md) — in-app SSH keys (list/generate/agent), pinning a key to a repo via `core.sshCommand`, and the git identity editor.
- [Submodules](fragments/submodules.md) — M5 read-only submodule listing (`git submodule status`) in the Sidebar, via the snapshot.
- [ESM preload path](fragments/esm-preload-path.md) — under `type:module` the preload is `.mjs`; main must load `index.mjs` or `window.api` is undefined and the whole UI goes dead.
- [diff2html theming](fragments/diff2html-theming.md) — control diff colors by setting both `--d2h-*`/`--d2h-dark-*` vars (soft palette), and the static line-number fix for scroll drift.
- [Initialize a non-repo](fragments/init-non-repo.md) — opening a plain folder offers "Initialize" (`repo:init`) instead of erroring; `askConfirm` + the `NO_DIR` guard.
- [Missing remote](fragments/missing-remote.md) — `ensureRemote()` asks for the origin URL before fetch/pull/push; the `NO_REMOTE` error code.
- [Dark native widgets](fragments/dark-native-widgets.md) — `nativeTheme.themeSource = 'dark'` for select popups/dialogs, and using ContextMenu instead of `<select>` in the chrome.
- [Input prompt](fragments/input-prompt.md) — Electron has no `window.prompt`; use the store's `askInput()` + `PromptDialog` modal for all text entry.
- [Author avatars](fragments/author-avatars.md) — Gravatar fetched in main (data: URI to bypass renderer CSP) with identicon fallback; the general "proxy external fetches through main" rule.
- [Pull options](fragments/pull-options.md) — the Pull split-button dropdown: Fetch All + persisted pull mode (ff / ff-only / rebase) and its full IPC/settings wiring.
- [Context menu parity](fragments/context-menu-parity.md) — shared `buildBranchMenu` for Sidebar + graph, new git ops (set-upstream/fast-forward/worktree/patch), native dialogs, and Solo focus.
- [Filemode clean tree](fragments/filemode-clean-tree.md) — every git call runs `-c core.fileMode=false` so WSL/Windows exec-bit flips don't make pull/rebase/checkout refuse a "dirty" tree the UI shows as clean.
- [Reserved filenames](fragments/reserved-filenames.md) — `NUL`/`CON`/`COM1`… committed from Linux can't exist on Windows: phantom deletion that blocks discard/stash/pull, and the `RESERVED_NAME` handling.
- [Profiles & tabs](fragments/profiles-and-tabs.md) — repository tabs + the Repositories/clone/create screen, and profiles owning the SSH key, identity, settings, AI keys, recent list and open tabs (all swapped on switch).
- [Optimistic updates](fragments/optimistic-updates.md) — stage/unstage/discard/checkout move the UI first and reconcile the (slow) snapshot in the background, with an undo when git refuses.
- [AI assistance](fragments/ai-assistance.md) — enable/provider/API-key settings (safeStorage-encrypted), `aiService` as the single AI entry point, and the six features (commit message, explain, stash name, PR draft, conflict merge, commit composer).
- [File context menu](fragments/file-context-menu.md) — right-click menu on staged/unstaged files in CommitPanel + the `shell:*` OS-integration IPC (open/reveal/editor/trash) and per-file git ops (patch/ignore/stash/difftool).
