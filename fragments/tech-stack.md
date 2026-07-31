---
name: tech-stack
description: The chosen technologies for Coal Clone and why each was picked.
metadata:
  type: decision
---

Coal Clone is a cross-platform desktop Git GUI built with:

- **Electron** — desktop shell; one codebase ships to Windows/macOS/Linux.
- **React 18 + TypeScript (strict)** — renderer UI.
- **electron-vite** — bundles the three Electron layers (main / preload / renderer) with Vite.
- **simple-git** — talks to the **system `git` binary** (no native compilation like nodegit);
  chosen for full feature parity and cross-platform reliability. See [[git-service]].
- **zustand** — lightweight renderer state store (`src/renderer/store/useRepoStore.ts`).
- **Tailwind CSS** — styling; dark GitKraken-style theme tokens live in `tailwind.config.js`.
- **diff2html** — renders unified diffs in the DiffViewer.
- **vitest** — unit tests (currently the pure graph algorithm, see [[commit-graph-algorithm]]).
- **electron-builder** — packaging (see [[platform]]).

Rust/Tauri was ruled out: no cargo toolchain on the dev machine and simple-git covers git fully.
Related: [[architecture-overview]], [[ipc-contract]], [[milestone-roadmap]].
