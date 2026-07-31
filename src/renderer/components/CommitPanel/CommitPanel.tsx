import { useEffect, useState, type MouseEvent } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import ContextMenu, {
  type MenuItem,
  type MenuState
} from '@renderer/components/ContextMenu/ContextMenu'
import { isWorkingAction, runningLabel } from '@renderer/lib/format'
import type { ConflictResolution, FileStatus, GitOperation } from '@shared/types'

const opLabel: Record<GitOperation, string> = {
  merge: 'Merging',
  rebase: 'Rebasing',
  'cherry-pick': 'Cherry-picking',
  revert: 'Reverting'
}

function TrashIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M6.5 1a1 1 0 0 0-1 1v.5H3a.75.75 0 0 0 0 1.5h.28l.6 8.4A1.75 1.75 0 0 0 5.63 16h4.74a1.75 1.75 0 0 0 1.75-1.6l.6-8.4H13a.75.75 0 0 0 0-1.5h-2.5V2a1 1 0 0 0-1-1h-3ZM9 2.5H7V2h2v.5Zm-2.75 3.25a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5a.75.75 0 0 1 .75-.75Zm4 0a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5a.75.75 0 0 1 .75-.75Z" />
    </svg>
  )
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

const typeInfo: Record<FileStatus['type'], { glyph: string; color: string }> = {
  modified: { glyph: 'M', color: 'text-warn' },
  added: { glyph: 'A', color: 'text-good' },
  deleted: { glyph: 'D', color: 'text-bad' },
  renamed: { glyph: 'R', color: 'text-accent' },
  copied: { glyph: 'C', color: 'text-accent' },
  untracked: { glyph: 'U', color: 'text-good' },
  conflicted: { glyph: '!', color: 'text-bad' },
  unknown: { glyph: '?', color: 'text-txt-muted' }
}

