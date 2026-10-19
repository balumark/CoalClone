import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import ContextMenu, { type MenuState } from '@renderer/components/ContextMenu/ContextMenu'
import {
  BranchIcon,
  CheckIcon,
  ChevronIcon,
  ComputerIcon,
  FolderIcon,
  GlobeIcon,
  RemoteIcon,
  SearchIcon,
  StashIcon,
  SubmoduleIcon,
  TagIcon
} from '@renderer/components/icons/RefIcons'
import { buildBranchMenu } from '@renderer/lib/branchMenu'
import { buildTree, matchRange, matches, type TreeNode } from '@renderer/lib/refTree'
import type { Branch, Remote, Tag } from '@shared/types'

// Left sidebar, GitKraken-style: a filter box on top (Ctrl+Alt+F), then
// collapsible LOCAL / REMOTE / TAGS / STASHES / SUBMODULES sections whose refs
// are grouped into folders by their `/` segments. Double-click a branch to check
// it out, right-click for the full branch menu; hover shows quick actions.
// Folder/section open state survives restarts (localStorage, per-viewer only).

const COLLAPSED_KEY = 'coal.sidebar.collapsed'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveCollapsed(set: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]))
  } catch {
    // Storage unavailable — the state just won't survive a restart.
  }
}

/** Indentation for a tree row at `depth` (px). */
const indent = (depth: number): number => 10 + depth * 14

/** `text` with the part inside `range` (shifted by `offset`) highlighted. */
function Hl({
  text,
  offset = 0,
  range
}: {
  text: string
  offset?: number
  range: [number, number] | null
}): JSX.Element {
  if (!range) return <>{text}</>
  const s = Math.max(0, range[0] - offset)
  const e = Math.min(text.length, range[1] - offset)
  if (s >= e) return <>{text}</>
  return (
    <>
      {text.slice(0, s)}
      <mark className="bg-accent/35 text-txt-bright rounded-[2px]">{text.slice(s, e)}</mark>
      {text.slice(e)}
    </>
  )
}

const hoverBtn =
  'opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-px rounded border border-edge text-txt-muted hover:bg-base-600 hover:text-txt shrink-0'
const hoverDanger =
  'opacity-0 group-hover:opacity-100 text-[11px] px-1 rounded text-bad hover:bg-bad/15 shrink-0'

