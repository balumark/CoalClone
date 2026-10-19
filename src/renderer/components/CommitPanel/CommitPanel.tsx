import { useEffect, useState, type MouseEvent } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import ContextMenu, {
  type MenuItem,
  type MenuState
} from '@renderer/components/ContextMenu/ContextMenu'
import { isWorkingAction, runningLabel } from '@renderer/lib/format'
import { buildTree, compactTree, type TreeNode } from '@renderer/lib/refTree'
import { BranchIcon, ChevronIcon, FolderIcon, StashIcon } from '@renderer/components/icons/RefIcons'
import {
  ListIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  TreeIcon
} from '@renderer/components/icons/UiIcons'
import type { ConflictResolution, FileStatus, GitOperation } from '@shared/types'

const opLabel: Record<GitOperation, string> = {
  merge: 'Merging',
  rebase: 'Rebasing',
  'cherry-pick': 'Cherry-picking',
  revert: 'Reverting'
}

function SparkleIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
      <path d="M8 1l1.3 3.7L13 6l-3.7 1.3L8 11 6.7 7.3 3 6l3.7-1.3L8 1Zm4.5 7l.7 1.8L15 10.5l-1.8.7-.7 1.8-.7-1.8L10 10.5l1.8-.7.7-1.8ZM3.5 9l.6 1.4L5.5 11l-1.4.6L3.5 13l-.6-1.4L1.5 11l1.4-.6L3.5 9Z" />
    </svg>
  )
}

/** Small inline spinner, same visual language as the boot LoadingOverlay. */
function Spinner({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 50 50" aria-hidden>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="6"
        className="stroke-base-600"
        opacity="0.4"
      />
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="80 200"
        className="stroke-accent"
      />
    </svg>
  )
}

function ConflictRow({
  file,
  selected,
  onSelect,
  onMerge,
  onResolve,
  onAiResolve,
  aiBusy
}: {
  file: FileStatus
  selected: boolean
  onSelect: () => void
  onMerge: () => void
  onResolve: (r: ConflictResolution) => void
  onAiResolve?: () => void
  aiBusy?: boolean
}): JSX.Element {
  const btn = 'text-[10px] px-1 rounded border border-edge hover:bg-base-600'
  return (
    <div
      className={`flex items-center px-2 py-1 gap-1.5 cursor-pointer ${
        selected ? 'bg-accent/15' : 'hover:bg-base-700'
      }`}
      onClick={onSelect}
      onDoubleClick={onMerge}
      title="Double-click to open the merge tool"
    >
      <span className="font-mono text-[11px] w-3 shrink-0 text-bad">!</span>
      <span className="truncate font-mono text-[12px] flex-1">{file.path}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMerge()
        }}
        title="Open the 3-way merge tool"
        className="text-[10px] px-1.5 rounded bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
      >
        Merge
      </button>
      {onAiResolve && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAiResolve()
          }}
          disabled={aiBusy}
          title="Let the AI merge both sides (written to the file, left unstaged for review)"
          className={`${btn} text-accent inline-flex items-center gap-1 disabled:opacity-40`}
        >
          {aiBusy ? <Spinner size={10} /> : <SparkleIcon />} AI
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onResolve('ours')
        }}
        title="Take our version"
        className={`${btn} text-txt-muted`}
      >
        Ours
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onResolve('theirs')
        }}
        title="Take their version"
        className={`${btn} text-txt-muted`}
      >
        Theirs
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onResolve('mark')
        }}
        title="Mark resolved (after editing the file by hand)"
        className={`${btn} text-good`}
      >
        ✓
      </button>
    </div>
  )
}

/** A conflict the user already settled — listed separately, with a way back. */
function ResolvedRow({
  path,
  selected,
  onSelect,
  onUndo
}: {
  path: string
  selected: boolean
  onSelect: () => void
  onUndo: () => void
}): JSX.Element {
  return (
    <div
      className={`flex items-center px-2 py-1 gap-2 cursor-pointer ${
        selected ? 'bg-accent/15' : 'hover:bg-base-700'
      }`}
      onClick={onSelect}
    >
      <span className="font-mono text-[11px] w-3 shrink-0 text-good">✓</span>
      <span className="truncate font-mono text-[12px] flex-1 text-txt-muted">{path}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onUndo()
        }}
        title="Bring the conflict back (git checkout --merge)"
        className="text-[10px] px-1 rounded border border-edge text-txt-muted hover:bg-base-600"
      >
        Undo
      </button>
    </div>
  )
}

// Staging area: unstaged + staged lists with stage/unstage/discard, a message
// box and the commit button. Selecting a file loads its working diff.
//
// Rows show the file NAME first and its folder dimmed after it (what you scan
// for is the name), a colored status badge, and icon actions on hover. The
// lists can be flat ("Path") or a folder tree ("Tree", built with the same
// lib/refTree the sidebar uses) — folders stage/unstage as a whole.

