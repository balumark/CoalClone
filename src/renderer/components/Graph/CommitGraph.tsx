import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import ContextMenu, {
  type MenuItem,
  type MenuState
} from '@renderer/components/ContextMenu/ContextMenu'
import { ComputerIcon, RemoteIcon, StashIcon, TagIcon } from '@renderer/components/icons/RefIcons'
import { laneColor } from '@renderer/lib/palette'
import { edgePath, withAlpha } from '@renderer/lib/graphPaths'
import { relativeTime, parseRef } from '@renderer/lib/format'
import { buildBranchMenu, copyItems } from '@renderer/lib/branchMenu'
import Avatar from '@renderer/components/Identicon/Avatar'
import type { Branch, Commit, GraphRow, Stash } from '@shared/types'

const ROW_H = 28
const LANE_W = 18
const MERGE_R = 4.5 // merge commits are a small dot, not an avatar
const BRANCH_COL = 200 // width of the left "Branch / Tag" column
const AVATAR = 20 // diameter of the author-avatar node

// The commit graph: a single SVG of nodes + edges rendered behind a list of
// commit rows. Rows and SVG share one scroll container and are aligned by ROW_H.
// Edge drawing derives everything from GraphRow.lane, so lanes stay continuous.
//
// Look (GitKraken-style): every row is tinted with its lane color from the node
// to the message, which carries a lane-colored left rule; branch pills take the
// lane color and are tied to their node by a connector line; merge commits are
// small dots; edges leave nodes sideways and turn into lanes with rounded
// corners (lib/graphPaths.ts); the uncommitted-changes row hangs off HEAD by a
// dashed line.

/**
 * One pill in the Branch/Tag column. Branches that have a local ref AND its remote
 * counterpart on the SAME commit are merged into a single group (shown with both a
 * computer and a cloud icon); a remote that has drifted to another commit stays its
 * own group. The "origin/" prefix is never printed — the cloud icon says "remote".
 */
interface RefGroup {
  /** Display name (branch name without any remote prefix, or the tag name). */
  label: string
  /** The ref string handed to menu/checkout/drag actions (prefers the local ref). */
  raw: string
  isTag: boolean
  local: boolean
  remote: boolean
  current: boolean
}

function groupRefs(refs: string[], remotes: Set<string>, currentBranch: string | null): RefGroup[] {
  interface Work {
    name: string
    localRaw?: string
    remoteRaw?: string
    remoteFull?: string // full "origin/…" label, shown when there's no local pair
  }
  const byName = new Map<string, Work>()
  const tags: RefGroup[] = []
  for (const r of refs) {
    const { label, kind } = parseRef(r, remotes)
    if (kind === 'tag') {
      tags.push({ label, raw: r, isTag: true, local: false, remote: false, current: false })
      continue
    }
    if (kind === 'remote') {
      // "origin/feature/x" → remote name is the first segment, branch is the rest.
      const slash = label.indexOf('/')
      const name = slash >= 0 ? label.slice(slash + 1) : label
      const g = byName.get(name) ?? { name }
      g.remoteRaw = r
      g.remoteFull = label
      byName.set(name, g)
    } else {
      // head or local — the label IS the branch name.
      const g = byName.get(label) ?? { name: label }
      g.localRaw = r
      byName.set(label, g)
    }
  }
  const branches: RefGroup[] = [...byName.values()].map((g) => ({
    // Merged with a local pair → drop "origin/"; remote-only → keep it so a
    // diverged remote is clearly distinguishable from the local at another commit.
    label: g.localRaw ? g.name : (g.remoteFull ?? g.name),
    raw: g.localRaw ?? (g.remoteRaw as string),
    isTag: false,
    local: !!g.localRaw,
    remote: !!g.remoteRaw,
    // Current is driven by status.branch (git-authoritative for the checked-out
    // branch) so an optimistic checkout moves the ✓ instantly, before the slow
    // log refresh updates the "HEAD ->" refs. In steady state this equals HEAD.
    current: !!g.localRaw && g.name === currentBranch
  }))
  // Current branch first, then the rest, then tags.
  branches.sort((a, b) => Number(b.current) - Number(a.current))
  return [...branches, ...tags]
}

