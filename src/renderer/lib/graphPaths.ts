// SVG path geometry for commit-graph edges, GitKraken-style: lines leave a node
// HORIZONTALLY and turn into the vertical lane with a rounded corner, instead of
// cutting diagonally across rows. Pure, so it is unit-tested.

/** Corner radius of the turn between a horizontal run and a lane. */
export const CORNER_R = 8

/**
 * Edge from a child node (x1, y1) down to its parent node (x2, y2); y2 > y1.
 *
 * - Same lane: a straight vertical line.
 * - `fork` (a merge commit's 2nd+ parent, i.e. a branch merged in): leave the
 *   child sideways along its own row, turn down into the parent's lane, run
 *   down to the parent.
 * - otherwise (first parent on another lane — a branch's first commit joining
 *   the line it grew from): run down the child's own lane, turn at the parent's
 *   row and arrive at the parent sideways.
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number, fork: boolean): string {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`
  const dir = x2 > x1 ? 1 : -1
  const r = Math.min(CORNER_R, Math.abs(x2 - x1), Math.abs(y2 - y1))
  if (fork) {
    return `M ${x1} ${y1} L ${x2 - dir * r} ${y1} ` + `Q ${x2} ${y1} ${x2} ${y1 + r} L ${x2} ${y2}`
  }
  return `M ${x1} ${y1} L ${x1} ${y2 - r} ` + `Q ${x1} ${y2} ${x1 + dir * r} ${y2} L ${x2} ${y2}`
}

/** `#rrggbb` + alpha (0–1) → `#rrggbbaa`, for tints of a lane color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return `${hex.slice(0, 7)}${a.toString(16).padStart(2, '0')}`
}
