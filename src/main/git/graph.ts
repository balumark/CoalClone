import type { CommitRef, GraphRow, GraphLane, GraphEdge } from '@shared/types'

// Commit-graph lane assignment.
//
// Input: commits in topological/date order (newest first), each with parent hashes.
// Output: one GraphRow per commit, aligned 1:1 with the input list, describing which
// lane (column) the commit node sits in, which lanes pass through vertically, and the
// edges dropping to each parent's lane. Rendering (SVG) consumes these rows.
//
// Algorithm (classic "railroad" layout):
//   We keep an ordered array of "active lanes". Each active lane holds the commit hash
//   it is currently waiting to reach (i.e. a parent that some earlier commit pointed to).
//   For each commit (top to bottom):
//     1. Find the first active lane reserved for this commit -> that's its node lane.
//        If none, allocate a new lane at the end.
//     2. The commit's first parent reuses the commit's lane; additional parents each
//        take/reuse a lane (merge fork-out).
//     3. Lanes reserved for other commits pass straight through this row.
//   Colors are assigned per-lane by lane index (stable-ish, cycles through a palette).
//
// Kept pure and dependency-free so it can be unit-tested without a git repo.

const PALETTE_SIZE = 8

function colorForLane(lane: number): number {
  return lane % PALETTE_SIZE
}

/** Find index of first active lane awaiting `hash`, or -1. */
function findLane(active: (string | null)[], hash: string): number {
  return active.indexOf(hash)
}

/** Find first free (null) slot, or -1. */
function firstFree(active: (string | null)[]): number {
  return active.indexOf(null)
}

export function computeGraph(commits: CommitRef[]): GraphRow[] {
  const rows: GraphRow[] = []
  // active[lane] = hash this lane is currently reserved for (the commit we expect next
  // in that column), or null if the lane is free.
  const active: (string | null)[] = []

  for (const commit of commits) {
    // 1. Determine this commit's node lane.
    let nodeLane = findLane(active, commit.hash)
    if (nodeLane === -1) {
      // Nothing reserved this commit -> it's a tip. Take a free lane or append.
      const free = firstFree(active)
      nodeLane = free === -1 ? active.length : free
      if (nodeLane === active.length) active.push(null)
    }

    // Collect other lanes reserved for *different* commits: they pass through this row.
    const passLanes: GraphLane[] = []
    for (let l = 0; l < active.length; l++) {
      if (l === nodeLane) continue
      const h = active[l]
      if (h !== null && h !== commit.hash) {
        passLanes.push({ lane: l, color: colorForLane(l) })
      }
    }

    // Any *duplicate* reservations of this commit in other lanes collapse into the
    // node lane (multiple children pointing at the same commit). Free those lanes.
    for (let l = 0; l < active.length; l++) {
      if (l !== nodeLane && active[l] === commit.hash) active[l] = null
    }

    // 2. Route parents. First parent stays in nodeLane; extra parents fork to new lanes.
    const parentEdges: GraphEdge[] = []
    const parents = commit.parents
    if (parents.length === 0) {
      // Root commit: its lane closes.
      active[nodeLane] = null
    } else {
      // First parent continues in the node lane.
      active[nodeLane] = parents[0]
      parentEdges.push({
        fromLane: nodeLane,
        toLane: nodeLane,
        color: colorForLane(nodeLane),
        parentHash: parents[0]
      })
      // Additional parents (merge): reuse an existing lane already waiting for that
      // parent, else allocate a fresh lane.
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p]
        let targetLane = findLane(active, parentHash)
        if (targetLane === -1) {
          const free = firstFree(active)
          targetLane = free === -1 ? active.length : free
          if (targetLane === active.length) active.push(null)
          active[targetLane] = parentHash
        }
        parentEdges.push({
          fromLane: nodeLane,
          toLane: targetLane,
          color: colorForLane(targetLane),
          parentHash
        })
      }
    }

    // Trim trailing free lanes to keep width tight.
    while (active.length > 0 && active[active.length - 1] === null) active.pop()

    const width = Math.max(
      nodeLane + 1,
      active.length,
      passLanes.reduce((m, p) => Math.max(m, p.lane + 1), 0)
    )

    rows.push({
      hash: commit.hash,
      lane: nodeLane,
      color: colorForLane(nodeLane),
      passLanes,
      parentEdges,
      width
    })
  }

  return rows
}
