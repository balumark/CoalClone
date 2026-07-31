import { useEffect, useRef, useState } from 'react'
import type { PullMode } from '@shared/types'
import { useRepoStore } from '@renderer/store/useRepoStore'
import { isRemoteAction, runningLabel } from '@renderer/lib/format'

// Top toolbar: repo name/branch, fetch/pull/push (with ahead/behind counts),
// and open/close actions.

const PULL_MODES: { mode: PullMode; label: string }[] = [
  { mode: 'ff', label: 'Pull (fast-forward if possible)' },
  { mode: 'ff-only', label: 'Pull (fast-forward only)' },
  { mode: 'rebase', label: 'Pull (rebase)' }
]

function Spinner({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg className="animate-spin shrink-0" width={size} height={size} viewBox="0 0 50 50" aria-hidden>
      <circle cx="25" cy="25" r="20" fill="none" strokeWidth="6" className="stroke-base-600" opacity="0.4" />
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

function ToolButton({
  label,
  badge,
  onClick,
  disabled,
  running,
  runningLabel
}: {
  label: string
  badge?: number
  onClick: () => void
  disabled?: boolean
  /** This button's own operation is in flight — show the spinner here. */
  running?: boolean
  runningLabel?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center gap-1.5 px-3 h-8 rounded text-[12px] hover:bg-base-600 disabled:opacity-40 ${
        running ? 'bg-accent/15 text-accent !opacity-100' : 'text-txt'
      }`}
    >
      {running && <Spinner />}
      {running ? (runningLabel ?? label) : label}
      {!running && badge !== undefined && badge > 0 && (
        <span className="ml-0.5 px-1 rounded-full bg-accent/25 text-accent text-[10px]">
          {badge}
        </span>
      )}
    </button>
  )
}

// Split button: the main half runs the saved default pull mode; the caret opens
// a menu to fetch-all or pick (and persist) which pull mode is the default.
function PullButton(): JSX.Element {
  const behind = useRepoStore((s) => s.snapshot?.status.behind)
  const busy = useRepoStore((s) => s.busy)
  const busyAction = useRepoStore((s) => s.busyAction)
  const pullMode = useRepoStore((s) => s.settings.pullMode)
  const pull = useRepoStore((s) => s.pull)
  const fetch = useRepoStore((s) => s.fetch)
  const updateSettings = useRepoStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (mode: PullMode): void => {
    setOpen(false)
    if (mode !== pullMode) void updateSettings({ pullMode: mode })
    void pull({ mode })
  }

  // Fetch runs from this button's own menu, so it lights up for either action.
  const running = busyAction === 'Pull' || busyAction === 'Fetch'

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => void pull()}
        disabled={!!busy}
        className={`relative flex items-center gap-1.5 pl-3 pr-2 h-8 rounded-l text-[12px] hover:bg-base-600 disabled:opacity-40 ${
          running ? 'bg-accent/15 text-accent !opacity-100' : 'text-txt'
        }`}
      >
        {running && <Spinner />}
        {running ? runningLabel(busyAction, 'Working…') : 'Pull'}
        {!running && behind !== undefined && behind > 0 && (
          <span className="ml-0.5 px-1 rounded-full bg-accent/25 text-accent text-[10px]">
            {behind}
          </span>
        )}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!busy}
        title="Pull options"
        className="flex items-center justify-center w-5 h-8 rounded-r text-txt-muted hover:bg-base-600 hover:text-txt disabled:opacity-40"
      >
        <svg viewBox="0 0 10 6" width="9" height="6" fill="currentColor" aria-hidden>
          <path d="M0 0h10L5 6z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[240px] rounded border border-edge bg-base-800 py-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false)
              void fetch()
            }}
            className="block w-full text-left px-3 py-1.5 text-[12px] text-txt hover:bg-base-600"
          >
            Fetch All
          </button>
          <div className="my-1 h-px bg-edge/70" />
          {PULL_MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => choose(m.mode)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-txt hover:bg-base-600"
            >
              <span
                className={`flex items-center justify-center w-3.5 h-3.5 rounded-full border ${
                  pullMode === m.mode ? 'border-accent' : 'border-txt-muted'
                }`}
              >
                {pullMode === m.mode && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Toolbar(): JSX.Element {
  const ref = useRepoStore((s) => s.ref)
  const snapshot = useRepoStore((s) => s.snapshot)
  const busy = useRepoStore((s) => s.busy)
  const busyAction = useRepoStore((s) => s.busyAction)
  const fetch = useRepoStore((s) => s.fetch)
  const push = useRepoStore((s) => s.push)
  const openDialog = useRepoStore((s) => s.openDialog)
  const closeRepo = useRepoStore((s) => s.closeRepo)
  const setSettingsOpen = useRepoStore((s) => s.setSettingsOpen)

  const status = snapshot?.status
  // Talking to a remote can take a while and gives no percentage — show a bar.
  const remoteBusy = isRemoteAction(busyAction)

  return (
    <div className="relative flex items-center h-10 px-2 bg-base-800 border-b border-edge shrink-0 gap-1">
      <div className="flex items-center gap-2 px-2 min-w-0">
        <span className="font-medium text-txt-bright truncate max-w-[220px]">{ref?.name}</span>
        {status?.branch && (
          <span className="px-1.5 py-0.5 rounded bg-base-600 text-[11px] text-txt truncate max-w-[160px]">
            ⑂ {status.branch}
          </span>
        )}
      </div>

      <div className="w-px h-5 bg-edge mx-1" />

      <ToolButton
        label="Fetch"
        onClick={() => void fetch()}
        disabled={!!busy}
        running={busyAction === 'Fetch'}
        runningLabel={runningLabel('Fetch', 'Fetch')}
      />
      <PullButton />
      <ToolButton
        label="Push"
        badge={status?.ahead}
        onClick={() => void push()}
        disabled={!!busy}
        running={busyAction === 'Push'}
        runningLabel={runningLabel('Push', 'Push')}
      />

      <div className="flex-1" />

      {busy && !remoteBusy && <span className="text-[11px] text-txt-muted mr-2">{busy}</span>}

      {/* Indeterminate bar along the toolbar's bottom edge while a remote op runs. */}
      {remoteBusy && (
        <div className="absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden bg-accent/15">
          <div className="h-full w-full bg-accent kc-indeterminate" />
        </div>
      )}
      <ToolButton label="Open" onClick={() => void openDialog()} />
      <ToolButton label="Close" onClick={() => void closeRepo()} />
      <button
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        className="flex items-center justify-center w-8 h-8 rounded text-txt-muted hover:bg-base-600 hover:text-txt"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden>
          <path d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM6 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />
          <path d="M6.68.184a1.75 1.75 0 0 1 2.64 0l.32.37c.18.208.44.32.714.308l.49-.021a1.75 1.75 0 0 1 1.867 1.867l-.021.49a.81.81 0 0 0 .308.713l.37.32a1.75 1.75 0 0 1 0 2.641l-.37.32a.81.81 0 0 0-.308.713l.021.49a1.75 1.75 0 0 1-1.867 1.868l-.49-.022a.81.81 0 0 0-.713.308l-.32.37a1.75 1.75 0 0 1-2.641 0l-.32-.37a.81.81 0 0 0-.714-.308l-.49.022a1.75 1.75 0 0 1-1.867-1.868l.021-.49a.81.81 0 0 0-.308-.713l-.37-.32a1.75 1.75 0 0 1 0-2.64l.37-.32a.81.81 0 0 0 .308-.714l-.021-.49A1.75 1.75 0 0 1 3.816.84l.49.022a.81.81 0 0 0 .714-.308ZM8 1.02a.25.25 0 0 0-.188.086l-.32.37a2.31 2.31 0 0 1-2.032.876l-.49-.021a.25.25 0 0 0-.267.267l.022.49a2.31 2.31 0 0 1-.877 2.031l-.37.32a.25.25 0 0 0 0 .378l.37.32c.62.536.943 1.339.877 2.031l-.022.49a.25.25 0 0 0 .267.268l.49-.022a2.31 2.31 0 0 1 2.031.877l.32.37a.25.25 0 0 0 .378 0l.32-.37a2.31 2.31 0 0 1 2.032-.877l.49.022a.25.25 0 0 0 .267-.267l-.022-.49a2.31 2.31 0 0 1 .877-2.032l.37-.32a.25.25 0 0 0 0-.378l-.37-.32a2.31 2.31 0 0 1-.877-2.031l.022-.49a.25.25 0 0 0-.267-.268l-.49.022a2.31 2.31 0 0 1-2.032-.877l-.32-.37A.25.25 0 0 0 8 1.02Z" />
        </svg>
      </button>
    </div>
  )
}
