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

**Rendering** is in `src/renderer/components/Graph/CommitGraph.tsx`: one `<svg>` behind a list
of commit rows, aligned by a fixed `ROW_H`. Edges are drawn per commit→parent using each row's
`lane` (parent lane looked up via a hash→index map); same-lane edges are straight lines,
cross-lane edges are cubic beziers bending at the vertical midpoint. Lane colors come from
`src/renderer/lib/palette.ts` (`LANE_COLORS`, must stay in sync with the `% 8` in graph.ts).
A "Uncommitted changes" pseudo-row sits above commit 0 when the working tree is dirty.

Not yet virtualized (fine up to the 500-commit log cap in `gitService.log`). Related:
[[git-service]], [[milestone-roadmap]].