/** A single branch/tag pill. Double-click checks it out; right-click opens its menu. */
function RefBadge({
  group,
  color,
  onRefMenu,
  onRefActivate
}: {
  group: RefGroup
  /** Lane color of the commit — branch pills take it (not tags, not search). */
  color?: string
  onRefMenu?: (e: React.MouseEvent, ref: string) => void
  onRefActivate?: (ref: string) => void
}): JSX.Element {
  const laned = !!color && !group.isTag
  const cls = group.isTag
    ? 'bg-warn/20 text-warn border-warn/40'
    : laned
      ? group.current
        ? 'text-base-900 font-semibold'
        : 'text-txt-bright'
      : group.current
        ? 'bg-accent/20 text-accent border-accent/40'
        : group.local
          ? 'bg-good/15 text-good border-good/40'
          : 'bg-base-500/40 text-txt-muted border-edge'
  const style: React.CSSProperties | undefined = laned
    ? group.current
      ? { background: color, borderColor: color }
      : {
          background: withAlpha(color, group.local ? 0.28 : 0.14),
          borderColor: withAlpha(color, group.local ? 0.7 : 0.45),
          ...(group.local ? {} : { borderStyle: 'dashed' })
        }
    : undefined
  const canCheckout = !group.isTag && !!onRefActivate
  // Native dblclick is unreliable, so we time two plain clicks. (The badge is not
  // draggable — draggable spans in Chromium swallow the click events we need here.)
  return (
    <span
      onContextMenu={onRefMenu ? (e) => onRefMenu(e, group.raw) : undefined}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={
        canCheckout
          ? (e) => {
              e.stopPropagation()
              onRefActivate?.(group.raw)
            }
          : undefined
      }
      title={
        group.isTag
          ? 'Tag'
          : `${group.current ? 'Current branch' : 'Branch'}${
              group.local && group.remote
                ? ' (local + remote)'
                : group.remote
                  ? ' (remote only)'
                  : ' (local only)'
            } — double-click to check out, right-click for actions`
      }
      style={style}
      className={`inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[4px] text-[11px] font-medium border min-w-0 max-w-full ${cls} ${
        canCheckout ? 'cursor-pointer' : ''
      }`}
    >
      {group.current && <span className="shrink-0 font-bold">✓</span>}
      {group.isTag ? (
        <TagIcon className="opacity-80 shrink-0" />
      ) : (
        <>
          {group.local && <ComputerIcon className="opacity-80 shrink-0" />}
          {group.remote && <RemoteIcon className="opacity-80 shrink-0" />}
        </>
      )}
      <span className="truncate">{group.label}</span>
    </span>
  )
}

// Collapses a commit's refs to the first pill + a "+N" count; hovering reveals the
// full list in a floating popover. The popover is interactive (double-click to
// checkout, right-click for the menu) and a short close delay lets the mouse cross
// the gap from the trigger onto it without it vanishing.
function RefBadges({
  refs,
  remotes,
  currentBranch,
  color,
  onRefMenu,
  onRefActivate
}: {
  refs: string[]
  remotes: Set<string>
  currentBranch: string | null
  color?: string
  onRefMenu?: (e: React.MouseEvent, ref: string) => void
  onRefActivate?: (ref: string) => void
}): JSX.Element | null {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = (): void => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = (): void => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setRect(null), 160)
  }
  useEffect(() => () => cancelClose(), [])

  if (!refs.length) return null
  const groups = groupRefs(refs, remotes, currentBranch)
  const extra = groups.length - 1
  return (
    <span
      className="inline-flex items-center gap-1 align-middle min-w-0"
      onMouseEnter={
        extra > 0
          ? (e) => {
              cancelClose()
              setRect(e.currentTarget.getBoundingClientRect())
            }
          : undefined
      }
      onMouseLeave={extra > 0 ? scheduleClose : undefined}
    >
      <RefBadge
        group={groups[0]}
        color={color}
        onRefMenu={onRefMenu}
        onRefActivate={onRefActivate}
      />
      {extra > 0 && (
        <span
          className="shrink-0 h-[18px] inline-flex items-center px-1 rounded-[4px] text-[10px] font-semibold border text-txt-bright"
          style={
            color
              ? { background: withAlpha(color, 0.2), borderColor: withAlpha(color, 0.5) }
              : undefined
          }
        >
          +{extra}
        </span>
      )}
      {rect && extra > 0 && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-50 flex flex-col items-start gap-1 rounded border border-edge bg-base-800 p-1.5 shadow-lg"
          style={{ left: rect.left, top: rect.bottom + 2, maxWidth: 280 }}
        >
          {groups.map((g) => (
            <RefBadge
              key={g.raw}
              group={g}
              color={color}
              onRefMenu={onRefMenu}
              onRefActivate={onRefActivate}
            />
          ))}
        </div>
      )}
    </span>
  )
}