const typeInfo: Record<FileStatus['type'], { glyph: string; cls: string; label: string }> = {
  modified: { glyph: 'M', cls: 'bg-warn/15 text-warn', label: 'Modified' },
  added: { glyph: 'A', cls: 'bg-good/15 text-good', label: 'Added' },
  deleted: { glyph: 'D', cls: 'bg-bad/15 text-bad', label: 'Deleted' },
  renamed: { glyph: 'R', cls: 'bg-accent/20 text-accent', label: 'Renamed' },
  copied: { glyph: 'C', cls: 'bg-accent/20 text-accent', label: 'Copied' },
  untracked: { glyph: 'U', cls: 'bg-good/15 text-good', label: 'Untracked (new file)' },
  conflicted: { glyph: '!', cls: 'bg-bad/20 text-bad', label: 'Conflicted' },
  unknown: { glyph: '?', cls: 'bg-base-600 text-txt-muted', label: 'Unknown' }
}

export type FileView = 'path' | 'tree'
const VIEW_KEY = 'coal.commitPanel.view'

function loadView(): FileView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'tree' ? 'tree' : 'path'
  } catch {
    return 'path'
  }
}

function saveView(v: FileView): void {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // Storage unavailable — the choice just won't survive a restart.
  }
}

function StatusBadge({ type }: { type: FileStatus['type'] }): JSX.Element {
  const info = typeInfo[type]
  return (
    <span
      title={info.label}
      className={`inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] font-mono text-[10px] font-semibold shrink-0 ${info.cls}`}
    >
      {info.glyph}
    </span>
  )
}

const iconBtn =
  'inline-flex items-center justify-center w-[22px] h-[22px] rounded-md text-[13px] shrink-0 disabled:opacity-30 disabled:cursor-not-allowed'

function FileRow({
  file,
  name,
  dir,
  depth = 0,
  selected,
  onSelect,
  staged,
  onAction,
  onDiscard,
  onContext,
  checked,
  onCheck,
  anyChecked,
  disabled
}: {
  file: FileStatus
  /** What to show as the name (the last segment). */
  name: string
  /** Folder shown dimmed after the name (path view only). */
  dir?: string
  depth?: number
  selected: boolean
  onSelect: () => void
  staged: boolean
  onAction: () => void
  onDiscard?: () => void
  onContext?: (e: MouseEvent) => void
  checked?: boolean
  onCheck?: () => void
  /** Some row is ticked — keep every checkbox visible so the selection reads. */
  anyChecked?: boolean
  /** An index op is already running — don't queue a second one on top of it. */
  disabled?: boolean
}): JSX.Element {
  return (
    <div
      className={`group relative flex items-center h-[26px] pr-1.5 gap-2 cursor-pointer select-none ${
        selected ? 'bg-accent/15' : 'hover:bg-white/[0.04]'
      }`}
      style={{ paddingLeft: 10 + depth * 14 }}
      onClick={onSelect}
      onContextMenu={onContext}
      title={file.path}
    >
      {selected && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />}
      {/* The discard checkbox takes the status badge's place on hover (or while
          anything is ticked), so it costs no width and rows stay aligned. */}
      <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
        <span
          className={`flex ${onCheck ? (checked || anyChecked ? 'invisible' : 'group-hover:invisible') : ''}`}
        >
          <StatusBadge type={file.type} />
        </span>
        {onCheck && (
          <input
            type="checkbox"
            checked={!!checked}
            onClick={(e) => e.stopPropagation()}
            onChange={onCheck}
            title="Select for discard"
            className={`absolute inset-0 m-auto accent-accent w-3.5 h-3.5 ${
              checked || anyChecked ? '' : 'invisible group-hover:visible'
            }`}
          />
        )}
      </span>
      <span className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
        <span
          className={`truncate text-[12.5px] shrink-0 max-w-full ${
            file.type === 'deleted'
              ? 'line-through text-txt-muted'
              : selected
                ? 'text-txt-bright'
                : 'text-txt'
          }`}
        >
          {name}
        </span>
        {dir && <span className="truncate text-[11px] text-txt-muted/70">{dir}</span>}
      </span>
      {file.reserved && (
        <span
          className="shrink-0 text-warn text-[11px]"
          title={`"${file.path}" is a reserved Windows device name — git can't create it on this machine, so it stays "deleted". Stage this deletion and commit it (or rename the file from Linux/macOS) to get rid of it.`}
        >
          ⚠
        </span>
      )}
      <span
        className={`flex items-center gap-0.5 ${selected ? '' : 'opacity-0 group-hover:opacity-100'}`}
      >
        {onDiscard && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDiscard()
            }}
            disabled={disabled}
            className={`${iconBtn} text-txt-muted hover:text-bad hover:bg-bad/15`}
            title="Discard changes"
          >
            <TrashIcon />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          disabled={disabled}
          className={`${iconBtn} ${
            staged
              ? 'text-txt-muted hover:text-txt-bright hover:bg-white/[0.08]'
              : 'text-good hover:bg-good/15'
          }`}
          title={staged ? 'Unstage file' : 'Stage file'}
        >
          {staged ? <MinusIcon /> : <PlusIcon />}
        </button>
      </span>
    </div>
  )
}

