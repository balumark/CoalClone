import { describe, it, expect } from 'vitest'
import { edgePath, withAlpha } from '../src/renderer/lib/graphPaths'

describe('edgePath', () => {
  it('draws a straight line within one lane', () => {
    expect(edgePath(10, 15, 10, 75, false)).toBe('M 10 15 L 10 75')
  })

  it('forks sideways along the child row, then runs down the parent lane', () => {
    // merge commit at x=10 whose 2nd parent sits at x=40, three rows down
    expect(edgePath(10, 15, 40, 99, true)).toBe('M 10 15 L 32 15 Q 40 15 40 23 L 40 99')
  })

  it('runs down the child lane, then joins the parent sideways', () => {
    // branch's first commit at x=40 joining its parent at x=10
    expect(edgePath(40, 15, 10, 99, false)).toBe('M 40 15 L 40 91 Q 40 99 32 99 L 10 99')
  })

  it('never uses a corner wider than the gap', () => {
    expect(edgePath(10, 15, 14, 43, true)).toBe('M 10 15 L 10 15 Q 14 15 14 19 L 14 43')
  })
})

describe('withAlpha', () => {
  it('appends a two-digit alpha channel', () => {
    expect(withAlpha('#4c8dff', 0)).toBe('#4c8dff00')
    expect(withAlpha('#4c8dff', 1)).toBe('#4c8dffff')
    expect(withAlpha('#4c8dff', 0.15)).toBe('#4c8dff26')
  })
})
