import { describe, it, expect } from 'vitest'
import { diffRegions, joinLines, merge3, splitLines } from '../src/main/git/merge3'

const L = (s: string): string[] => (s === '' ? [] : s.split(' '))

/** Every segment concatenated back gives the original side, in order. */
function rebuild(segments: ReturnType<typeof merge3>, side: 'ours' | 'theirs'): string[] {
  return segments.flatMap((s) => s[side])
}

describe('diffRegions', () => {
  it('reports nothing for identical input', () => {
    expect(diffRegions(L('a b c'), L('a b c'))).toEqual([])
  })

  it('reports a pure insertion as a zero-width base range', () => {
    expect(diffRegions(L('a c'), L('a b c'))).toEqual([
      { baseStart: 1, baseEnd: 1, sideStart: 1, sideEnd: 2 }
    ])
  })

  it('reports a pure deletion as a zero-width side range', () => {
    expect(diffRegions(L('a b c'), L('a c'))).toEqual([
      { baseStart: 1, baseEnd: 2, sideStart: 1, sideEnd: 1 }
    ])
  })

  it('reports two separate edits as two regions', () => {
    const r = diffRegions(L('a b c d e'), L('a X c d Y'))
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ baseStart: 1, baseEnd: 2, sideStart: 1, sideEnd: 2 })
    expect(r[1]).toEqual({ baseStart: 4, baseEnd: 5, sideStart: 4, sideEnd: 5 })
  })

  it('handles an empty base (everything is new)', () => {
    expect(diffRegions([], L('a b'))).toEqual([
      { baseStart: 0, baseEnd: 0, sideStart: 0, sideEnd: 2 }
    ])
  })
})

describe('merge3', () => {
  it('leaves an untouched file as one common segment', () => {
    const segs = merge3(L('a b c'), L('a b c'), L('a b c'))
    expect(segs).toHaveLength(1)
    expect(segs[0].kind).toBe('common')
  })

  it('auto-merges a change only one side made', () => {
    const segs = merge3(L('a b c'), L('a X c'), L('a b c'))
    expect(segs.map((s) => s.kind)).toEqual(['common', 'ours', 'common'])
    expect(segs[1].ours).toEqual(['X'])
    expect(segs[1].theirs).toEqual(['b'])
  })

  it('auto-merges non-overlapping changes from both sides', () => {
    const segs = merge3(L('a b c d e'), L('X b c d e'), L('a b c d Y'))
    expect(segs.map((s) => s.kind)).toEqual(['ours', 'common', 'theirs'])
    expect(segs.some((s) => s.kind === 'conflict')).toBe(false)
  })

  it('conflicts when both sides change the same lines differently', () => {
    const segs = merge3(L('a b c'), L('a X c'), L('a Y c'))
    expect(segs.map((s) => s.kind)).toEqual(['common', 'conflict', 'common'])
    expect(segs[1].ours).toEqual(['X'])
    expect(segs[1].theirs).toEqual(['Y'])
    expect(segs[1].base).toEqual(['b'])
  })

  it('does not conflict when both sides made the identical change', () => {
    const segs = merge3(L('a b c'), L('a X c'), L('a X c'))
    expect(segs.some((s) => s.kind === 'conflict')).toBe(false)
  })

  it('groups adjacent edits from the two sides into one conflict', () => {
    // ours rewrites line b, theirs rewrites the line right after it.
    const segs = merge3(L('a b c d'), L('a X c d'), L('a b Y d'))
    const conflicts = segs.filter((s) => s.kind === 'conflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].ours).toEqual(['X', 'c'])
    expect(conflicts[0].theirs).toEqual(['b', 'Y'])
  })

  it('treats a missing base (add/add) as one whole-file conflict', () => {
    const segs = merge3([], L('a b'), L('c d'))
    expect(segs.map((s) => s.kind)).toEqual(['conflict'])
    expect(segs[0].ours).toEqual(['a', 'b'])
    expect(segs[0].theirs).toEqual(['c', 'd'])
  })

  it('keeps line offsets and content consistent with both files', () => {
    const base = L('a b c d e f')
    const ours = L('a X Y c d e f') // replace b with X Y
    const theirs = L('a b c d Z') // drop e f, add Z
    const segs = merge3(base, ours, theirs)
    expect(rebuild(segs, 'ours')).toEqual(ours)
    expect(rebuild(segs, 'theirs')).toEqual(theirs)
    for (const s of segs) {
      expect(ours.slice(s.oursStart, s.oursStart + s.ours.length)).toEqual(s.ours)
      expect(theirs.slice(s.theirsStart, s.theirsStart + s.theirs.length)).toEqual(s.theirs)
    }
  })

  it('keeps offsets right when one side only inserts', () => {
    const base = L('a b c')
    const ours = L('a N b c')
    const theirs = L('a b M c')
    const segs = merge3(base, ours, theirs)
    expect(rebuild(segs, 'ours')).toEqual(ours)
    expect(rebuild(segs, 'theirs')).toEqual(theirs)
  })
})

describe('splitLines / joinLines', () => {
  it('round-trips LF text with a trailing newline', () => {
    const text = 'a\nb\n'
    const s = splitLines(text)
    expect(s.lines).toEqual(['a', 'b'])
    expect(s.trailingNewline).toBe(true)
    expect(joinLines(s.lines, s)).toBe(text)
  })

  it('round-trips CRLF text without a trailing newline', () => {
    const text = 'a\r\nb'
    const s = splitLines(text)
    expect(s.lines).toEqual(['a', 'b'])
    expect(s.crlf).toBe(true)
    expect(joinLines(s.lines, s)).toBe(text)
  })

  it('distinguishes an empty file from a single empty line', () => {
    expect(splitLines('').lines).toEqual([])
    expect(splitLines('\n').lines).toEqual([''])
    expect(joinLines([], { crlf: false, trailingNewline: true })).toBe('')
    expect(joinLines([''], { crlf: false, trailingNewline: true })).toBe('\n')
  })
})
