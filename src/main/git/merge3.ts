// Pure 3-way merge: given the three index stages of a conflicted file (base,
// ours, theirs) it produces the segment list the merge tool renders.
//
// This is deliberately dependency-free and side-effect-free — same rule as
// graph.ts — so it can be unit-tested without a repository. gitService reads the
// stages, this file decides what conflicts.
//
// The algorithm is the classic diff3:
//   1. diff base -> ours and base -> theirs, as line ranges over the BASE file
//   2. walk those ranges in base order, grouping any that overlap or touch
//   3. a group touched by one side only auto-merges to that side; a group both
//      sides touched (differently) is a conflict the user has to decide

/** A run of lines that differs between the base and one side. */
export interface DiffRegion {
  /** Half-open [baseStart, baseEnd) range of base lines the side replaced. */
  baseStart: number
  baseEnd: number
  /** Half-open [sideStart, sideEnd) range of side lines that replaced them. */
  sideStart: number
  sideEnd: number
}

export type MergeSegmentKind = 'common' | 'ours' | 'theirs' | 'conflict'

export interface Merge3Segment {
  kind: MergeSegmentKind
  base: string[]
  ours: string[]
  theirs: string[]
  /** 0-based line offset of this segment in each of the three versions. */
  baseStart: number
  oursStart: number
  theirsStart: number
}

/**
 * Cap on the LCS table. Beyond this the quadratic diff would stall the main
 * process, so the whole differing middle is reported as one region — still
 * correct (the user sees one big conflict), just less granular.
 */
const LCS_CELL_BUDGET = 6_000_000

/**
 * Line diff of `base` against `side`, returned as the ranges that changed.
 * Equal runs are implied by the gaps between regions.
 */
export function diffRegions(base: string[], side: string[]): DiffRegion[] {
  // Trim the common prefix/suffix first: source files usually differ in a few
  // places, so this is what keeps the quadratic core small.
  let head = 0
  const maxHead = Math.min(base.length, side.length)
  while (head < maxHead && base[head] === side[head]) head++

  let tail = 0
  while (tail < maxHead - head && base[base.length - 1 - tail] === side[side.length - 1 - tail]) {
    tail++
  }

  const a = base.slice(head, base.length - tail)
  const b = side.slice(head, side.length - tail)
  if (a.length === 0 && b.length === 0) return []
  if (a.length === 0 || b.length === 0) {
    // Pure insertion or pure deletion — no need to diff at all.
    return [
      {
        baseStart: head,
        baseEnd: head + a.length,
        sideStart: head,
        sideEnd: head + b.length
      }
    ]
  }
  if ((a.length + 1) * (b.length + 1) > LCS_CELL_BUDGET) {
    return [
      {
        baseStart: head,
        baseEnd: head + a.length,
        sideStart: head,
        sideEnd: head + b.length
      }
    ]
  }

  // Classic LCS length table, then a backtrack that collects the changed runs.
  const w = b.length + 1
  const lcs = new Int32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1])
    }
  }

  const regions: DiffRegion[] = []
  let i = 0
  let j = 0
  let openA = -1
  let openB = -1
  const closeRegion = (endA: number, endB: number): void => {
    if (openA < 0) return
    regions.push({
      baseStart: head + openA,
      baseEnd: head + endA,
      sideStart: head + openB,
      sideEnd: head + endB
    })
    openA = -1
    openB = -1
  }
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      closeRegion(i, j)
      i++
      j++
    } else {
      if (openA < 0) {
        openA = i
        openB = j
      }
      if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) i++
      else j++
    }
  }
  if (i < a.length || j < b.length) {
    if (openA < 0) {
      openA = i
      openB = j
    }
    i = a.length
    j = b.length
  }
  closeRegion(i, j)
  return regions
}

/**
 * Three-way merge. Returns every line of the file exactly once, grouped into
 * segments: `common` (untouched), `ours`/`theirs` (one side changed it, so it
 * auto-merges) and `conflict` (both sides changed it differently).
 *
 * An empty `base` (an add/add conflict, where git has no stage 1) makes the
 * whole file one conflict — which is exactly what git itself reports.
 */
