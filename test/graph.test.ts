import { describe, it, expect } from 'vitest'
import { computeGraph } from '../src/main/git/graph'
import type { CommitRef } from '../src/shared/types'

function c(hash: string, parents: string[]): CommitRef {
  return { hash, shortHash: hash.slice(0, 7), parents }
}

describe('computeGraph', () => {
  it('places a linear history in a single lane', () => {
    const commits = [c('C', ['B']), c('B', ['A']), c('A', [])]
    const rows = computeGraph(commits)
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0])
    expect(rows[2].parentEdges).toHaveLength(0) // root has no parent edges
    expect(rows[0].parentEdges[0].parentHash).toBe('B')
  })

  it('forks a second lane at a branch point and closes it on merge', () => {
    //   D (merge of B and C)
    //   B   C
    //    \ /
    //     A
    const commits = [
      c('D', ['B', 'C']),
      c('B', ['A']),
      c('C', ['A']),
      c('A', [])
    ]
    const rows = computeGraph(commits)
    const byHash = Object.fromEntries(rows.map((r) => [r.hash, r]))
    // D is a merge: two parent edges to distinct lanes.
    expect(byHash.D.parentEdges).toHaveLength(2)
    const lanes = byHash.D.parentEdges.map((e) => e.toLane).sort()
    expect(lanes[0]).not.toBe(lanes[1])
    // B and C occupy different lanes.
    expect(byHash.B.lane).not.toBe(byHash.C.lane)
    // A is a root: it collapses back and has no outgoing edges.
    expect(byHash.A.parentEdges).toHaveLength(0)
  })

  it('assigns stable colors per lane', () => {
    const rows = computeGraph([c('B', ['A']), c('A', [])])
    expect(rows.every((r) => r.color === r.lane % 8)).toBe(true)
  })

  it('produces one row per commit', () => {
    const commits = [c('C', ['B']), c('B', ['A']), c('A', [])]
    expect(computeGraph(commits)).toHaveLength(3)
  })
})
