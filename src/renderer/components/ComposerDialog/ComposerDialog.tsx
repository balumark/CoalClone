import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import type { AiComposerCommit } from '@shared/types'

// Commit Composer: the AI's proposal for splitting the whole dirty working tree
// into several coherent commits. Every summary is editable and any group can be
// dropped before the plan runs; applying it re-stages each group in turn (see
// gitService.commitGroups), so whatever was staged by hand gets regrouped.

export default function ComposerDialog(): JSX.Element | null {
  const plan = useRepoStore((s) => s.composerPlan)
  const close = useRepoStore((s) => s.closeComposer)
  const apply = useRepoStore((s) => s.applyComposerPlan)
  const busy = useRepoStore((s) => s.busy)
  const [commits, setCommits] = useState<AiComposerCommit[]>([])

  useEffect(() => setCommits(plan?.commits ?? []), [plan])

  if (!plan) return null

  const patch = (i: number, part: Partial<AiComposerCommit>): void =>
    setCommits(commits.map((c, n) => (n === i ? { ...c, ...part } : c)))
  const drop = (i: number): void => setCommits(commits.filter((_, n) => n !== i))

  const usable = commits.filter((c) => c.summary.trim() && c.files.length)
  const droppedFiles = plan.commits
    .flatMap((c) => c.files)
    .filter((f) => !usable.some((c) => c.files.includes(f)))

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="w-[620px] max-h-[80vh] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge">
          <div className="text-[13px] text-txt-bright font-medium">
            Compose commits ({usable.length})
          </div>
          <div className="text-[11px] text-txt-muted mt-0.5">
            Applied top to bottom. Each group is staged on its own, so anything you had staged by
            hand is regrouped.
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
          {commits.map((c, i) => (
            <div key={i} className="rounded border border-edge bg-base-900 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-txt-muted w-4 shrink-0">{i + 1}.</span>
                <input
                  value={c.summary}
                  onChange={(e) => patch(i, { summary: e.target.value })}
                  className="flex-1 bg-transparent border-b border-edge text-[12px] text-txt outline-none focus:border-accent py-0.5"
                />
                <button
                  onClick={() => drop(i)}
                  title="Leave these changes uncommitted"
                  className="text-[10px] px-1.5 rounded border border-edge text-bad hover:bg-bad/15"
                >
                  Drop
                </button>
              </div>
              {c.description && (
                <div className="mt-1 pl-6 text-[11px] text-txt-muted whitespace-pre-wrap">
                  {c.description}
                </div>
              )}
              <div className="mt-1 pl-6 flex flex-col">
                {c.files.map((f) => (
                  <span key={f} className="font-mono text-[11px] text-txt-muted truncate">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {(plan.leftover.length > 0 || droppedFiles.length > 0) && (
            <div className="rounded border border-warn/40 bg-warn/10 p-2">
              <div className="text-[11px] text-txt">
                Staying uncommitted ({plan.leftover.length + droppedFiles.length}):
              </div>
              {[...plan.leftover, ...droppedFiles].map((f) => (
                <div key={f} className="font-mono text-[11px] text-txt-muted truncate">
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-edge flex justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1 rounded border border-edge text-[12px] text-txt hover:bg-base-600"
          >
            Cancel
          </button>
          <button
            onClick={() => void apply(usable)}
            disabled={!usable.length || busy !== null}
            className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create {usable.length} commit{usable.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