function leavesOf(node: TreeNode<FileStatus>): FileStatus[] {
  return node.item ? [node.item] : node.children.flatMap(leavesOf)
}

/** One staging list (unstaged or staged), flat or as a folder tree. */
function FileList({
  files,
  staged,
  view,
  isSelected,
  onSelect,
  onAction,
  onDiscard,
  onContext,
  checked,
  onCheck,
  disabled
}: {
  files: FileStatus[]
  staged: boolean
  view: FileView
  isSelected: (f: FileStatus) => boolean
  onSelect: (f: FileStatus) => void
  onAction: (paths: string[]) => void
  onDiscard?: (files: FileStatus[]) => void
  onContext: (e: MouseEvent, f: FileStatus) => void
  checked?: Set<string>
  onCheck?: (path: string) => void
  disabled?: boolean
}): JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const anyChecked = !!checked && checked.size > 0

  const row = (
    f: FileStatus,
    name: string,
    dir: string | undefined,
    depth: number
  ): JSX.Element => (
    <FileRow
      key={f.path}
      file={f}
      name={name}
      dir={dir}
      depth={depth}
      selected={isSelected(f)}
      onSelect={() => onSelect(f)}
      staged={staged}
      onAction={() => onAction([f.path])}
      onDiscard={onDiscard ? () => onDiscard([f]) : undefined}
      onContext={(e) => onContext(e, f)}
      checked={checked?.has(f.path)}
      onCheck={onCheck ? () => onCheck(f.path) : undefined}
      anyChecked={anyChecked}
      disabled={disabled}
    />
  )

  if (view === 'path') {
    return (
      <>
        {files.map((f) => {
          const slash = f.path.lastIndexOf('/')
          return row(
            f,
            slash >= 0 ? f.path.slice(slash + 1) : f.path,
            slash >= 0 ? f.path.slice(0, slash) : undefined,
            0
          )
        })}
      </>
    )
  }

  const render = (nodes: TreeNode<FileStatus>[], depth: number): JSX.Element[] =>
    nodes.map((n) => {
      if (n.item) return row(n.item, n.name, undefined, depth)
      const open = !collapsed.has(n.path)
      const leaves = leavesOf(n)
      return (
        <div key={`dir:${n.path}`}>
          <div
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev)
                if (next.has(n.path)) next.delete(n.path)
                else next.add(n.path)
                return next
              })
            }
            style={{ paddingLeft: 10 + depth * 14 }}
            className="group flex items-center h-[26px] pr-1.5 gap-1.5 cursor-pointer select-none text-txt-muted hover:bg-white/[0.04] hover:text-txt"
          >
            <ChevronIcon
              className={`text-[10px] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <FolderIcon className="text-[13px] shrink-0 text-txt-muted/80" />
            <span className="flex-1 truncate text-[12.5px]">{n.name}</span>
            <span className="text-[10.5px] tabular-nums text-txt-muted/70 group-hover:hidden">
              {leaves.length}
            </span>
            <span className="hidden group-hover:flex items-center gap-0.5">
              {onDiscard && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDiscard(leaves)
                  }}
                  disabled={disabled}
                  className={`${iconBtn} text-txt-muted hover:text-bad hover:bg-bad/15`}
                  title={`Discard changes in ${n.path}/`}
                >
                  <TrashIcon />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAction(leaves.map((f) => f.path))
                }}
                disabled={disabled}
                className={`${iconBtn} ${
                  staged
                    ? 'text-txt-muted hover:text-txt-bright hover:bg-white/[0.08]'
                    : 'text-good hover:bg-good/15'
                }`}
                title={`${staged ? 'Unstage' : 'Stage'} everything in ${n.path}/`}
              >
                {staged ? <MinusIcon /> : <PlusIcon />}
              </button>
            </span>
          </div>
          {open && render(n.children, depth + 1)}
        </div>
      )
    })

  return <>{render(compactTree(buildTree(files, (f) => f.path)), 0)}</>
}

/** Collapsible header above a staging list. */
function ListHeader({
  title,
  count,
  tone = 'muted',
  open,
  onToggle,
  lead,
  action
}: {
  title: string
  count: number
  tone?: 'muted' | 'good'
  open: boolean
  onToggle: () => void
  lead?: React.ReactNode
  action?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 pl-2 pr-1.5 h-8 bg-base-800 border-y border-edge/80 shrink-0 select-none">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-txt-muted hover:text-txt"
      >
        <ChevronIcon
          className={`text-[10px] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {title}
      </button>
      <span
        className={`inline-flex items-center h-[17px] min-w-[20px] justify-center px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums ${
          count === 0
            ? 'bg-base-700 text-txt-muted/70'
            : tone === 'good'
              ? 'bg-good/15 text-good'
              : 'bg-base-600 text-txt'
        }`}
      >
        {count}
      </span>
      {lead}
      <span className="ml-auto flex items-center gap-1">{action}</span>
    </div>
  )
}