/** Dotted-square markers for stashes based on this commit (GitKraken-style). */
function StashBadges({
  stashes,
  onStashMenu
}: {
  stashes?: Stash[]
  onStashMenu?: (e: React.MouseEvent, stash: Stash) => void
}): JSX.Element | null {
  if (!stashes || !stashes.length) return null
  return (
    <span className="inline-flex gap-1 mr-1 align-middle shrink-0">
      {stashes.map((s) => (
        <span
          key={s.index}
          onContextMenu={onStashMenu ? (e) => onStashMenu(e, s) : undefined}
          title={`stash@{${s.index}}: ${s.message} — right-click for actions`}
          className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[4px] text-[10.5px] font-medium border border-dashed border-warn/70 text-warn bg-warn/10 cursor-context-menu"
        >
          <StashIcon className="shrink-0" />
          {`stash@{${s.index}}`}
        </span>
      ))}
    </span>
  )
}

/** Which right-hand meta columns fit next to the message. */
interface MetaCols {
  author: boolean
  date: boolean
  sha: boolean
}
const ALL_COLS: MetaCols = { author: true, date: true, sha: true }

/**
 * A commit row in three columns: Branch/Tag (badges, right-aligned so they sit next
 * to the graph) · Graph (a transparent spacer the SVG shows through) · Commit message
 * (subject + author + date + hash). `graphWidth` only matters when `showGraph`.
 */
function RowContent({
  commit,
  stashes,
  remotes,
  currentBranch,
  graphWidth,
  showGraph,
  color,
  selected,
  cols = ALL_COLS,
  onRefMenu,
  onRefActivate,
  onStashMenu
}: {
  cols?: MetaCols
  commit: Commit
  stashes?: Stash[]
  remotes: Set<string>
  currentBranch: string | null
  graphWidth: number
  showGraph: boolean
  /** Lane color (graph view only) — drives pills, connector, rule and tint. */
  color?: string
  selected?: boolean
  onRefMenu?: (e: React.MouseEvent, ref: string) => void
  onRefActivate?: (ref: string) => void
  onStashMenu?: (e: React.MouseEvent, stash: Stash) => void
}): JSX.Element {
  const hasRefs = commit.refs.length > 0 || !!stashes?.length
  // The description, flattened to one line — GitKraken shows it dimmed after
  // the subject, which is most of what makes a row readable at a glance.
  const body = commit.body.replace(/\s+/g, ' ').trim()
  return (
    <>
      <div
        style={{ width: BRANCH_COL }}
        className="shrink-0 h-full flex items-center pl-1.5 overflow-hidden"
      >
        <StashBadges stashes={stashes} onStashMenu={onStashMenu} />
        <RefBadges
          refs={commit.refs}
          remotes={remotes}
          currentBranch={currentBranch}
          color={color}
          onRefMenu={onRefMenu}
          onRefActivate={onRefActivate}
        />
        {/* Connector from the pills to the node; the SVG carries it on to the node. */}
        {hasRefs && color && (
          <span
            className="flex-1 min-w-[6px] h-[2px] ml-1"
            style={{ background: withAlpha(color, 0.75) }}
          />
        )}
      </div>
      {showGraph && <div style={{ width: graphWidth }} className="shrink-0" />}
      <div
        className={`flex-1 min-w-0 h-full flex items-center gap-2.5 pl-2.5 ${
          color ? '' : 'border-l border-edge/40'
        }`}
        style={
          color
            ? {
                borderLeft: `2px solid ${withAlpha(color, selected ? 1 : 0.8)}`,
                background: `linear-gradient(90deg, ${withAlpha(color, selected ? 0.24 : 0.1)} 0, ${withAlpha(color, 0)} 45%)`
              }
            : undefined
        }
      >
        <span className="min-w-0 flex-1 truncate">
          <span className={selected ? 'text-txt-bright' : 'text-txt'}>{commit.subject}</span>
          {body && <span className="ml-2 text-txt-muted/80">{body}</span>}
        </span>
        {cols.author && (
          <span className="shrink-0 w-[120px] truncate text-right text-[11.5px] text-txt-muted">
            {commit.authorName}
          </span>
        )}
        {cols.date && (
          <span className="shrink-0 w-[72px] text-right text-[11.5px] text-txt-muted tabular-nums">
            {relativeTime(commit.authorDate)}
          </span>
        )}
        {cols.sha && (
          <span className="shrink-0 w-[54px] font-mono text-[11px] text-txt-muted/70">
            {commit.shortHash}
          </span>
        )}
      </div>
    </>
  )
}

