# GitCoal Clone — Plan

## Context

The user wants to build a **GitCoal Clone with full functionality** — a desktop Git
GUI (commit graph, staging, commit, branches, push/pull, merge/rebase, stash, diff
viewer, conflict resolution, etc.). The project directory
(`\\wsl.localhost\Ubuntu\home\balu\code\coal-clone`) is currently **empty** — this is
a greenfield build.

Alongside the app, the user wants a **project-local memory system** so that future
Claude sessions can pick up context quickly:
- A `fragments/` folder in the repo root holds individual memory files.
- A `MEMORY.md` index in the root lists each fragment with a one-line description.
- A `CLAUDE.md` in the root documents conventions, tech stack, architecture decisions,
  **and** the memory protocol (so every session reads it on startup and uses `fragments/`).

"Full functionality" is large, so we build **incrementally**. This plan delivers the
foundation + **Milestone 1** (core read + commit loop) and lays out the roadmap for the rest.

## Decisions (confirmed with user)

| Area | Choice |
|------|--------|
| Stack | **Electron + React 18 + TypeScript** (closest to real GitKraken) |
| Bundler | **electron-vite** (Vite for main/preload/renderer) |
| Git backend | **System git CLI via `simple-git`** (full feature parity) |
| First milestone | **Core read + commit loop** (open repo, graph, diff, stage/commit, branches, push/pull/fetch) |
| State | **Zustand** (lightweight renderer store) |
| Styling | **Tailwind CSS** + CSS variables for the dark GitKraken-style theme |
| Diff render | Parse `git diff` → render with **diff2html** (custom split/unified view) |
| Graph render | **Custom SVG** commit-graph with a lane-assignment algorithm |

Environment verified: Node v23.7.0, npm 10.9.2, git 2.45.2 (Windows). No Rust (Tauri ruled out).

## Architecture

Three Electron layers with a typed IPC contract shared between them:

```
src/
  shared/
    ipc.ts            # channel-name constants
    types.ts          # Commit, FileStatus, Branch, DiffFile, GraphRow, RepoState...
  main/
    index.ts          # app lifecycle, BrowserWindow, menu
    ipc/index.ts      # ipcMain.handle(...) registrations -> gitService
    git/
      gitService.ts   # simple-git wrapper (all git operations)
      graph.ts        # commit-graph lane assignment (pure, unit-testable)
      watcher.ts      # chokidar watch on .git -> push 'repo-changed' to renderer
    repo/
      repoManager.ts  # open-folder dialog, recent-repos persistence
  preload/
    index.ts          # contextBridge -> window.api (typed invoke wrappers)
  renderer/
    index.html  main.tsx  App.tsx
    store/useRepoStore.ts        # zustand: repo path, status, graph, selection
    components/
      Toolbar/          # push/pull/fetch/branch actions + repo switcher
      Sidebar/          # local branches, remotes, tags, stashes
      Graph/            # commit graph (SVG) + commit-list rows
      CommitDetail/     # selected commit: message, author, changed files
      DiffViewer/       # diff2html render of a file
      CommitPanel/      # staging area: unstaged/staged lists, message box, commit btn
    styles/
```

**Data flow:** renderer calls `window.api.git.*` → preload `ipcRenderer.invoke` → main
`ipcMain.handle` → `gitService` (simple-git) → typed result back. A `chokidar` watcher on
`.git/` emits `repo-changed`, which triggers the store to refetch status + graph
(debounced), so the UI stays live like GitKraken.

**Graph algorithm** (`git/graph.ts`): consume `git log --all --parents --date-order`,
assign each commit a column/lane by tracking "open" parent lanes, and emit `GraphRow`
records (row index, lane, color, edges to parents) that the SVG component draws aligned
to the commit list. Kept pure so it can be unit-tested without a repo.

## Milestone 1 — implementation steps

1. **Scaffold**: `npm create @quick-start/electron` style layout, or hand-roll
   `package.json` + `electron.vite.config.ts` + `tsconfig` (strict) + Tailwind + ESLint/Prettier.
   Add deps: `electron`, `electron-vite`, `react`, `react-dom`, `simple-git`, `zustand`,
   `chokidar`, `diff2html`, `tailwindcss`.
2. **Shared contract**: define `shared/types.ts` and `shared/ipc.ts` first (single source of truth).
3. **gitService** (`main/git/gitService.ts`) with simple-git: `openRepo`, `status`,
   `log`/`graphLog`, `diffFile(staged)`, `stage`, `unstage`, `discard`, `commit`,
   `branches`, `remotes`, `tags`, `stashes`, `currentBranch` (+ ahead/behind),
   `checkout`, `createBranch`, `fetch`, `pull`, `push`.
4. **IPC + preload**: register handlers, expose typed `window.api`.
5. **repoManager**: open-folder dialog, persist recent repos (electron `app.getPath('userData')`).
6. **watcher**: chokidar on `.git`, debounce, notify renderer.
7. **Renderer UI**: three-pane layout (Sidebar | Graph+CommitDetail | CommitPanel/Diff),
   dark theme, zustand store wiring, and the SVG commit graph.
8. **Diff viewer**: render `diffFile` output via diff2html with unified/split toggle.
9. **Actions**: stage/unstage/discard, write commit, and toolbar push/pull/fetch with
   basic progress + error toasts.

Deliberately deferred to later milestones: **M2** merge/rebase/cherry-pick/stash apply,
**M3** conflict resolution UI + interactive rebase, **M4** remotes management/tags/blame/
file-history, **M5** submodules, hooks, GPG, settings, themes.

