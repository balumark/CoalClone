import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'

// In-app text prompt. Electron's window.prompt() throws ("is and will not be
// supported"), so every "enter a name" flow (new branch, rename, tag, …) goes
// through the store's askInput() which drives this modal. Enter submits, Escape
// or a backdrop/Cancel click dismisses (resolving null).
//
// askConfirm() reuses it in `confirm` mode: same shell, no text field, and OK
// resolves a fixed non-null value (window.confirm() is unusable here too).

export default function PromptDialog(): JSX.Element | null {
  const req = useRepoStore((s) => s.promptReq)
  const resolve = useRepoStore((s) => s.resolvePrompt)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!req) return undefined
    setValue(req.initial ?? '')
    // Select after the input mounts so typing replaces any prefilled text.
    const t = setTimeout(() => inputRef.current?.select(), 0)
    return () => clearTimeout(t)
  }, [req])

  if (!req) return null

  const submit = (): void => {
    if (req.confirm) resolve('confirmed')
    else if (value.trim()) resolve(value.trim())
  }
  const cancel = (): void => resolve(null)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onMouseDown={cancel}
    >
      <div
        className={`rounded-lg border border-edge bg-base-800 p-4 shadow-xl ${
          req.confirm ? 'w-[420px]' : 'w-[360px]'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={req.confirm ? onKey : undefined}
      >
        <div className="text-[13px] text-txt-bright mb-2">{req.title}</div>
        {req.message && (
          <div className="text-[12px] text-txt-muted whitespace-pre-wrap break-words mb-3 select-text">
            {req.message}
          </div>
        )}
        {!req.confirm && (
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.placeholder}
            onKeyDown={onKey}
            className="w-full rounded bg-base-900 border border-edge px-2 py-1.5 text-[13px] text-txt outline-none focus:border-accent select-text"
          />
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={cancel}
            className="px-3 py-1 rounded text-[12px] text-txt-muted hover:bg-base-700"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            autoFocus={req.confirm}
            disabled={!req.confirm && !value.trim()}
            className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {req.okLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
