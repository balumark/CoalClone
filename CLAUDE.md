# CLAUDE.md — Coal Clone

Guidance for Claude (and humans) working in this repo. Read this on every session start.

## What this is

**Coal Clone** — a cross-platform desktop **GitKraken-style Git GUI**. Built incrementally
toward full functionality; Milestone 1 (core read + commit loop) is done. See
[fragments/milestone-roadmap.md](fragments/milestone-roadmap.md).

**Continuing work?** Read [docs/HANDOFF.md](docs/HANDOFF.md) (current status + next steps) and
the full approved design in [docs/plan.md](docs/plan.md).

## Memory Protocol (read first)

This project keeps durable notes in **`fragments/`**, indexed by **`MEMORY.md`**.

1. **On session start, read [`MEMORY.md`](MEMORY.md)** — it's the index of every fragment with
   a one-line description. Open the fragments relevant to your task before diving into code.
2. **When you learn something durable** (an architecture decision, a non-obvious convention, a
   gotcha, a milestone change): add a fragment to `fragments/` AND a one-line pointer in
   `MEMORY.md`.
3. **Fragment format** — one fact per file, kebab-case filename, with frontmatter:
   ```markdown
   ---
   name: <kebab-slug matching the filename>
   description: <one-line summary used for relevance during recall>
   metadata:
     type: architecture | convention | decision | roadmap | reference
   ---
   <the fact. Link related fragments with [[their-name]].>
   ```
4. **Update, don't duplicate**: if a fragment already covers the topic, edit it. **Delete**
   fragments that become wrong. Don't store what the code or git history already makes obvious.
5. Keep `MEMORY.md` in sync with `fragments/` — one line per fragment, no fact content in the index.

## Tech stack

Electron + React 18 + TypeScript (strict) · electron-vite (bundler) · simple-git (system git) ·
zustand (renderer state) · Tailwind CSS (dark theme) · diff2html (diffs) · vitest (tests) ·
electron-builder (packaging). Details + rationale: [fragments/tech-stack.md](fragments/tech-stack.md).

## Architecture (directory map)

```
src/
  shared/        # IPC contract: ipc.ts (channels), types.ts (data)  [alias @shared]
  main/          # Electron main process (all git + fs work)
    index.ts     ipc/index.ts
    git/         gitService.ts  graph.ts  watcher.ts
    repo/        repoManager.ts
  preload/       index.ts       # contextBridge -> window.api (typed)
  renderer/      # React UI  [alias @renderer]
    App.tsx  main.tsx
    store/useRepoStore.ts
    components/  Toolbar Sidebar Graph CommitDetail CommitPanel DiffViewer Welcome Toasts
    lib/         palette.ts  format.ts
    styles/
test/            # vitest (graph.test.ts)
fragments/       # project memory (see Memory Protocol)
```

Full model + data flow: [fragments/architecture-overview.md](fragments/architecture-overview.md).

## Conventions

- **All git access goes through `src/main/git/gitService.ts`** — never call git elsewhere.
- **IPC**: channels come from the `IPC` object in `src/shared/ipc.ts`; every handler returns
  `Result<T>` (errors as data, not throws). Adding an op: see
  [fragments/ipc-contract.md](fragments/ipc-contract.md).
- **Renderer never uses `ipcRenderer` directly** — only the typed `window.api` from preload.
- **State** lives in the zustand store; components subscribe with selectors.
- **TypeScript strict**, no unused locals/params; Prettier (no semicolons, single quotes).
- **Cross-platform**: use Node `path`, never hardcode separators; support native Windows and
  WSL paths. See [fragments/platform.md](fragments/platform.md).
- **Styling**: Tailwind with the theme tokens in `tailwind.config.js` (`base`, `accent`,
  `good/warn/bad`, `txt`). Graph colors: `src/renderer/lib/palette.ts`.

## Commands

```bash
npm install         # install deps (may be slow over the WSL/UNC path)
npm run dev         # launch the Electron app in dev (electron-vite)
npm run build       # production build into out/
npm run typecheck   # tsc for node + web projects
npm run lint        # eslint
npm run test        # vitest (graph algorithm)
npm run package:win # / package:mac / package:linux  -> electron-builder installers
```

## Gotchas

- Repo lives on a Windows box at a WSL path (`\\wsl.localhost\...`); dev tooling can be slow
  there. Opening WSL repos may trigger git "dubious ownership" — the app offers a one-click fix.
- The commit log is capped at 500; the graph is now windowed/virtualized (see
  [fragments/graph-virtualization.md](fragments/graph-virtualization.md)), so the cap is safe to raise.
- Per-branch ahead/behind is only computed for the current branch.

More detail for any of the above is in the linked fragments — keep them current as you work.
