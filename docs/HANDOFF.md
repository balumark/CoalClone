# Session Handoff — Coal Clone

Short brief so a fresh Claude Code session (e.g. opened in VS Code on this folder) can
continue where the previous one left off. Read this together with `../CLAUDE.md`,
`../MEMORY.md`, the `../fragments/` notes, and the full plan in `plan.md`.

## Where we are
- **Milestone 1 is built and verified.** Open repo, commit graph (SVG lanes), diff viewer
  (diff2html), stage/unstage/discard, commit, branch list + create + checkout,
  fetch/pull/push, live refresh via a `.git` watcher, recent repos, and the WSL/Windows
  "dubious ownership" one-click fix.
- **Verified on the canonical Windows path** `C:\Users\balum\Documents\code\coal-clone`:
  `npm install` clean, `npm run typecheck` clean, `npm run build` OK, `npm test` = **10/10**
  (4 graph unit tests + 6 real-repo git integration tests).
- The GUI window itself (`npm run dev`) was not click-tested in an automated environment —
  worth a quick manual smoke test when you next run it.

## How to run
```powershell
cd C:\Users\balum\Documents\code\coal-clone
npm run dev      # launches the Electron window (electron-vite dev)
npm test         # vitest
npm run build    # production build into out/
```
Run from a native Windows terminal — no `pushd`/UNC tricks needed here. See
`../fragments/platform.md` for the history of why the project lives on a Windows path.

## What's next — Milestone 2 (branch operations)
Per `plan.md` / `../fragments/milestone-roadmap.md`: merge, rebase, cherry-pick, revert,
reset; full stash (save/apply/pop/drop); branch delete/rename UI; graph drag-and-drop.
Follow the existing "add an operation" recipe in `../fragments/ipc-contract.md`
(channel → type → gitService → ipc handler → preload → store → UI).

## How to actually continue in a new session
1. Open the folder in VS Code (`File > Open Folder` → this directory), start Claude Code.
2. It auto-reads `CLAUDE.md`. Then just say, e.g.:
   > "Read MEMORY.md, the fragments, docs/plan.md and docs/HANDOFF.md, then start Milestone 2
   > (stash first)."
3. The raw chat transcript from the previous session does not transfer across machines/paths —
   this repo's memory files ARE the handoff. Keep them updated as you work (see the Memory
   Protocol in `CLAUDE.md`).
