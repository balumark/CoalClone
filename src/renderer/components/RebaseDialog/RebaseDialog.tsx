import { useRepoStore } from '@renderer/store/useRepoStore'
import type { RebaseAction } from '@shared/types'

// Interactive-rebase editor. Lists the commits oldest-first; each row picks an
// action (pick/squash/fixup/drop) and can be reordered with ▲/▼. On start the
// plan is fed to git via GIT_SEQUENCE_EDITOR (see gitService.rebaseInteractive).

const ACTIONS: RebaseAction[] = ['pick', 'squash', 'fixup', 'drop']
const actionHint: Record<RebaseAction, string> = {
  pick: 'Keep this commit',
  squash: 'Merge into the previous commit (combine messages)',
  fixup: 'Merge into the previous commit (discard this message)',
  drop: 'Remove this commit'
}

export default function RebaseDialog(): JSX.Element | null {
  const plan = useRepoStore((s) => s.rebasePlan)
  const setItems = useRepoStore((s) => s.setRebasePlanItems)
  const cancel = useRepoStore((s) => s.cancelRebasePlan)
  const run = useRepoStore((s) => s.runInteractiveRebase)

  if (!plan) return null
  const items = plan.items

  // The first commit git keeps (not dropped) must be a 'pick'.
  const firstKept = items.find((i) => i.action !== 'drop')
  const valid = !firstKept || firstKept.action === 'pick'

  const move = (i: number, dir: -1 | 1): void => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    const a = next[i]
    next[i] = next[j]
    next[j] = a
    setItems(next)
  }
  const setAction = (i: number, action: RebaseAction): void => {
    const next = items.slice()
    next[i] = { ...next[i], action }
    setItems(next)
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50"
      onMouseDown={cancel}
    >
      <div
        className="w-[560px] max-h-[80vh] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge">
          <div className="text-[13px] text-txt-bright font-medium">
            Interactive rebase ({items.length})
          </div>
          <div className="text-[11px] text-txt-muted mt-0.5">
            Oldest at top. The first kept commit must be “pick”. Reword isn’t available here — use
            Amend for the latest commit.
          </div>
        </div>

        <div className="overflow-auto flex-1 p-2">
          {items.map((it, i) => (
            <div
              key={it.hash}
              className={`flex items-center gap-2 px-2 py-1 rounded hover:bg-base-700 ${
                it.action === 'drop' ? 'opacity-50' : ''
              }`}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-[9px] leading-none text-txt-muted hover:text-txt disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  className="text-[9px] leading-none text-txt-muted hover:text-txt disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <select
                value={it.action}
                onChange={(e) => setAction(i, e.target.value as RebaseAction)}
                title={actionHint[it.action]}
                className="bg-base-900 border border-edge rounded text-[11px] px-1 py-0.5 text-txt outline-none focus:border-accent"
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <span className="font-mono text-[11px] text-txt-muted w-14 shrink-0">
                {it.hash.slice(0, 7)}
              </span>
              <span
                className={`truncate text-[12px] flex-1 ${
                  it.action === 'drop' ? 'line-through text-txt-muted' : 'text-txt'
                }`}
              >
                {it.subject}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-edge flex items-center justify-between gap-2">
          <span className="text-[11px] text-bad">
            {valid ? '' : 'The first kept commit must be “pick”.'}
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={cancel}
              className="px-3 py-1 rounded text-[12px] text-txt-muted hover:bg-base-700"
            >
              Cancel
            </button>
            <button
              onClick={() => void run()}
              disabled={!valid}
              className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start rebase
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