export function merge3(base: string[], ours: string[], theirs: string[]): Merge3Segment[] {
  const oursRegions = diffRegions(base, ours)
  const theirsRegions = diffRegions(base, theirs)

  const segments: Merge3Segment[] = []
  // Line reached so far in each of the three versions. Tracked incrementally
  // rather than mapped from a base index: a pure insertion is a zero-width base
  // range, so an index alone cannot say whether it sits before or after it.
  let cursor = 0
  let oursCursor = 0
  let theirsCursor = 0
  let oi = 0
  let ti = 0

  const emitCommon = (untilBase: number): void => {
    if (untilBase <= cursor) return
    const lines = base.slice(cursor, untilBase)
    segments.push({
      kind: 'common',
      base: lines,
      ours: lines,
      theirs: lines,
      baseStart: cursor,
      oursStart: oursCursor,
      theirsStart: theirsCursor
    })
    oursCursor += lines.length
    theirsCursor += lines.length
    cursor = untilBase
  }

  while (oi < oursRegions.length || ti < theirsRegions.length) {
    const lo = Math.min(
      oursRegions[oi]?.baseStart ?? Infinity,
      theirsRegions[ti]?.baseStart ?? Infinity
    )
    emitCommon(lo)

    let hi = lo
    let usedOurs = false
    let usedTheirs = false
    // Where each side stands, as (base line, side line) — advanced by every
    // region absorbed, so the group's side ranges stay exact.
    let oursAt = { base: lo, side: oursCursor }
    let theirsAt = { base: lo, side: theirsCursor }

    // Absorb every region that overlaps or merely touches the growing group:
    // two edits on adjacent base lines still have to be decided together.
    let grew = true
    while (grew) {
      grew = false
      while (oi < oursRegions.length && oursRegions[oi].baseStart <= hi) {
        const r = oursRegions[oi]
        hi = Math.max(hi, r.baseEnd)
        oursAt = { base: r.baseEnd, side: r.sideEnd }
        usedOurs = true
        oi++
        grew = true
      }
      while (ti < theirsRegions.length && theirsRegions[ti].baseStart <= hi) {
        const r = theirsRegions[ti]
        hi = Math.max(hi, r.baseEnd)
        theirsAt = { base: r.baseEnd, side: r.sideEnd }
        usedTheirs = true
        ti++
        grew = true
      }
    }

    // Base lines after the last absorbed region are unchanged on that side, so
    // they carry over one-for-one to its end position.
    const oursEnd = oursAt.side + (hi - oursAt.base)
    const theirsEnd = theirsAt.side + (hi - theirsAt.base)
    const oursLines = ours.slice(oursCursor, oursEnd)
    const theirsLines = theirs.slice(theirsCursor, theirsEnd)

    let kind: MergeSegmentKind
    if (usedOurs && usedTheirs) {
      // Both touched it — identical results still merge cleanly.
      kind = sameLines(oursLines, theirsLines) ? 'ours' : 'conflict'
    } else {
      kind = usedOurs ? 'ours' : 'theirs'
    }

    segments.push({
      kind,
      base: base.slice(lo, hi),
      ours: oursLines,
      theirs: theirsLines,
      baseStart: lo,
      oursStart: oursCursor,
      theirsStart: theirsCursor
    })
    cursor = hi
    oursCursor = oursEnd
    theirsCursor = theirsEnd
  }

  emitCommon(base.length)
  return segments
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i])
}

/** Split file text into lines, remembering how it has to be written back. */
export function splitLines(text: string): {
  lines: string[]
  crlf: boolean
  trailingNewline: boolean
} {
  const crlf = text.includes('\r\n')
  const normalized = text.replace(/\r\n/g, '\n')
  const trailingNewline = normalized.endsWith('\n')
  const body = trailingNewline ? normalized.slice(0, -1) : normalized
  // '' is an empty file (no lines); '\n' is one empty line.
  const lines = body === '' && !trailingNewline ? [] : body.split('\n')
  return { lines, crlf, trailingNewline }
}

/** Inverse of splitLines — join a resolved file back into its original shape. */
export function joinLines(
  lines: string[],
  opts: { crlf: boolean; trailingNewline: boolean }
): string {
  const eol = opts.crlf ? '\r\n' : '\n'
  const body = lines.join(eol)
  return opts.trailingNewline && lines.length > 0 ? body + eol : body
}