function SectionHeader({
  icon,
  title,
  count,
  total,
  open,
  onToggle,
  action
}: {
  icon: React.ReactNode
  title: string
  count: number
  total?: number
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}): JSX.Element {
  return (
    <div className="group sticky top-0 z-10 flex items-center h-8 pl-1.5 pr-2 bg-base-800 border-y border-edge/70 select-none">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 flex-1 min-w-0 h-full text-[11px] font-semibold uppercase tracking-wider text-txt-muted hover:text-txt"
      >
        <ChevronIcon
          className={`text-[11px] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-[13px] shrink-0">{icon}</span>
        <span className="truncate">{title}</span>
      </button>
      {action}
      <span className="ml-2 text-[11px] tabular-nums text-txt-muted">
        {total !== undefined && total !== count ? `${count}/${total}` : count}
      </span>
    </div>
  )
}

function FolderRow({
  node,
  depth,
  open,
  onToggle,
  range
}: {
  node: TreeNode<unknown>
  depth: number
  open: boolean
  onToggle: () => void
  range: [number, number] | null
}): JSX.Element {
  return (
    <div
      onClick={onToggle}
      style={{ paddingLeft: indent(depth) }}
      className="flex items-center h-[26px] pr-2 gap-1.5 cursor-pointer text-txt-muted hover:bg-base-700 hover:text-txt select-none"
    >
      <ChevronIcon
        className={`text-[10px] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      />
      <FolderIcon className="text-[13px] shrink-0 text-txt-muted/80" />
      <span className="truncate text-[12.5px] flex-1">
        <Hl text={node.name} offset={node.offset} range={range} />
      </span>
      <span className="text-[10.5px] tabular-nums text-txt-muted/70">{node.count}</span>
    </div>
  )
}

/**
 * The match range to highlight on a folder: the first descendant whose own
 * match overlaps this folder's segment (folders don't match on their own).
 */
function folderRange<T>(
  node: TreeNode<T>,
  fullOf: (t: T) => string,
  query: string
): [number, number] | null {
  const end = node.offset + node.name.length
  const stack = [...node.children]
  while (stack.length) {
    const n = stack.pop()!
    if (n.item === undefined) {
      stack.push(...n.children)
      continue
    }
    const r = matchRange(fullOf(n.item), query)
    if (r && r[0] < end && r[1] > node.offset) return r
  }
  return null
}

export default function Sidebar(): JSX.Element {
  const snapshot = useRepoStore((s) => s.snapshot)
  const checkout = useRepoStore((s) => s.checkout)
  const createBranch = useRepoStore((s) => s.createBranch)
  const deleteBranch = useRepoStore((s) => s.deleteBranch)
  const renameBranch = useRepoStore((s) => s.renameBranch)
  const addRemote = useRepoStore((s) => s.addRemote)
  const setRemoteUrl = useRepoStore((s) => s.setRemoteUrl)
  const removeRemote = useRepoStore((s) => s.removeRemote)
  const diagnoseRemote = useRepoStore((s) => s.openRemoteDiagnostics)
  const pushTag = useRepoStore((s) => s.pushTag)
  const deleteTag = useRepoStore((s) => s.deleteTag)
  const askInput = useRepoStore((s) => s.askInput)
  const stashPop = useRepoStore((s) => s.stashPop)
  const stashApply = useRepoStore((s) => s.stashApply)
  const stashDrop = useRepoStore((s) => s.stashDrop)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const inputRef = useRef<HTMLInputElement>(null)
  const filtering = query.trim().length > 0

  // Ctrl+Alt+F jumps to the filter from anywhere, like GitKraken.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** While filtering every folder is forced open, so matches are never hidden. */
  const isOpen = (key: string): boolean =>
    (filtering && !key.startsWith('section:')) || !collapsed.has(key)
  const toggle = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveCollapsed(next)
      return next
    })
  }

  const branches = useMemo(() => snapshot?.branches ?? [], [snapshot])
  const remotes = useMemo(() => snapshot?.remotes ?? [], [snapshot])
  const tags = useMemo(() => snapshot?.tags ?? [], [snapshot])
  const stashes = useMemo(() => snapshot?.stashes ?? [], [snapshot])
  const submodules = useMemo(() => snapshot?.submodules ?? [], [snapshot])

  const remoteName = (b: Branch): string => b.name.replace(/^remotes\//, '')

  const view = useMemo(() => {
    const locals = branches.filter((b) => !b.isRemote)
    const remoteBranches = branches.filter((b) => b.isRemote && !/\/HEAD$/.test(b.name))
    const m = {
      locals: locals.filter((b) => matches(b.name, query)),
      remoteBranches: remoteBranches.filter((b) => matches(remoteName(b), query)),
      tags: tags.filter((t) => matches(t.name, query)),
      stashes: stashes.filter((s) => matches(`${s.message} ${s.branch}`, query)),
      submodules: submodules.filter((s) => matches(s.path, query))
    }
    // Remote branches grouped under their remote; a remote whose name/URL
    // matches the filter is shown even when none of its branches do.
    const byRemote = remotes
      .map((r) => {
        const prefix = `${r.name}/`
        const own = m.remoteBranches.filter((b) => remoteName(b).startsWith(prefix))
        return {
          remote: r,
          tree: buildTree(own, (b) => remoteName(b).slice(prefix.length), prefix.length),
          count: own.length,
          total: remoteBranches.filter((b) => remoteName(b).startsWith(prefix)).length,
          visible: !filtering || own.length > 0 || matches(`${r.name} ${r.fetchUrl}`, query)
        }
      })
      .filter((g) => g.visible)
    const total =
      locals.length + remoteBranches.length + tags.length + stashes.length + submodules.length
    const shown =
      m.locals.length +
      m.remoteBranches.length +
      m.tags.length +
      m.stashes.length +
      m.submodules.length
    return {
      locals,
      remoteBranches,
      m,
      byRemote,
      localTree: buildTree(m.locals, (b) => b.name),
      tagTree: buildTree(m.tags, (t) => t.name),
      total,
      shown
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, remotes, tags, stashes, submodules, query, filtering])

  const subState: Record<string, { glyph: string; color: string; label: string }> = {
    ok: { glyph: '●', color: 'text-good', label: 'In sync' },
    modified: { glyph: '+', color: 'text-warn', label: 'Different commit checked out' },
    uninitialized: { glyph: '○', color: 'text-txt-muted', label: 'Not initialized' },
    conflict: { glyph: '!', color: 'text-bad', label: 'Merge conflict' }
  }

  const onNewBranch = async (): Promise<void> => {
    const name = await askInput({ title: 'New branch name', placeholder: 'feature/…' })
    if (name) void createBranch(name, true)
  }

  const onRename = async (b: Branch): Promise<void> => {
    const next = await askInput({ title: 'Rename branch', initial: b.name, okLabel: 'Rename' })
    if (next && next !== b.name) void renameBranch(b.name, next)
  }

  const onAddRemote = async (): Promise<void> => {
    const name = await askInput({ title: 'Remote name', initial: 'origin' })
    if (!name) return
    const url = await askInput({
      title: `URL for "${name}"`,
      placeholder: 'git@github.com:user/repo.git',
      okLabel: 'Add'
    })
    if (url) void addRemote(name, url)
  }

  const onEditRemote = async (r: Remote): Promise<void> => {
    const url = await askInput({
      title: `URL for "${r.name}"`,
      initial: r.fetchUrl,
      okLabel: 'Save'
    })
    if (url && url !== r.fetchUrl) void setRemoteUrl(r.name, url)
  }

  const onRemoveRemote = (r: Remote): void => {
    if (window.confirm(`Remove remote "${r.name}"?`)) void removeRemote(r.name)
  }

  const onDelete = async (b: Branch): Promise<void> => {
    if (!window.confirm(`Delete branch "${b.name}"?`)) return
    const res = await deleteBranch(b.name, false)
    if (!res.ok && res.code === 'NOT_MERGED') {
      const force = window.confirm(
        `"${b.name}" is not fully merged. Force delete anyway? This discards its unmerged commits.`
      )
      if (force) await deleteBranch(b.name, true)
    }
  }

  const openBranchMenu = (e: React.MouseEvent, b: Branch): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, items: buildBranchMenu(b) })
  }

  const BranchLeaf = ({
    b,
    node,
    depth
  }: {
    b: Branch
    node: TreeNode<Branch>
    depth: number
  }): JSX.Element => {
    const full = b.isRemote ? remoteName(b) : b.name
    return (
      <div
        onDoubleClick={() => void checkout(b.name)}
        onContextMenu={(e) => openBranchMenu(e, b)}
        title={`${full}\nDouble-click to checkout · right-click for actions`}
        style={{ paddingLeft: indent(depth) + 16 }}
        className={`group flex items-center h-[26px] pr-2 gap-1.5 cursor-pointer select-none ${
          b.current
            ? 'bg-good/15 text-txt-bright hover:bg-good/20'
            : b.isRemote
              ? 'text-txt-muted hover:bg-base-700 hover:text-txt'
              : 'text-txt hover:bg-base-700'
        }`}
      >
        {b.current ? (
          <CheckIcon className="text-[13px] shrink-0 text-good" />
        ) : (
          <BranchIcon className="text-[12px] shrink-0 text-txt-muted" />
        )}
        <span className={`truncate text-[12.5px] flex-1 ${b.current ? 'font-semibold' : ''}`}>
          <Hl text={node.name} offset={node.offset} range={matchRange(full, query)} />
        </span>
        {!b.isRemote && (b.ahead > 0 || b.behind > 0) && (
          <span
            className="flex gap-1 text-[10.5px] tabular-nums text-txt-muted shrink-0"
            title={`${b.ahead} ahead · ${b.behind} behind ${b.upstream ?? 'upstream'}`}
          >
            {b.ahead > 0 && <span>↑{b.ahead}</span>}
            {b.behind > 0 && <span>↓{b.behind}</span>}
          </span>
        )}
        {!b.isRemote && b.upstream && (
          <span title={`Tracks ${b.upstream}`} className="shrink-0 group-hover:hidden">
            <RemoteIcon className="text-[11px] text-txt-muted/70" />
          </span>
        )}
        {!b.isRemote && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void onRename(b)
            }}
            title="Rename branch"
            className={hoverBtn}
          >
            ✎
          </button>
        )}
        {!b.isRemote && !b.current && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void onDelete(b)
            }}
            title="Delete branch"
            className={hoverDanger}
          >
            ⨯
          </button>
        )}
      </div>
    )
  }

  /** Render a ref tree; `scope` keeps folder keys unique per section/remote. */
  function renderTree<T>(
    nodes: TreeNode<T>[],
    depth: number,
    scope: string,
    fullOf: (t: T) => string,
    leaf: (item: T, node: TreeNode<T>, depth: number) => JSX.Element
  ): JSX.Element[] {
    return nodes.map((n) => {
      if (n.item !== undefined)
        return <div key={`${scope}:${n.path}`}>{leaf(n.item, n, depth)}</div>
      const key = `${scope}:${n.path}`
      const open = isOpen(key)
      return (
        <div key={key}>
          <FolderRow
            node={n as TreeNode<unknown>}
            depth={depth}
            open={open}
            onToggle={() => toggle(key)}
            range={filtering ? folderRange(n, fullOf, query) : null}
          />
          {open && renderTree(n.children, depth + 1, scope, fullOf, leaf)}
        </div>
      )
    })
  }

  const { m } = view
  const showSection = (count: number): boolean => !filtering || count > 0

  return (
    <div className="h-full flex flex-col min-h-0">
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {/* Filter */}
      <div className="shrink-0 border-b border-edge">
        {filtering && (
          <div className="flex items-center justify-between h-7 px-2.5 bg-accent/25 text-[12px] text-txt-bright">
            <span>
              Filtering{' '}
              <span className="tabular-nums">
                {view.shown}/{view.total}
              </span>
            </span>
            <button onClick={() => setQuery('')} className="hover:underline">
              Clear filter
            </button>
          </div>
        )}
        <div className="p-2">
          <div className="flex items-center gap-1.5 h-7 px-2 rounded bg-base-900 border border-edge focus-within:border-accent/70">
            <SearchIcon className="text-[12px] text-txt-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('')
                  inputRef.current?.blur()
                }
              }}
              placeholder="Filter (Ctrl + Alt + F)"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent outline-none text-[12px] text-txt placeholder:text-txt-muted/70"
            />
            {filtering && (
              <button
                onClick={() => setQuery('')}
                title="Clear filter (Esc)"
                className="text-txt-muted hover:text-txt text-[13px] leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-2">
        {/* LOCAL */}
        {showSection(m.locals.length) && (
          <div>
            <SectionHeader
              icon={<ComputerIcon />}
              title="Local"
              count={m.locals.length}
              total={filtering ? view.locals.length : undefined}
              open={isOpen('section:local')}
              onToggle={() => toggle('section:local')}
              action={
                <button
                  onClick={() => void onNewBranch()}
                  className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-accent text-[15px] leading-none px-1"
                  title="New branch"
                >
                  +
                </button>
              }
            />
            {isOpen('section:local') &&
              (view.localTree.length ? (
                renderTree(
                  view.localTree,
                  0,
                  'local',
                  (b) => b.name,
                  (b, node, depth) => <BranchLeaf b={b} node={node} depth={depth} />
                )
              ) : (
                <div className="px-3 py-1.5 text-[11.5px] italic text-txt-muted">No branches</div>
              ))}
          </div>
        )}

        {/* REMOTE */}
        {showSection(view.byRemote.length) && (
          <div>
            <SectionHeader
              icon={<RemoteIcon />}
              title="Remote"
              count={m.remoteBranches.length}
              total={filtering ? view.remoteBranches.length : undefined}
              open={isOpen('section:remote')}
              onToggle={() => toggle('section:remote')}
              action={
                <button
                  onClick={() => void onAddRemote()}
                  className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-accent text-[15px] leading-none px-1"
                  title="Add remote"
                >
                  +
                </button>
              }
            />
            {isOpen('section:remote') &&
              view.byRemote.map(({ remote: r, tree, count }) => {
                const key = `remote:${r.name}`
                const open = isOpen(key)
                return (
                  <div key={r.name}>
                    <div
                      onClick={() => toggle(key)}
                      title={`${r.name} · ${r.fetchUrl}`}
                      style={{ paddingLeft: indent(0) }}
                      className="group flex items-center h-[26px] pr-2 gap-1.5 cursor-pointer text-txt hover:bg-base-700 select-none"
                    >
                      <ChevronIcon
                        className={`text-[10px] shrink-0 text-txt-muted transition-transform ${open ? 'rotate-90' : ''}`}
                      />
                      <GlobeIcon className="text-[13px] shrink-0 text-txt-muted" />
                      <span className="text-[12.5px] shrink-0">
                        <Hl text={r.name} range={matchRange(r.name, query)} />
                      </span>
                      <span className="truncate text-[11px] text-txt-muted/70 flex-1 min-w-0 group-hover:hidden">
                        {r.fetchUrl}
                      </span>
                      <span className="hidden group-hover:flex flex-1 justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void diagnoseRemote(r.name)
                          }}
                          title="Test connection — why can't I fetch/pull?"
                          className={hoverBtn}
                        >
                          Test
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void onEditRemote(r)
                          }}
                          title="Edit URL"
                          className={hoverBtn}
                        >
                          ✎
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveRemote(r)
                          }}
                          title="Remove remote"
                          className={hoverDanger}
                        >
                          ⨯
                        </button>
                      </span>
                      <span className="text-[10.5px] tabular-nums text-txt-muted/70 shrink-0">
                        {count}
                      </span>
                    </div>
                    {open &&
                      renderTree(
                        tree,
                        1,
                        key,
                        (b) => remoteName(b),
                        (b, node, depth) => <BranchLeaf b={b} node={node} depth={depth} />
                      )}
                  </div>
                )
              })}
          </div>
        )}

        {/* TAGS */}
        {showSection(m.tags.length) && (
          <div>
            <SectionHeader
              icon={<TagIcon />}
              title="Tags"
              count={m.tags.length}
              total={filtering ? tags.length : undefined}
              open={isOpen('section:tags')}
              onToggle={() => toggle('section:tags')}
            />
            {isOpen('section:tags') &&
              renderTree(
                view.tagTree,
                0,
                'tags',
                (t) => t.name,
                (t: Tag, node, depth) => (
                  <div
                    title={`${t.name} @ ${t.commit}`}
                    style={{ paddingLeft: indent(depth) + 16 }}
                    className="group flex items-center h-[26px] pr-2 gap-1.5 text-txt hover:bg-base-700 select-none"
                  >
                    <TagIcon className="text-[12px] shrink-0 text-warn" />
                    <span className="truncate text-[12.5px] flex-1">
                      <Hl text={node.name} offset={node.offset} range={matchRange(t.name, query)} />
                    </span>
                    <button
                      onClick={() => void pushTag(t.name)}
                      title="Push tag to origin"
                      className={hoverBtn}
                    >
                      Push
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete tag "${t.name}"?`)) void deleteTag(t.name)
                      }}
                      title="Delete tag (local)"
                      className={hoverDanger}
                    >
                      ⨯
                    </button>
                  </div>
                )
              )}
          </div>
        )}

        {/* STASHES */}
        {showSection(m.stashes.length) && (
          <div>
            <SectionHeader
              icon={<StashIcon />}
              title="Stashes"
              count={m.stashes.length}
              total={filtering ? stashes.length : undefined}
              open={isOpen('section:stashes')}
              onToggle={() => toggle('section:stashes')}
            />
            {isOpen('section:stashes') &&
              m.stashes.map((s) => (
                <div
                  key={s.index}
                  title={`stash@{${s.index}} · ${s.branch}\n${s.message}`}
                  style={{ paddingLeft: indent(0) + 16 }}
                  className="group flex items-center h-[26px] pr-2 gap-1.5 text-txt hover:bg-base-700 select-none"
                >
                  <StashIcon className="text-[12px] shrink-0 text-txt-muted" />
                  <span className="truncate text-[12.5px] flex-1">
                    <Hl text={s.message} range={matchRange(s.message, query)} />
                  </span>
                  <span className="text-[10.5px] font-mono text-txt-muted/70 shrink-0 group-hover:hidden">
                    {`@{${s.index}}`}
                  </span>
                  <button
                    onClick={() => void stashPop(s.index)}
                    title="Pop (apply and drop)"
                    className={hoverBtn}
                  >
                    Pop
                  </button>
                  <button
                    onClick={() => void stashApply(s.index)}
                    title="Apply (keep the stash)"
                    className={hoverBtn}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Drop stash?\n\n${s.message}`)) void stashDrop(s.index)
                    }}
                    title="Drop (delete permanently)"
                    className={hoverDanger}
                  >
                    ⨯
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* SUBMODULES */}
        {submodules.length > 0 && showSection(m.submodules.length) && (
          <div>
            <SectionHeader
              icon={<SubmoduleIcon />}
              title="Submodules"
              count={m.submodules.length}
              total={filtering ? submodules.length : undefined}
              open={isOpen('section:submodules')}
              onToggle={() => toggle('section:submodules')}
            />
            {isOpen('section:submodules') &&
              m.submodules.map((sm) => {
                const st = subState[sm.state]
                return (
                  <div
                    key={sm.path}
                    title={`${st.label} · ${sm.hash}${sm.ref ? ` (${sm.ref})` : ''}`}
                    style={{ paddingLeft: indent(0) + 16 }}
                    className="flex items-center h-[26px] pr-2 gap-1.5 hover:bg-base-700 select-none"
                  >
                    <span className={`text-[10px] w-3 shrink-0 text-center ${st.color}`}>
                      {st.glyph}
                    </span>
                    <span className="truncate text-[12.5px] text-txt flex-1">
                      <Hl text={sm.path} range={matchRange(sm.path, query)} />
                    </span>
                    <span className="font-mono text-[10.5px] text-txt-muted shrink-0">
                      {sm.shortHash}
                    </span>
                  </div>
                )
              })}
          </div>
        )}

        {filtering && view.shown === 0 && view.byRemote.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-txt-muted">
            Nothing matches “{query.trim()}”.
          </div>
        )}
      </div>
    </div>
  )
}
