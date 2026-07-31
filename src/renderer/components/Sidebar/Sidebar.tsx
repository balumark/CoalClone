import { useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import ContextMenu, { type MenuState } from '@renderer/components/ContextMenu/ContextMenu'
import { ComputerIcon, RemoteIcon } from '@renderer/components/icons/RefIcons'
import { buildBranchMenu } from '@renderer/lib/branchMenu'
import type { Branch, Remote, Tag } from '@shared/types'

// Left sidebar: local branches, remotes, tags, stashes. Double-click a local
// branch to check it out; the "+" creates a new branch from HEAD.

function Section({
  title,
  count,
  children,
  action
}: {
  title: string
  count: number
  children: React.ReactNode
  action?: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-2 h-6 text-[11px] uppercase tracking-wide text-txt-muted">
        <button className="flex items-center gap-1" onClick={() => setOpen((o) => !o)}>
          <span className="inline-block w-2">{open ? '▾' : '▸'}</span>
          {title} <span className="text-txt-muted/60">({count})</span>
        </button>
        {action}
      </div>
      {open && <div>{children}</div>}
    </div>
  )
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

  const branches = snapshot?.branches ?? []
  const locals = branches.filter((b) => !b.isRemote)
  const remotes = snapshot?.remotes ?? []
  const remoteBranches = branches.filter((b) => b.isRemote)
  const tags = snapshot?.tags ?? []
  const stashes = snapshot?.stashes ?? []
  const submodules = snapshot?.submodules ?? []

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
    const url = await askInput({ title: `URL for "${r.name}"`, initial: r.fetchUrl, okLabel: 'Save' })
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

  const BranchRow = ({ b }: { b: Branch }): JSX.Element => (
    <div
      onDoubleClick={() => void checkout(b.name)}
      onContextMenu={(e) => openBranchMenu(e, b)}
      title="Double-click to checkout · right-click for actions"
      className={`group flex items-center w-full text-left px-2 py-0.5 gap-2 cursor-pointer hover:bg-base-700 ${
        b.current ? 'text-accent' : b.isRemote ? 'text-txt-muted' : 'text-txt'
      }`}
    >
      <span
        className="w-3.5 flex items-center justify-center text-[12px] shrink-0"
        title={b.isRemote ? 'Remote branch' : b.current ? 'Current local branch' : 'Local branch'}
      >
        {b.isRemote ? (
          <RemoteIcon className="text-txt-muted" />
        ) : (
          <ComputerIcon className={b.current ? 'text-accent' : 'text-txt-muted'} />
        )}
      </span>
      <span className="truncate text-[12px] flex-1">{b.name.replace(/^remotes\//, '')}</span>
      {!b.isRemote && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            void onRename(b)
          }}
          title="Rename branch"
          className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
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
          className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded text-bad hover:bg-bad/15"
        >
          ⨯
        </button>
      )}
    </div>
  )

  return (
    <div className="h-full overflow-auto py-1">
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      <Section
        title="Local"
        count={locals.length}
        action={
          <button
            onClick={() => void onNewBranch()}
            className="text-txt-muted hover:text-accent text-sm leading-none"
            title="New branch"
          >
            +
          </button>
        }
      >
        {locals.map((b) => (
          <BranchRow key={b.name} b={b} />
        ))}
      </Section>

      <Section
        title="Remotes"
        count={remoteBranches.length}
        action={
          <button
            onClick={() => void onAddRemote()}
            className="text-txt-muted hover:text-accent text-sm leading-none"
            title="Add remote"
          >
            +
          </button>
        }
      >
        {remotes.map((r) => (
          <div
            key={r.name}
            className="group flex items-center gap-2 px-2 py-0.5 hover:bg-base-700"
            title={`${r.name} · ${r.fetchUrl}`}
          >
            <span className="truncate text-[11px] text-txt-muted flex-1">
              <span className="text-txt">{r.name}</span> · {r.fetchUrl}
            </span>
            <button
              onClick={() => void diagnoseRemote(r.name)}
              title="Test connection — why can't I fetch/pull?"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
            >
              Test
            </button>
            <button
              onClick={() => void onEditRemote(r)}
              title="Edit URL"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
            >
              ✎
            </button>
            <button
              onClick={() => onRemoveRemote(r)}
              title="Remove remote"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded text-bad hover:bg-bad/15"
            >
              ⨯
            </button>
          </div>
        ))}
        {remoteBranches.map((b) => (
          <BranchRow key={b.name} b={b} />
        ))}
      </Section>

      <Section title="Tags" count={tags.length}>
        {tags.map((t: Tag) => (
          <div key={t.name} className="group flex items-center gap-2 px-2 py-0.5 hover:bg-base-700">
            <span className="truncate text-[12px] text-warn flex-1" title={`${t.name} @ ${t.commit}`}>
              {t.name}
            </span>
            <button
              onClick={() => void pushTag(t.name)}
              title="Push tag to origin"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
            >
              Push
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete tag "${t.name}"?`)) void deleteTag(t.name)
              }}
              title="Delete tag (local)"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded text-bad hover:bg-bad/15"
            >
              ⨯
            </button>
          </div>
        ))}
      </Section>

      {submodules.length > 0 && (
        <Section title="Submodules" count={submodules.length}>
          {submodules.map((sm) => {
            const st = subState[sm.state]
            return (
              <div
                key={sm.path}
                className="flex items-center gap-2 px-2 py-0.5 hover:bg-base-700"
                title={`${st.label} · ${sm.hash}${sm.ref ? ` (${sm.ref})` : ''}`}
              >
                <span className={`text-[10px] w-3 shrink-0 ${st.color}`}>{st.glyph}</span>
                <span className="truncate text-[12px] text-txt flex-1">{sm.path}</span>
                <span className="font-mono text-[10px] text-txt-muted shrink-0">
                  {sm.shortHash}
                </span>
              </div>
            )
          })}
        </Section>
      )}

      <Section title="Stashes" count={stashes.length}>
        {stashes.map((s) => (
          <div
            key={s.index}
            className="group flex items-center px-2 py-0.5 gap-2 hover:bg-base-700"
          >
            <span className="truncate text-[12px] text-txt flex-1" title={s.message}>
              {s.message}
            </span>
            <button
              onClick={() => void stashPop(s.index)}
              title="Pop (apply and drop)"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
            >
              Pop
            </button>
            <button
              onClick={() => void stashApply(s.index)}
              title="Apply (keep the stash)"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
            >
              Apply
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Drop stash?\n\n${s.message}`)) void stashDrop(s.index)
              }}
              title="Drop (delete permanently)"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded text-bad hover:bg-bad/15"
            >
              Drop
            </button>
          </div>
        ))}
      </Section>
    </div>
  )
}
