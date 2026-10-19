---
name: graph-virtualization
description: The commit graph only renders rows/nodes/edges near the viewport (windowed).
metadata:
  type: architecture
---

Milestone 5: `CommitGraph` is windowed so large histories stay smooth (previously every commit
row + every SVG node/edge was in the DOM at once).

- The scroll container tracks `scrollTop` (onScroll) and viewport height (`ResizeObserver`,
  re-measured on `[isSearching, hasContent]` — `hasContent` matters: on first render the "No commits" early return means the container doesn't exist yet, so a mount-only measure silently left height at the 1200 fallback). A fallback height
  of 1200 covers the first paint before measurement.
- Visible index window: `firstVisible..lastVisible` from `scrollTop`/`viewportH` (÷ `ROW_H`, now 28),
  minus the working-row offset (`ROW_H` when uncommitted-changes row is shown), with an
  `OVERSCAN = 8` buffer each side.
- Only `commits.slice(first, last+1)` rows render, each **absolutely positioned** at `top =
  i * ROW_H`; the outer graph div keeps the full `svgHeight` so the scrollbar stays correct.
  SVG **nodes** render only for visible rows; **edges** render only when their vertical span
  `[min(i,pi), max(i,pi)]` intersects the window (long off-screen edges are culled).
- Iteration over `graph`/`commits` is still O(n) per render (returning null for culled items) —
  fine at the current 500-commit `log()` cap; that cap is now safe to raise since rendering is no
  longer the bottleneck (candidate for an M5 setting). The pure lane math is unchanged
  ([[commit-graph-algorithm]]). The **search results** list is not virtualized (bounded by the
  same 500, [[commit-search]]).

Related: [[commit-graph-algorithm]], [[commit-search]], [[milestone-roadmap]].