export default function CommitGraph(): JSX.Element {
  const snapshot = useRepoStore((s) => s.snapshot)
  const selectedCommit = useRepoStore((s) => s.selectedCommit)
  const mode = useRepoStore((s) => s.mode)
  const selectCommit = useRepoStore((s) => s.selectCommit)
  const selectWorking = useRepoStore((s) => s.selectWorking)
  const checkout = useRepoStore((s) => s.checkout)
  const createBranch = useRepoStore((s) => s.createBranch)
  const createTag = useRepoStore((s) => s.createTag)
  const cherryPick = useRepoStore((s) => s.cherryPick)
  const revert = useRepoStore((s) => s.revert)
  const reset = useRepoStore((s) => s.reset)
  const startInteractiveRebase = useRepoStore((s) => s.startInteractiveRebase)
  const moveBranch = useRepoStore((s) => s.moveBranch)
  const soloBranch = useRepoStore((s) => s.soloBranch)
  const setSolo = useRepoStore((s) => s.setSolo)
  const createWorktree = useRepoStore((s) => s.createWorktree)
  const createPatch = useRepoStore((s) => s.createPatch)
  const pushTag = useRepoStore((s) => s.pushTag)
  const deleteTag = useRepoStore((s) => s.deleteTag)
  const stashApply = useRepoStore((s) => s.stashApply)
  const stashPop = useRepoStore((s) => s.stashPop)
  const stashDrop = useRepoStore((s) => s.stashDrop)
  const pushToast = useRepoStore((s) => s.pushToast)
  const askInput = useRepoStore((s) => s.askInput)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [viewportW, setViewportW] = useState(0)

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    setScrollTop(e.currentTarget.scrollTop)
    if (e.currentTarget.clientHeight !== viewportH) setViewportH(e.currentTarget.clientHeight)
  }

  const onDropBranch = (e: React.DragEvent, hash: string): void => {
    const branch = e.dataTransfer.getData('application/kc-branch')
    if (branch && window.confirm(`Move branch "${branch}" to commit ${hash.slice(0, 7)}?`))
      void moveBranch(branch, hash)
  }

  const commits = useMemo(() => snapshot?.commits ?? [], [snapshot])
  const graph = useMemo(() => snapshot?.graph ?? [], [snapshot])
  const branches = useMemo(() => snapshot?.branches ?? [], [snapshot])
  const status = snapshot?.status
  const branch = status?.branch ?? 'HEAD'
  const remoteNames = useMemo(
    () => new Set((snapshot?.remotes ?? []).map((r) => r.name)),
    [snapshot?.remotes]
  )

  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text)
    pushToast({ kind: 'info', message: `Copied ${what}` })
  }

  const openCommitMenu = (e: React.MouseEvent, commit: Commit): void => {
    e.preventDefault()
    const hash = commit.hash
    const message = commit.body ? `${commit.subject}\n\n${commit.body}`.trim() : commit.subject
    const items: MenuItem[] = [
      { label: 'Checkout commit (detached)', onClick: () => void checkout(hash) },
      {
        label: 'Create branch here…',
        onClick: async () => {
          const name = await askInput({ title: 'New branch name', placeholder: 'feature/…' })
          if (name) void createBranch(name, true, hash)
        }
      },
      {
        label: 'Create tag here…',
        onClick: async () => {
          const name = await askInput({ title: 'Tag name', placeholder: 'v1.0.0' })
          if (name) void createTag(name, hash)
        }
      },
      { label: 'Create worktree from here…', onClick: () => void createWorktree(hash) },
      { separator: true },
      { label: 'Cherry-pick', onClick: () => void cherryPick(hash) },
      { label: 'Revert', onClick: () => void revert(hash) },
      {
        label: `Reset ${branch} here`,
        submenu: [
          { label: 'Soft — keep changes staged', onClick: () => void reset(hash, 'soft') },
          { label: 'Mixed — keep changes unstaged', onClick: () => void reset(hash, 'mixed') },
          {
            label: 'Hard — discard changes',
            danger: true,
            onClick: () => {
              if (window.confirm('Reset --hard? This permanently discards working-tree changes.'))
                void reset(hash, 'hard')
            }
          }
        ]
      },
      {
        label: 'Interactive rebase from here…',
        onClick: () => void startInteractiveRebase(commit)
      },
      {
        label: 'Create patch from commit…',
        onClick: () => void createPatch(hash, commit.shortHash)
      },
      { separator: true },
      { label: 'Copy message', onClick: () => copy(message, 'message') },
      ...copyItems(hash)
    ]
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  // Right-clicking a branch/tag badge opens that ref's own action menu.
  const openRefMenu = (e: React.MouseEvent, ref: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const { label, kind } = parseRef(ref, remoteNames)
    if (kind === 'tag') {
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Push tag', onClick: () => void pushTag(label) },
          { label: 'Delete tag', danger: true, onClick: () => void deleteTag(label) },
          { label: 'Copy tag name', onClick: () => copy(label, 'tag name') }
        ]
      })
      return
    }
    const branch: Branch | undefined =
      kind === 'remote'
        ? branches.find((b) => b.isRemote && b.name.replace(/^remotes\//, '') === label)
        : branches.find((b) => !b.isRemote && b.name === label)
    if (!branch) return
    setMenu({ x: e.clientX, y: e.clientY, items: buildBranchMenu(branch) })
  }

  // Double-clicking a branch/tag badge checks it out (matching the Sidebar).
  // "Already on" is decided from status.branch (always fresh via the optimistic
  // update) — NOT from the ref's "HEAD -> …" kind, which can be stale for a couple
  // seconds until the slow snapshot reconciles the commit refs.
  const activateRef = (ref: string): void => {
    const { label, kind } = parseRef(ref, remoteNames)
    if (kind === 'tag') return
    // Local branch name behind this badge (strip the remote name for remotes).
    const localName = kind === 'remote' ? label.replace(/^[^/]+\//, '') : label
    if (status?.branch === localName) {
      pushToast({ kind: 'info', message: `Already on ${localName}` })
      return
    }
    // "origin/x" → gitService strips "remotes/<remote>/" and checks out local x.
    void checkout(kind === 'remote' ? `remotes/${label}` : label)
  }

  const indexByHash = useMemo(() => {
    const m = new Map<string, number>()
    graph.forEach((row, i) => m.set(row.hash, i))
    return m
  }, [graph])

  // Stashes grouped by the commit they were created on, so we can mark that row.
  const stashesByBase = useMemo(() => {
    const m = new Map<string, Stash[]>()
    for (const s of snapshot?.stashes ?? []) {
      const list = m.get(s.parentHash) ?? []
      list.push(s)
      m.set(s.parentHash, list)
    }
    return m
  }, [snapshot?.stashes])

  const openStashMenu = (e: React.MouseEvent, stash: Stash): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Apply stash', onClick: () => void stashApply(stash.index) },
        { label: 'Pop stash', onClick: () => void stashPop(stash.index) },
        {
          label: 'Drop stash',
          danger: true,
          onClick: () => {
            if (window.confirm(`Drop stash@{${stash.index}}? This cannot be undone.`))
              void stashDrop(stash.index)
          }
        }
      ]
    })
  }

  // Solo focus: the set of commits reachable from the soloed branch's tip. Rows
  // and nodes outside it are dimmed so a single branch's line stands out.
  const soloSet = useMemo(() => {
    if (!soloBranch) return null
    const tip = branches.find((b) => b.name === soloBranch)?.commit
    if (!tip) return null
    const byHash = new Map(commits.map((c) => [c.hash, c]))
    const seen = new Set<string>()
    const stack = [tip]
    while (stack.length) {
      const h = stack.pop() as string
      if (seen.has(h)) continue
      seen.add(h)
      const c = byHash.get(h)
      if (c) for (const p of c.parents) if (!seen.has(p)) stack.push(p)
    }
    return seen
  }, [soloBranch, commits, branches])

  const maxLanes = useMemo(
    () => graph.reduce((m: number, r: GraphRow) => Math.max(m, r.width), 1),
    [graph]
  )
  const hasChanges = !!status && (status.staged.length > 0 || status.unstaged.length > 0)
  // The uncommitted-changes row sits INSIDE the graph (row "-1") so its dashed
  // node can be drawn and wired to HEAD in the same SVG.
  const workingOffset = hasChanges ? ROW_H : 0

  const graphWidth = maxLanes * LANE_W + 14
  const svgHeight = Math.max(workingOffset + commits.length * ROW_H, 1)
  const laneX = (lane: number): number => LANE_W / 2 + lane * LANE_W + 6
  const rowTop = (i: number): number => workingOffset + i * ROW_H
  const rowY = (i: number): number => rowTop(i) + ROW_H / 2

  // Where HEAD is — the WIP row hangs off it.
  const headIndex = useMemo(() => {
    const byRef = commits.findIndex((c) => c.refs.some((r) => r.startsWith('HEAD')))
    if (byRef >= 0) return byRef
    const tip = branches.find((b) => b.current)?.commit
    const byTip = tip ? commits.findIndex((c) => c.hash === tip) : -1
    return byTip >= 0 ? byTip : 0
  }, [commits, branches])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? commits.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          c.authorName.toLowerCase().includes(q) ||
          c.authorEmail.toLowerCase().includes(q) ||
          c.hash.toLowerCase().startsWith(q) ||
          c.refs.some((r) => r.toLowerCase().includes(q))
      )
    : null
  const isSearching = filtered !== null

  // Measure the scroll viewport. Re-run when switching to/from the search view
  // AND when the graph first gets content: before that the early "No commits"
  // return means the scroll container does not exist yet, so a mount-only
  // measure never saw it (height fell back to 1200, width to the default).
  const hasContent = commits.length > 0 || hasChanges
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => {
      setViewportH(el.clientHeight)
      setViewportW(el.clientWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isSearching, hasContent])

  if (!commits.length && !hasChanges) {
    return (
      <div className="flex items-center justify-center h-full text-txt-muted text-sm">
        No commits yet.
      </div>
    )
  }

  const isSelected = (hash: string): boolean => mode === 'commit' && selectedCommit === hash
  // Translucent hover/selection so the SVG (edges, tint) under the row shows through.
  const rowClass = (hash: string): string =>
    `flex items-center w-full text-left text-[12.5px] ${
      isSelected(hash) ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
    } ${soloSet && !soloSet.has(hash) ? 'opacity-30' : ''}`

  // Virtualization: only render rows/nodes/edges near the viewport.
  const vh = viewportH || 1200
  // The message is what you read; the meta columns give way first when the
  // center pane is narrow (author, then date, then SHA).
  const msgW = (viewportW || 1400) - BRANCH_COL - graphWidth
  const cols: MetaCols = { author: msgW >= 620, date: msgW >= 430, sha: msgW >= 340 }
  const OVERSCAN = 8
  const firstVisible = Math.max(0, Math.floor((scrollTop - workingOffset) / ROW_H) - OVERSCAN)
  const lastVisible = Math.min(
    commits.length - 1,
    Math.ceil((scrollTop + vh - workingOffset) / ROW_H) + OVERSCAN
  )
  const visible = commits.length ? commits.slice(firstVisible, lastVisible + 1) : []

  return (
    <div className="h-full flex flex-col">
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {soloBranch && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1 text-[11px] bg-accent/15 border-b border-accent/30 text-accent">
          <span className="font-medium">Solo:</span>
          <span className="truncate">{soloBranch.replace(/^remotes\//, '')}</span>
          <button
            onClick={() => setSolo(null)}
            className="ml-auto px-1.5 rounded hover:bg-accent/25"
            title="Exit Solo"
          >
            Exit ✕
          </button>
        </div>
      )}

      {/* Commit search */}
      <div className="shrink-0 px-2 py-1.5 border-b border-edge bg-base-800">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Search commits — message, author, hash…"
          className="w-full rounded bg-base-900 border border-edge px-2 py-1 text-[12px] text-txt outline-none focus:border-accent select-text"
        />
      </div>

      {filtered ? (
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-1 text-[11px] text-txt-muted">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </div>
          {filtered.map((commit) => (
            <button
              key={commit.hash}
              onClick={() => void selectCommit(commit.hash)}
              onContextMenu={(e) => openCommitMenu(e, commit)}
              className={rowClass(commit.hash)}
              style={{ height: ROW_H, paddingLeft: 0, paddingRight: 12 }}
            >
              <RowContent
                commit={commit}
                stashes={stashesByBase.get(commit.hash)}
                remotes={remoteNames}
                currentBranch={status?.branch ?? null}
                graphWidth={graphWidth}
                showGraph={false}
                onRefMenu={openRefMenu}
                onRefActivate={activateRef}
                onStashMenu={openStashMenu}
              />
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Column header: Branch/Tag · Graph · Commit message */}
          <div className="flex items-center h-7 shrink-0 bg-base-800 border-b border-edge text-[10px] font-semibold uppercase tracking-wider text-txt-muted/80 select-none">
            <div style={{ width: BRANCH_COL }} className="shrink-0 px-3 truncate">
              Branch / Tag
            </div>
            <div style={{ width: graphWidth }} className="shrink-0 pl-2 truncate">
              Graph
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 pr-3">
              <span className="flex-1 truncate">Commit message</span>
              {cols.author && <span className="w-[120px] text-right">Author</span>}
              {cols.date && <span className="w-[72px] text-right">Date</span>}
              {cols.sha && <span className="w-[54px]">SHA</span>}
            </div>
          </div>

          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
            <div className="relative" style={{ height: svgHeight }}>
              <svg
                width={graphWidth}
                height={svgHeight}
                style={{ left: BRANCH_COL }}
                className="absolute top-0 pointer-events-none"
              >
                {/* Row tint: a lane-colored band from the node to the message column. */}
                {visible.map((commit, idx) => {
                  const i = firstVisible + idx
                  const row = graph[i]
                  if (!row) return null
                  const x = laneX(row.lane)
                  return (
                    <rect
                      key={`tint-${commit.hash}`}
                      x={x}
                      y={rowTop(i) + 1}
                      width={graphWidth - x}
                      height={ROW_H - 2}
                      fill={laneColor(row.color)}
                      opacity={
                        (isSelected(commit.hash) ? 0.24 : 0.1) *
                        (soloSet && !soloSet.has(row.hash) ? 0.3 : 1)
                      }
                    />
                  )
                })}

                {/* Connector from the branch pills (in the left column) to the node. */}
                {visible.map((commit, idx) => {
                  const i = firstVisible + idx
                  const row = graph[i]
                  if (!row || (!commit.refs.length && !stashesByBase.has(commit.hash))) return null
                  return (
                    <line
                      key={`conn-${commit.hash}`}
                      x1={0}
                      y1={rowY(i)}
                      x2={laneX(row.lane)}
                      y2={rowY(i)}
                      stroke={withAlpha(laneColor(row.color), 0.75)}
                      strokeWidth={2}
                    />
                  )
                })}

                {/* Edges — only those whose vertical span intersects the viewport window. */}
                {graph.map((row, i) => {
                  const commit = commits[i]
                  return commit.parents.map((ph, pIdx) => {
                    const pi = indexByHash.get(ph)
                    if (pi === undefined) return null
                    if (Math.max(i, pi) < firstVisible || Math.min(i, pi) > lastVisible) return null
                    const prow = graph[pi]
                    const fork = pIdx > 0
                    // A merged-in branch keeps its own color; a branch joining the
                    // line it grew from is drawn in the branch's (child's) color.
                    const color = laneColor(fork || row.lane === prow.lane ? prow.color : row.color)
                    const dim = soloSet && !(soloSet.has(row.hash) && soloSet.has(ph))
                    return (
                      <path
                        key={`${row.hash}-${ph}`}
                        d={edgePath(laneX(row.lane), rowY(i), laneX(prow.lane), rowY(pi), fork)}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={dim ? 0.25 : 1}
                      />
                    )
                  })
                })}

                {/* Merge commits: a small dot instead of an avatar. */}
                {visible.map((commit, idx) => {
                  const i = firstVisible + idx
                  const row = graph[i]
                  if (!row || commit.parents.length < 2) return null
                  return (
                    <circle
                      key={`merge-${commit.hash}`}
                      cx={laneX(row.lane)}
                      cy={rowY(i)}
                      r={MERGE_R}
                      fill={laneColor(row.color)}
                      stroke="#12141a"
                      strokeWidth={1.5}
                      opacity={soloSet && !soloSet.has(row.hash) ? 0.3 : 1}
                    />
                  )
                })}

                {/* Uncommitted changes: a dashed node wired to HEAD by a dashed line. */}
                {hasChanges && (
                  <>
                    {commits.length > 0 && graph[headIndex] && (
                      <path
                        d={edgePath(
                          laneX(graph[headIndex].lane),
                          ROW_H / 2,
                          laneX(graph[headIndex].lane),
                          rowY(headIndex),
                          false
                        )}
                        fill="none"
                        stroke="#8b93a1"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                    )}
                    <circle
                      cx={laneX(graph[headIndex]?.lane ?? 0)}
                      cy={ROW_H / 2}
                      r={AVATAR / 2 - 1}
                      fill="#12141a"
                      stroke="#8b93a1"
                      strokeWidth={1.5}
                      strokeDasharray="3 2.5"
                    />
                  </>
                )}
              </svg>

              {/* Working-directory pseudo-row (row "-1"). */}
              {hasChanges && (
                <button
                  onClick={() => void selectWorking()}
                  className={`absolute top-0 left-0 right-0 flex items-center text-left text-[12.5px] ${
                    mode === 'working' ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
                  }`}
                  style={{ height: ROW_H, paddingRight: 12 }}
                >
                  <span style={{ width: BRANCH_COL + graphWidth }} className="shrink-0" />
                  <span
                    className="flex-1 min-w-0 h-full flex items-center gap-2 pl-2.5"
                    style={{ borderLeft: '2px dashed #8b93a1' }}
                  >
                    <span className="font-mono text-[11px] text-txt-muted">{'//'}</span>
                    <span className="text-txt-bright font-medium">WIP</span>
                    <span className="text-txt-muted text-[11.5px]">
                      {status!.staged.length + status!.unstaged.length} changed file
                      {status!.staged.length + status!.unstaged.length === 1 ? '' : 's'}
                      {status!.staged.length > 0 && ` · ${status!.staged.length} staged`}
                    </span>
                  </span>
                </button>
              )}

              {/* commit rows — virtualized: only the visible slice, absolutely positioned */}
              <div className="absolute top-0 left-0 right-0">
                {visible.map((commit: Commit, idx) => {
                  const i = firstVisible + idx
                  const row = graph[i]
                  return (
                    <button
                      key={commit.hash}
                      onClick={() => void selectCommit(commit.hash)}
                      onContextMenu={(e) => openCommitMenu(e, commit)}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes('application/kc-branch'))
                          e.preventDefault()
                      }}
                      onDrop={(e) => onDropBranch(e, commit.hash)}
                      className={rowClass(commit.hash)}
                      style={{
                        position: 'absolute',
                        top: rowTop(i),
                        left: 0,
                        right: 0,
                        height: ROW_H,
                        paddingLeft: 0,
                        paddingRight: 12
                      }}
                    >
                      <RowContent
                        commit={commit}
                        stashes={stashesByBase.get(commit.hash)}
                        remotes={remoteNames}
                        currentBranch={status?.branch ?? null}
                        graphWidth={graphWidth}
                        showGraph={true}
                        color={row ? laneColor(row.color) : undefined}
                        selected={isSelected(commit.hash)}
                        cols={cols}
                        onRefMenu={openRefMenu}
                        onRefActivate={activateRef}
                        onStashMenu={openStashMenu}
                      />
                    </button>
                  )
                })}
              </div>

              {/* Author avatars sit on each (non-merge) commit node, above the rows
                  but click-through so row interactions still work. */}
              <div className="absolute top-0 left-0 right-0 pointer-events-none">
                {visible.map((commit: Commit, idx) => {
                  const i = firstVisible + idx
                  const row = graph[i]
                  if (!row || commit.parents.length > 1) return null
                  const color = laneColor(row.color)
                  return (
                    <div
                      key={commit.hash}
                      className="absolute rounded-full overflow-hidden bg-base-900"
                      style={{
                        left: BRANCH_COL + laneX(row.lane) - AVATAR / 2,
                        top: rowY(i) - AVATAR / 2,
                        width: AVATAR,
                        height: AVATAR,
                        border: `2px solid ${color}`,
                        boxShadow: isSelected(commit.hash)
                          ? `0 0 0 3px ${withAlpha(color, 0.35)}`
                          : undefined,
                        opacity: soloSet && !soloSet.has(row.hash) ? 0.3 : 1
                      }}
                    >
                      <Avatar
                        email={commit.authorEmail}
                        name={commit.authorName}
                        size={AVATAR - 4}
                        className="rounded-full"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