const headerBtn =
  'inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium border disabled:opacity-40 disabled:cursor-not-allowed'

export default function CommitPanel(): JSX.Element {
  const snapshot = useRepoStore((s) => s.snapshot)
  const mode = useRepoStore((s) => s.mode)
  const selectedPath = useRepoStore((s) => s.selectedPath)
  const selectedStaged = useRepoStore((s) => s.selectedStaged)
  const selectWorkingFile = useRepoStore((s) => s.selectWorkingFile)
  const stage = useRepoStore((s) => s.stage)
  const unstage = useRepoStore((s) => s.unstage)
  const discard = useRepoStore((s) => s.discard)
  const commit = useRepoStore((s) => s.commit)
  const stashSave = useRepoStore((s) => s.stashSave)
  const resolveConflict = useRepoStore((s) => s.resolveConflict)
  const unresolveConflict = useRepoStore((s) => s.unresolveConflict)
  const resolvedPaths = useRepoStore((s) => s.resolvedPaths)
  const openMergeTool = useRepoStore((s) => s.openMergeTool)
  const continueOperation = useRepoStore((s) => s.continueOperation)
  const abortOperation = useRepoStore((s) => s.abortOperation)
  const patchFile = useRepoStore((s) => s.patchFile)
  const ignoreFile = useRepoStore((s) => s.ignoreFile)
  const ignorePath = useRepoStore((s) => s.ignorePath)
  const stashFile = useRepoStore((s) => s.stashFile)
  const externalDiff = useRepoStore((s) => s.externalDiff)
  const copyFilePath = useRepoStore((s) => s.copyFilePath)
  const showInFolder = useRepoStore((s) => s.showInFolder)
  const openFile = useRepoStore((s) => s.openFile)
  const openInEditor = useRepoStore((s) => s.openInEditor)
  const trashFile = useRepoStore((s) => s.trashFile)
  const confirmDiscard = useRepoStore((s) => s.settings.confirmDiscard)
  const busyAction = useRepoStore((s) => s.busyAction)
  const ai = useRepoStore((s) => s.settings.ai)
  const aiStatus = useRepoStore((s) => s.aiStatus)
  const aiBusy = useRepoStore((s) => s.aiBusy)
  const generateCommitMessage = useRepoStore((s) => s.generateCommitMessage)
  const generateStashMessage = useRepoStore((s) => s.generateStashMessage)
  const aiResolveConflict = useRepoStore((s) => s.aiResolveConflict)
  const composeCommits = useRepoStore((s) => s.composeCommits)
  const openSettings = useRepoStore((s) => s.setSettingsOpen)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const [sign, setSign] = useState(false)
  // Paths ticked for a bulk discard via the top trash icon.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [view, setView] = useState<FileView>(loadView)
  const [unstagedOpen, setUnstagedOpen] = useState(true)
  const [stagedOpen, setStagedOpen] = useState(true)
  const changeView = (v: FileView): void => {
    setView(v)
    saveView(v)
  }

  // Index/working-tree ops report progress from main; show them where they happen
  // instead of only in the toolbar pill (staging a big tree isn't instant).
  const working = isWorkingAction(busyAction)
  const staging = busyAction === 'Stage'
  const unstaging = busyAction === 'Unstage'
  const committing = busyAction === 'Commit'

  const status = snapshot?.status
  const staged = status?.staged ?? []
  const allUnstaged = status?.unstaged ?? []
  const conflicts = allUnstaged.filter((f) => f.type === 'conflicted')
  const unstaged = allUnstaged.filter((f) => f.type !== 'conflicted')
  const isDirty = staged.length > 0 || allUnstaged.length > 0
  const operation = status?.operation ?? null
  // Only files this session actually resolved, and only while they are still
  // staged — an aborted operation or a later unstage drops them from the list.
  const resolved = operation ? resolvedPaths.filter((p) => staged.some((f) => f.path === p)) : []
  const signingConfigured = status?.signingConfigured ?? false

  // Default signing on when a key is configured; only re-fires if that changes.
  useEffect(() => {
    setSign(signingConfigured)
  }, [signingConfigured])

  const headCommit = snapshot?.commits.find((c) => c.refs.some((r) => r.startsWith('HEAD')))
  const canCommit = summary.trim().length > 0 && (amend || staged.length > 0)

  // Git message = subject line, then a blank line, then the optional body.
  const buildMessage = (): string => {
    const s = summary.trim()
    const d = description.trim()
    return d ? `${s}\n\n${d}` : s
  }

  const clearMessage = (): void => {
    setSummary('')
    setDescription('')
  }

  const toggleAmend = (): void => {
    const next = !amend
    setAmend(next)
    // Prefill the fields with HEAD's message (subject + body) when turning amend on.
    if (next && headCommit) {
      setSummary(headCommit.subject)
      setDescription(headCommit.body?.trim() ?? '')
    } else if (!next) {
      clearMessage()
    }
  }

  const doCommit = async (): Promise<void> => {
    if (!canCommit) return
    await commit({ message: buildMessage(), amend, sign: sign && signingConfigured })
    clearMessage()
    setAmend(false)
  }

  // AI: only offered once a provider key is stored; the diff never leaves main.
  const aiReady = ai.enabled && (aiStatus?.saved[ai.provider] ?? false)
  const generating = aiBusy === 'commitMessage'
  const naming = aiBusy === 'stashMessage'
  const composing = aiBusy === 'commitComposer'

  const doGenerate = async (): Promise<void> => {
    if (!aiReady || generating || staged.length === 0) return
    const msg = await generateCommitMessage()
    if (!msg) return
    setSummary(msg.summary)
    setDescription(msg.description)
  }

  // Fills the summary box, which doubles as the stash label — review, then Stash.
  const doNameStash = async (): Promise<void> => {
    if (!aiReady || naming || !isDirty) return
    const label = await generateStashMessage()
    if (label) setSummary(label)
  }

  const doStash = async (): Promise<void> => {
    if (!isDirty) return
    // Reuse the summary box as an optional stash label; include untracked files.
    await stashSave({ message: summary.trim() || undefined, includeUntracked: true })
    clearMessage()
  }

  // Only checkboxes on unstaged rows drive the bulk discard.
  const checkedFiles = unstaged.filter((f) => checked.has(f.path))
  const allChecked = unstaged.length > 0 && checkedFiles.length === unstaged.length

  const toggleChecked = (path: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleAll = (): void => {
    setChecked(allChecked ? new Set() : new Set(unstaged.map((f) => f.path)))
  }

  const discardChecked = async (): Promise<void> => {
    if (!checkedFiles.length) return
    const label =
      checkedFiles.length === 1
        ? `Discard changes in "${checkedFiles[0].path}"?`
        : `Discard changes in ${checkedFiles.length} files? This cannot be undone.`
    if (confirmDiscard && !window.confirm(label)) return
    await discard(checkedFiles)
    setChecked(new Set())
  }

  // GitKraken-style right-click menu shared by the unstaged and staged lists.
  const buildFileMenu = (file: FileStatus, isStaged: boolean): MenuItem[] => {
    const p = file.path
    const base = p.split('/').pop() ?? p
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const ignore: MenuItem = {
      label: 'Ignore',
      submenu: [
        { label: `Ignore "${base}"`, onClick: () => void ignorePath(file) },
        ...(ext
          ? [{ label: `Ignore all *${ext} files`, onClick: () => void ignoreFile(`*${ext}`) }]
          : [])
      ]
    }
    return [
      isStaged
        ? { label: 'Unstage', onClick: () => void unstage([p]) }
        : { label: 'Stage', onClick: () => void stage([p]) },
      ignore,
      ...(!isStaged ? [{ label: 'Stash file', onClick: () => void stashFile(p) }] : []),
      { separator: true },
      { label: 'Open in external diff tool', onClick: () => void externalDiff(p, isStaged) },
      { label: 'Open in VS Code', onClick: () => void openInEditor(p) },
      { label: 'Open file in default program', onClick: () => void openFile(p) },
      { label: 'Show in folder', onClick: () => void showInFolder(p) },
      { separator: true },
      { label: 'Copy file path', onClick: () => void copyFilePath(p) },
      { label: 'Create patch from file changes…', onClick: () => void patchFile(p, isStaged) },
      { separator: true },
      ...(!isStaged
        ? [
            {
              label: 'Discard changes',
              danger: true,
              onClick: () => {
                if (
                  !confirmDiscard ||
                  window.confirm(`Discard changes in "${p}"? This cannot be undone.`)
                )
                  void discard([file])
              }
            }
          ]
        : []),
      {
        label: 'Delete file',
        danger: true,
        onClick: () => {
          if (window.confirm(`Move "${p}" to the trash?`)) void trashFile(file)
        }
      }
    ]
  }

  const openFileMenu = (e: MouseEvent, file: FileStatus, isStaged: boolean): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, items: buildFileMenu(file, isStaged) })
  }

  return (
    <div className="flex flex-col h-full">
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {/* Top bar: what's pending and on which branch, the bulk-discard trash, and
          the Path/Tree switch for both lists. */}
      <div className="relative flex items-center gap-2 pl-3 pr-2 h-10 bg-base-800 border-b border-edge shrink-0">
        {working ? (
          <span className="flex items-center gap-1.5 text-[12px] text-accent truncate">
            <Spinner />
            {runningLabel(busyAction, 'Working…')}
          </span>
        ) : (
          <span className="min-w-0 flex items-center gap-1.5 text-[12.5px] text-txt truncate">
            <span className="font-semibold text-txt-bright tabular-nums">
              {checkedFiles.length > 0 ? checkedFiles.length : staged.length + allUnstaged.length}
            </span>
            <span className="text-txt-muted">
              {checkedFiles.length > 0
                ? 'selected'
                : `file change${staged.length + allUnstaged.length === 1 ? '' : 's'}`}
            </span>
            {status?.branch && checkedFiles.length === 0 && (
              <>
                <span className="text-txt-muted">on</span>
                <span className="inline-flex items-center gap-1 h-[20px] px-1.5 rounded-md bg-base-700 text-[11.5px] text-txt-bright truncate max-w-[160px]">
                  <BranchIcon className="text-[11px] text-txt-muted shrink-0" />
                  <span className="truncate">{status.branch}</span>
                </span>
              </>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {checkedFiles.length > 0 && (
            <button
              onClick={() => void discardChecked()}
              disabled={working}
              title={`Discard changes in ${checkedFiles.length} selected file(s)`}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-bad/40 text-bad text-[11.5px] hover:bg-bad/10 disabled:opacity-30"
            >
              <TrashIcon className="text-[12px]" />
              Discard
            </button>
          )}
          <span className="flex rounded-md border border-edge overflow-hidden">
            {(
              [
                ['path', ListIcon, 'Path view'],
                ['tree', TreeIcon, 'Tree view']
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                title={label}
                className={`inline-flex items-center justify-center w-7 h-6 text-[13px] ${
                  view === v
                    ? 'bg-accent/20 text-accent'
                    : 'text-txt-muted hover:text-txt hover:bg-white/[0.05]'
                }`}
              >
                <Icon />
              </button>
            ))}
          </span>
        </span>
        {/* Same indeterminate bar as the toolbar — git reports no percentage here either. */}
        {working && (
          <div className="absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden bg-accent/15">
            <div className="h-full w-full bg-accent kc-indeterminate" />
          </div>
        )}
      </div>

      {/* Conflict / in-progress operation banner */}
      {operation && (
        <div className="shrink-0 border-b border-bad/40 bg-bad/10 px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-txt-bright">
              {opLabel[operation]} — {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => void continueOperation()}
                disabled={conflicts.length > 0}
                title={
                  conflicts.length > 0 ? 'Resolve all conflicts first' : 'Continue the operation'
                }
                className="text-[11px] px-2 py-0.5 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
              <button
                onClick={() => void abortOperation()}
                title="Abort and restore the pre-operation state"
                className="text-[11px] px-2 py-0.5 rounded border border-edge text-txt hover:bg-base-600"
              >
                Abort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflicted files */}
      {conflicts.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-2 h-7 bg-base-800 border-b border-edge shrink-0">
            <span className="text-[11px] uppercase tracking-wide text-bad">
              Conflicted files ({conflicts.length})
            </span>
            <button
              onClick={() =>
                void resolveConflict(
                  conflicts.map((f) => f.path),
                  'mark'
                )
              }
              title="Stage every conflicted file as it currently stands in the working tree"
              className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-edge text-txt-muted hover:bg-base-600"
            >
              Mark all resolved
            </button>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '30%' }}>
            {conflicts.map((f) => (
              <ConflictRow
                key={`c-${f.path}`}
                file={f}
                selected={mode === 'working' && selectedPath === f.path && !selectedStaged}
                onSelect={() => void selectWorkingFile(f.path, false)}
                onMerge={() => void openMergeTool(f.path)}
                onResolve={(r) => void resolveConflict([f.path], r)}
                onAiResolve={
                  ai.enabled
                    ? () => (aiReady ? void aiResolveConflict(f.path) : openSettings(true, 'ai'))
                    : undefined
                }
                aiBusy={aiBusy === 'conflictResolution'}
              />
            ))}
          </div>
        </>
      )}

      {/* Conflicts already settled in this operation — kept visible so a wrong
          call can be taken back before the merge is committed. */}
      {resolved.length > 0 && (
        <>
          <div className="flex items-center px-2 h-7 bg-base-800 border-b border-edge shrink-0">
            <span className="text-[11px] uppercase tracking-wide text-good">
              Resolved files ({resolved.length})
            </span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '20%' }}>
            {resolved.map((p) => (
              <ResolvedRow
                key={`r-${p}`}
                path={p}
                selected={mode === 'working' && selectedPath === p && selectedStaged}
                onSelect={() => void selectWorkingFile(p, true)}
                onUndo={() => void unresolveConflict(p)}
              />
            ))}
          </div>
        </>
      )}

      {/* Unstaged + Staged share the remaining space; each open list keeps a floor height. */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Unstaged */}
        <ListHeader
          title="Unstaged"
          count={unstaged.length}
          open={unstagedOpen}
          onToggle={() => setUnstagedOpen((o) => !o)}
          lead={
            unstaged.length > 0 && (
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                title="Select all for discard"
                className="accent-accent w-3.5 h-3.5 ml-1"
              />
            )
          }
          action={
            unstaged.length > 0 && (
              <button
                onClick={() => void stage(unstaged.map((f) => f.path))}
                disabled={working}
                className={`${headerBtn} ${
                  staging
                    ? 'border-accent/50 text-accent'
                    : 'border-good/40 text-good hover:bg-good/10'
                }`}
              >
                {staging ? <Spinner size={10} /> : <PlusIcon className="text-[12px]" />}
                {staging ? 'Staging…' : 'Stage all'}
              </button>
            )
          }
        />
        {unstagedOpen && (
          <div className="overflow-auto flex-1 min-h-[110px] py-0.5">
            {unstaged.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[90px] text-[12px] text-txt-muted/60">
                No unstaged changes
              </div>
            ) : (
              <FileList
                files={unstaged}
                staged={false}
                view={view}
                isSelected={(f) => mode === 'working' && selectedPath === f.path && !selectedStaged}
                onSelect={(f) => void selectWorkingFile(f.path, false)}
                onAction={(paths) => void stage(paths)}
                onDiscard={(files) => {
                  const label =
                    files.length === 1
                      ? `Discard changes in "${files[0].path}"?`
                      : `Discard changes in ${files.length} files? This cannot be undone.`
                  if (!confirmDiscard || window.confirm(label)) void discard(files)
                }}
                onContext={(e, f) => openFileMenu(e, f, false)}
                checked={checked}
                onCheck={toggleChecked}
                disabled={working}
              />
            )}
          </div>
        )}

        {/* Staged */}
        <ListHeader
          title="Staged"
          count={staged.length}
          tone="good"
          open={stagedOpen}
          onToggle={() => setStagedOpen((o) => !o)}
          action={
            staged.length > 0 && (
              <button
                onClick={() => void unstage(staged.map((f) => f.path))}
                disabled={working}
                className={`${headerBtn} ${
                  unstaging
                    ? 'border-accent/50 text-accent'
                    : 'border-edge text-txt-muted hover:text-txt hover:bg-white/[0.05]'
                }`}
              >
                {unstaging ? <Spinner size={10} /> : <MinusIcon className="text-[12px]" />}
                {unstaging ? 'Unstaging…' : 'Unstage all'}
              </button>
            )
          }
        />
        {stagedOpen && (
          <div className="overflow-auto flex-1 min-h-[110px] py-0.5">
            {staged.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 h-full min-h-[90px] text-[12px] text-txt-muted/60">
                No staged changes
                {unstaged.length > 0 && (
                  <span className="text-[11px] text-txt-muted/50">
                    Use + on a file, or Stage all
                  </span>
                )}
              </div>
            ) : (
              <FileList
                files={staged}
                staged={true}
                view={view}
                isSelected={(f) => mode === 'working' && selectedPath === f.path && selectedStaged}
                onSelect={(f) => void selectWorkingFile(f.path, true)}
                onAction={(paths) => void unstage(paths)}
                onContext={(e, f) => openFileMenu(e, f, true)}
                disabled={working}
              />
            )}
          </div>
        )}
        {/* Both lists folded: keep the commit box at the bottom. */}
        {!unstagedOpen && !stagedOpen && <div className="flex-1" />}
      </div>

      {/* Commit message: one-line summary + optional multi-line description */}
      <div className="border-t border-edge px-3 pt-2.5 pb-3 shrink-0 bg-base-800">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
            {amend ? 'Amend commit' : 'Commit'}
          </span>
          {ai.enabled && (
            <span className="ml-auto flex gap-1.5">
              <button
                onClick={() => (aiReady ? void composeCommits() : openSettings(true, 'ai'))}
                disabled={aiBusy !== null || (aiReady && !isDirty)}
                title={
                  !aiReady
                    ? 'Add a provider API key in Settings → AI first'
                    : !isDirty
                      ? 'Nothing to split up yet'
                      : 'Split everything uncommitted into several coherent commits'
                }
                className={`${headerBtn} border-edge text-txt-muted hover:text-accent hover:border-accent/50`}
              >
                {composing ? <Spinner /> : <SparkleIcon />}
                {composing ? 'Composing…' : 'Compose'}
              </button>
              <button
                onClick={() => (aiReady ? void doGenerate() : openSettings(true, 'ai'))}
                disabled={aiBusy !== null || (aiReady && staged.length === 0)}
                title={
                  !aiReady
                    ? 'Add a provider API key in Settings → AI first'
                    : staged.length === 0
                      ? 'Stage the changes you want described'
                      : 'Write the summary and description from the staged diff'
                }
                className={`${headerBtn} border-edge text-txt-muted hover:text-accent hover:border-accent/50`}
              >
                {generating ? <Spinner /> : <SparkleIcon />}
                {generating ? 'Generating…' : 'Generate message'}
              </button>
            </span>
          )}
        </div>
        <div className="relative rounded-lg border border-edge bg-base-900 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 overflow-hidden">
          {/* Something is actually happening — say so, and lock the fields. */}
          {(generating || naming) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-base-900/80 backdrop-blur-[1px]">
              <Spinner size={16} />
              <span className="text-[11px] text-txt-muted">
                {generating ? 'Writing the commit message…' : 'Naming the stash…'}
              </span>
            </div>
          )}
          <div className="relative border-b border-edge">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd+Enter commits from either field (no accidental plain-Enter commit).
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  void doCommit()
                }
              }}
              placeholder="Summary (required)"
              className="w-full bg-transparent pl-2.5 pr-10 py-2 text-[12.5px] text-txt-bright outline-none select-text placeholder:text-txt-muted/60"
            />
            {/* Git's convention: keep the subject line within 72 characters. */}
            {summary.length > 0 && (
              <span
                title="Keep the summary within 72 characters"
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] tabular-nums ${
                  summary.length > 72 ? 'text-warn' : 'text-txt-muted/60'
                }`}
              >
                {72 - summary.length}
              </span>
            )}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void doCommit()
              }
            }}
            placeholder="Description"
            rows={3}
            className="w-full resize-none bg-transparent px-2.5 py-2 text-[12.5px] text-txt outline-none select-text placeholder:text-txt-muted/60"
          />
        </div>
        <div className="mt-2.5 flex items-center gap-4">
          <label
            className={`flex items-center gap-1.5 text-[11.5px] select-none w-fit ${
              headCommit
                ? 'text-txt-muted cursor-pointer hover:text-txt'
                : 'text-txt-muted/40 cursor-not-allowed'
            }`}
            title={
              headCommit
                ? 'Replace the last commit (edits its message and folds in staged changes)'
                : 'No commit to amend yet'
            }
          >
            <input
              type="checkbox"
              checked={amend}
              disabled={!headCommit}
              onChange={toggleAmend}
              className="accent-accent w-3.5 h-3.5"
            />
            Amend last commit
          </label>
          {signingConfigured && (
            <label
              className="flex items-center gap-1.5 text-[11.5px] text-txt-muted cursor-pointer select-none w-fit hover:text-txt"
              title="Sign this commit with your configured GPG/SSH key (git commit -S)"
            >
              <input
                type="checkbox"
                checked={sign}
                onChange={() => setSign((v) => !v)}
                className="accent-accent w-3.5 h-3.5"
              />
              Sign
            </label>
          )}
          <span className="ml-auto text-[10.5px] text-txt-muted/50">Ctrl+Enter to commit</span>
        </div>
        <div className="mt-2.5 flex gap-2">
          <div className="flex">
            <button
              onClick={() => void doStash()}
              disabled={!isDirty || working}
              title="Stash all changes (includes untracked) — the summary becomes its label"
              className={`inline-flex items-center gap-1.5 h-8 px-3 border border-edge bg-base-700/60 text-[12px] text-txt hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed ${
                ai.enabled ? 'rounded-l-md border-r-0' : 'rounded-md'
              }`}
            >
              <StashIcon className="text-[13px] text-txt-muted" />
              Stash
            </button>
            {ai.enabled && (
              <button
                onClick={() => (aiReady ? void doNameStash() : openSettings(true, 'ai'))}
                disabled={aiBusy !== null || (aiReady && !isDirty)}
                title={
                  aiReady
                    ? 'Name this stash from the uncommitted changes'
                    : 'Add a provider API key in Settings → AI first'
                }
                className="inline-flex items-center h-8 px-2 rounded-r-md border border-edge bg-base-700/60 text-txt-muted hover:text-accent hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {naming ? <Spinner /> : <SparkleIcon />}
              </button>
            )}
          </div>
          <button
            onClick={() => void doCommit()}
            disabled={!canCommit || working}
            title={
              canCommit
                ? undefined
                : staged.length === 0 && !amend
                  ? 'Stage some changes first'
                  : 'Write a summary first'
            }
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md bg-accent text-white text-[12.5px] font-medium shadow-sm hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {committing && <Spinner />}
            {committing
              ? 'Committing…'
              : amend
                ? 'Amend last commit'
                : staged.length
                  ? `Commit ${staged.length} file${staged.length === 1 ? '' : 's'}`
                  : 'Commit'}
          </button>
        </div>
      </div>
    </div>
  )
}