## Memory system (explicit user requirement)

Create the project-local memory infrastructure that future sessions use.

### `fragments/` — one fact per file
Each fragment is a markdown file with frontmatter:
```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary used for relevance during recall>
metadata:
  type: architecture | convention | decision | roadmap | reference
---
<the durable fact. Link related fragments with [[their-name]].>
```
Seed fragments documenting the decisions above:
- `tech-stack.md` — Electron+React+TS, electron-vite, simple-git, zustand, Tailwind (+ why).
- `architecture-overview.md` — three-layer Electron model + data flow.
- `ipc-contract.md` — where channels/types live (`shared/ipc.ts`, `shared/types.ts`) and the invoke pattern.
- `git-service.md` — gitService is the only place that touches git; simple-git wrapper conventions.
- `commit-graph-algorithm.md` — lane-assignment approach in `graph.ts`, kept pure/testable.
- `milestone-roadmap.md` — M1..M5 scope so the next session knows what's next.
- `platform.md` — cross-platform rules (path module, CRLF/LF, git PATH detection, electron-builder targets).

### `MEMORY.md` (root index)
Loaded first each session. One line per fragment:
```markdown
# Project Memory Index

- [Tech stack](fragments/tech-stack.md) — Electron+React+TS, simple-git, why each was chosen.
- [Architecture overview](fragments/architecture-overview.md) — three-layer Electron model + data flow.
- [IPC contract](fragments/ipc-contract.md) — channels/types location and invoke pattern.
- [Git service](fragments/git-service.md) — single git touch-point; simple-git wrapper rules.
- [Commit graph algorithm](fragments/commit-graph-algorithm.md) — lane assignment in graph.ts.
- [Milestone roadmap](fragments/milestone-roadmap.md) — M1..M5 feature scope.
- [Platform rules](fragments/platform.md) — cross-platform conventions (paths, line endings, packaging).
```

### `CLAUDE.md` (root, read on every startup)
Contains: project overview, tech stack, architecture summary + directory map, conventions
(TS strict, naming, "all git access goes through gitService", IPC pattern, Tailwind theme
tokens), dev/build/lint/test commands, and a **Memory Protocol** section:

> This project keeps durable notes in `fragments/`. **On session start, read `MEMORY.md`**
> (the index) and scan for fragments relevant to your task. When you learn something durable
> (a decision, a non-obvious convention, a gotcha), add a fragment file to `fragments/`
> (one fact, frontmatter as specified) and a one-line pointer in `MEMORY.md`. Update the
> existing fragment instead of duplicating; delete fragments that become wrong. Do not store
> what the code/git history already records.

## Cross-platform support (Windows + macOS + Linux)

The stack is cross-platform by design and this is a first-class requirement:
- **Electron** builds/runs on all three OSes from one codebase.
- **simple-git** shells out to the system `git` — no native binary compilation (unlike
  nodegit), so no per-OS build headaches.
- **Packaging with `electron-builder`**: Windows → NSIS `.exe`, macOS → `.dmg`,
  Linux → `AppImage` + `.deb`. Config added to `package.json` from the start.
- **Rules enforced in code**: all filesystem paths go through Node `path` (never hardcode
  `\`/`/`); normalize CRLF/LF when parsing diffs; detect `git` on PATH per-OS with a clear
  error if missing; keep IPC/data OS-agnostic. A `platform.md` fragment records these rules.
- The dev machine's `\\wsl.localhost` UNC path is only a local dev quirk — it does not affect
  the shipped Windows/macOS/Linux builds.

### Mixed WSL + Windows repos on one Windows machine (user's setup)
The user works on one Windows box holding repos **both** natively (`C:\...`) **and** in WSL
(`\\wsl.localhost\Ubuntu\...`). Both are handled from the single Windows app:
- The open-folder dialog + recent-repos list can point at either location; Windows `git`
  reaches WSL repos over the UNC share.
- **`safe.directory` / "dubious ownership"**: opening a WSL repo from Windows git can raise
  this. The app detects the specific error and offers a one-click fix
  (`git config --global --add safe.directory <path>`) instead of failing silently.
- UNC paths are slower (watch/large log) → debounced refresh mitigates it.
- CRLF/LF and permission differences across the boundary → normalized during diff parsing.
- **Later (M4+, optional)**: for WSL repos, invoke `wsl git ...` for a more native experience;
  not needed for the MVP, where Windows git covers both locations.

## Risks / notes

- **UNC path** (`\\wsl.localhost\...`): Windows-side Node/Electron running against a WSL
  filesystem path can be slow for `npm install` and Vite file-watching. Verify the dev
  server + electron window launch early; if problematic, fall back to running from a native
  Windows path or inside WSL. Flag to user if it blocks.
- simple-git needs git on PATH — confirmed present.

## Verification

1. `npm install` completes; `npm run dev` launches the Electron window with the dark UI.
2. Open this-or-any real git repo via the folder dialog → commit graph renders with correct
   branch lanes and commit metadata.
3. Select a commit → CommitDetail lists changed files; clicking a file shows its diff in DiffViewer.
4. Edit a file in the repo → watcher auto-refreshes status; stage it, type a message, commit →
   new commit appears at the top of the graph.
5. Create/checkout a branch; run fetch, then pull/push against a remote (test repo) → ahead/behind
   updates correctly.
6. `npm run test` passes the `graph.ts` lane-assignment unit tests.
7. Confirm `MEMORY.md`, `CLAUDE.md`, and the seed `fragments/*.md` exist and cross-reference correctly.
