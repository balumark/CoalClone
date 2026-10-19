// Turns flat ref names (`feature/chat`, `feature/team-v2`, `main`) into the
// folder tree the sidebar shows, GitKraken-style, and does the filter matching.
// Pure, so it is unit-tested without React.

export interface TreeNode<T> {
  /** This segment only (`chat`), what the row shows. */
  name: string
  /** Full path up to and including this segment (`feature/chat`) — a stable key. */
  path: string
  /** Where `name` starts inside the matched string — for highlighting. */
  offset: number
  /** Set on leaves only. */
  item?: T
  children: TreeNode<T>[]
  /** Leaves at or below this node. */
  count: number
}

/**
 * Build a folder tree from items whose path segments are separated by `/`.
 * Folders sort before leaves, each group alphabetically (case-insensitive), so
 * `feature/…` doesn't scatter between loose branches. `baseOffset` is how much
 * of the matched string precedes `pathOf()` (e.g. `origin/` for remote branches).
 */
export function buildTree<T>(items: T[], pathOf: (t: T) => string, baseOffset = 0): TreeNode<T>[] {
  const root: TreeNode<T> = { name: '', path: '', offset: baseOffset, children: [], count: 0 }
  for (const item of items) {
    const parts = pathOf(item).split('/').filter(Boolean)
    let node = root
    let offset = baseOffset
    parts.forEach((part, i) => {
      const path = node.path ? `${node.path}/${part}` : part
      const leaf = i === parts.length - 1
      let next = leaf ? undefined : node.children.find((c) => !c.item && c.name === part)
      if (!next) {
        next = { name: part, path, offset, children: [], count: 0, ...(leaf ? { item } : {}) }
        node.children.push(next)
      }
      node.count++
      node = next
      offset += part.length + 1
    })
    node.count++
  }
  sortTree(root)
  return root.children
}

function sortTree<T>(node: TreeNode<T>): void {
  node.children.sort((a, b) => {
    if (!a.item !== !b.item) return a.item ? 1 : -1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
  node.children.forEach(sortTree)
}

/** Case-insensitive substring match; returns the matched [start, end) or null. */
export function matchRange(text: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const at = text.toLowerCase().indexOf(q)
  return at < 0 ? null : [at, at + q.length]
}

/** True when the item should be listed under the current filter. */
export function matches(text: string, query: string): boolean {
  return !query.trim() || matchRange(text, query) !== null
}