function FileRow({
  file,
  selected,
  onSelect,
  actionLabel,
  onAction,
  onDiscard,
  onContext,
  checked,
  onCheck,
  disabled
}: {
  file: FileStatus
  selected: boolean
  onSelect: () => void
  actionLabel: string
  onAction: () => void
  onDiscard?: () => void
  onContext?: (e: MouseEvent) => void
  checked?: boolean
  onCheck?: () => void
  /** An index op is already running — don't queue a second one on top of it. */
  disabled?: boolean
}): JSX.Element {
  const info = typeInfo[file.type]
  return (
    <div
      className={`group flex items-center px-2 py-1 gap-2 cursor-pointer ${
        selected ? 'bg-accent/15' : 'hover:bg-base-700'
      }`}
      onClick={onSelect}
      onContextMenu={onContext}
    >
      {onCheck && (
        <input
          type="checkbox"
          checked={!!checked}
          onClick={(e) => e.stopPropagation()}
          onChange={onCheck}
          title="Select for discard"
          className="accent-accent shrink-0"
        />
      )}
      <span className={`font-mono text-[11px] w-3 shrink-0 ${info.color}`}>{info.glyph}</span>
      <span className="truncate font-mono text-[12px] flex-1">{file.path}</span>
      {file.reserved && (
        <span
          className="shrink-0 text-warn text-[11px]"
          title={`"${file.path}" is a reserved Windows device name — git can't create it on this machine, so it stays "deleted". Stage this deletion and commit it (or rename the file from Linux/macOS) to get rid of it.`}
        >
          ⚠
        </span>
      )}
      {onDiscard && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDiscard()
          }}
          disabled={disabled}
          className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded text-bad hover:bg-bad/15 disabled:opacity-0"
          title="Discard changes"
        >
          ⨯
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onAction()
        }}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 rounded border border-edge text-txt-muted hover:bg-base-600 disabled:!opacity-30 disabled:cursor-not-allowed"
      >
        {actionLabel}
      </button>
    </div>
  )
}

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
      {/* Top bar: bulk-discard trash + summary of pending changes */}
      <div className="relative flex items-center gap-2 px-2 h-9 bg-base-800 border-b border-edge shrink-0">
        <button
          onClick={() => void discardChecked()}
          disabled={checkedFiles.length === 0 || working}
          title={
            checkedFiles.length
              ? `Discard changes in ${checkedFiles.length} selected file(s)`
              : 'Tick files below, then discard their changes'
          }
          className="flex items-center justify-center w-7 h-7 rounded border border-edge text-bad hover:bg-bad/15 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <TrashIcon />
        </button>
        {working ? (
          <span className="flex items-center gap-1.5 text-[12px] text-accent truncate">
            <Spinner />
            {runningLabel(busyAction, 'Working…')}
          </span>
        ) : (
          <span className="text-[12px] text-txt-muted truncate">
            {checkedFiles.length > 0
              ? `${checkedFiles.length} selected`
              : `${staged.length + allUnstaged.length} change${
                  staged.length + allUnstaged.length === 1 ? '' : 's'
                }`}
          </span>
        )}
        {status?.branch && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-base-600 text-[11px] text-txt truncate max-w-[150px]">
            ⑂ {status.branch}
          </span>
        )}
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

      {/* Unstaged + Staged share the remaining space; each list keeps a floor height. */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Unstaged */}
        <div className="flex items-center gap-2 px-2 h-7 bg-base-800 border-b border-edge shrink-0">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            disabled={unstaged.length === 0}
            title="Select all for discard"
            className="accent-accent disabled:opacity-30"
          />
          <span className="text-[11px] uppercase tracking-wide text-txt-muted">
            Unstaged ({unstaged.length})
          </span>
          {unstaged.length > 0 && (
            <button
              onClick={() => void stage(unstaged.map((f) => f.path))}
              disabled={working}
              className={`ml-auto flex items-center gap-1 text-[10px] px-1.5 rounded border border-edge hover:bg-base-600 disabled:cursor-not-allowed ${
                staging ? 'border-accent/50 text-accent' : 'text-txt-muted disabled:opacity-40'
              }`}
            >
              {staging && <Spinner size={10} />}
              {staging ? 'Staging…' : 'Stage all'}
            </button>
          )}
        </div>
        <div className="overflow-auto flex-1 min-h-[120px]">
          {unstaged.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-txt-muted/60 italic">
              No unstaged changes
            </div>
          ) : (
            unstaged.map((f) => (
              <FileRow
                key={`u-${f.path}`}
                file={f}
                selected={mode === 'working' && selectedPath === f.path && !selectedStaged}
                onSelect={() => void selectWorkingFile(f.path, false)}
                actionLabel="Stage"
                onAction={() => void stage([f.path])}
                onDiscard={() => {
                  if (!confirmDiscard || window.confirm(`Discard changes in "${f.path}"?`))
                    void discard([f])
                }}
                onContext={(e) => openFileMenu(e, f, false)}
                checked={checked.has(f.path)}
                onCheck={() => toggleChecked(f.path)}
                disabled={working}
              />
            ))
          )}
        </div>

        {/* Staged */}
        <div className="flex items-center justify-between px-2 h-7 bg-base-800 border-y border-edge shrink-0">
          <span className="text-[11px] uppercase tracking-wide text-txt-muted">
            Staged ({staged.length})
          </span>
          {staged.length > 0 && (
            <button
              onClick={() => void unstage(staged.map((f) => f.path))}
              disabled={working}
              className={`flex items-center gap-1 text-[10px] px-1.5 rounded border border-edge hover:bg-base-600 disabled:cursor-not-allowed ${
                unstaging ? 'border-accent/50 text-accent' : 'text-txt-muted disabled:opacity-40'
              }`}
            >
              {unstaging && <Spinner size={10} />}
              {unstaging ? 'Unstaging…' : 'Unstage all'}
            </button>
          )}
        </div>
        <div className="overflow-auto flex-1 min-h-[120px]">
          {staged.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-txt-muted/60 italic">No staged changes</div>
          ) : (
            staged.map((f) => (
              <FileRow
                key={`s-${f.path}`}
                file={f}
                selected={mode === 'working' && selectedPath === f.path && selectedStaged}
                onSelect={() => void selectWorkingFile(f.path, true)}
                actionLabel="Unstage"
                onAction={() => void unstage([f.path])}
                onContext={(e) => openFileMenu(e, f, true)}
                disabled={working}
              />
            ))
          )}
        </div>
      </div>

      {/* Commit message: one-line summary + optional multi-line description */}
      <div className="border-t border-edge p-2 shrink-0 bg-base-800">
        {ai.enabled && (
          <div className="flex justify-end gap-1.5 mb-1">
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
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-edge text-txt-muted hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {composing ? <Spinner /> : <SparkleIcon />}
              {composing ? 'Composing…' : 'Compose commits'}
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
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-edge text-txt-muted hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? <Spinner /> : <SparkleIcon />}
              {generating ? 'Generating…' : 'Generate message'}
            </button>
          </div>
        )}
        <div className="relative rounded border border-edge bg-base-900 focus-within:border-accent overflow-hidden">
          {/* Something is actually happening — say so, and lock the fields. */}
          {(generating || naming) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-base-900/80 backdrop-blur-[1px]">
              <Spinner size={16} />
              <span className="text-[11px] text-txt-muted">
                {generating ? 'Writing the commit message…' : 'Naming the stash…'}
              </span>
            </div>
          )}
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
            placeholder="Commit summary"
            className="w-full bg-transparent px-2 py-1.5 text-[12px] text-txt outline-none select-text border-b border-edge"
          />
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
            className="w-full resize-none bg-transparent px-2 py-1.5 text-[12px] text-txt outline-none select-text"
          />
        </div>
        <div className="mt-2 flex items-center gap-4">
          <label
            className={`flex items-center gap-1.5 text-[11px] select-none w-fit ${
              headCommit ? 'text-txt-muted cursor-pointer' : 'text-txt-muted/40 cursor-not-allowed'
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
              className="accent-accent"
            />
            Amend last commit
          </label>
          {signingConfigured && (
            <label
              className="flex items-center gap-1.5 text-[11px] text-txt-muted cursor-pointer select-none w-fit"
              title="Sign this commit with your configured GPG/SSH key (git commit -S)"
            >
              <input
                type="checkbox"
                checked={sign}
                onChange={() => setSign((v) => !v)}
                className="accent-accent"
              />
              Sign
            </label>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <div className="flex">
            <button
              onClick={() => void doStash()}
              disabled={!isDirty || working}
              title="Stash all changes (includes untracked)"
              className={`py-1.5 px-3 border border-edge text-[12px] text-txt hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed ${
                ai.enabled ? 'rounded-l border-r-0' : 'rounded'
              }`}
            >
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
                className="py-1.5 px-2 rounded-r border border-edge text-txt-muted hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {naming ? <Spinner /> : <SparkleIcon />}
              </button>
            )}
          </div>
          <button
            onClick={() => void doCommit()}
            disabled={!canCommit || working}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-accent text-white text-[12px] font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {committing && <Spinner />}
            {committing
              ? 'Committing…'
              : amend
                ? 'Amend'
                : `Commit ${staged.length ? `(${staged.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
