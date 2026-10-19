---
name: commit-graph-algorithm
description: How the commit graph lanes are computed and rendered.
metadata:
  type: architecture
---

**Computation** lives in `src/main/git/graph.ts` — `computeGraph(commits)` is a **pure,
dependency-free** function (unit-tested in `test/graph.test.ts`, no repo required).

Algorithm (classic "railroad" lane assignment), input is commits newest-first with parent
hashes:
- Maintain an ordered array of active lanes; each holds the hash it's reserved for.
- Per commit: find the lane reserved for it (else allocate one) = its node lane; first parent
  reuses that lane; extra parents (merges) fork to reused/fresh lanes; duplicate reservations
  collapse into the node lane; other reserved lanes pass through.
- Emits one `GraphRow` per commit: `{ lane, color (= lane % 8), passLanes, parentEdges, width }`.

**Rendering** is in `src/renderer/components/Graph/CommitGraph.tsx` (look: see "Graph styling" below): one `<svg>` behind a list
of commit rows, aligned by a fixed `ROW_H`. Edges are drawn per commit→parent using each row's
`lane` (parent lane looked up via a hash→index map) by `edgePath()` in `lib/graphPaths.ts` (pure, tested): same-lane edges are straight; a merge's 2nd+ parent leaves the node sideways along its row and turns down into the parent lane with a rounded corner; a first parent on another lane runs down the child lane and joins the parent sideways at its row.
Lane colors come from `src/renderer/lib/palette.ts` (`LANE_COLORS`, must stay in sync with the `% 8` in graph.ts).
A "Uncommitted changes" pseudo-row sits above commit 0 when the working tree is dirty.

Not yet virtualized (fine up to the 500-commit log cap in `gitService.log`). Related:
[[git-service]], [[milestone-roadmap]].

**Graph styling (GitKraken look):** each row is tinted with its lane color (SVG rect from the node
to the message column + a fading gradient and a 2px lane-colored left rule on the message);
branch pills take the lane color (current = solid, local = tinted, remote-only = dashed) and a
connector line runs from the pills to the node; merge commits are small dots, other commits the
author avatar (selected = halo); the message shows the body flattened after the subject, dimmed.
Author/Date/SHA columns drop out (author first) when the message pane gets narrow — driven by the
measured scroll-container width. The WIP row lives INSIDE the graph as row "-1" (`workingOffset`)
with a dashed node wired to HEAD's node. Row hover/selection backgrounds must stay translucent:
rows sit above the SVG and an opaque bg would hide the edges.
