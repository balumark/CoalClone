import { useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'

// Pull-request draft: pick what the branch is compared against, let the model
// write the title + markdown body from the commits and diff, then copy it into
// whatever forge you use (the app has no forge integration of its own).

function Spinner(): JSX.Element {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 50 50" aria-hidden>
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

export default function PullRequestDialog(): JSX.Element | null {
  const draft = useRepoStore((s) => s.prDraft)
  const close = useRepoStore((s) => s.closePullRequest)
  const generate = useRepoStore((s) => s.generatePullRequest)
  const snapshot = useRepoStore((s) => s.snapshot)
  const aiBusy = useRepoStore((s) => s.aiBusy)
  const copyText = useRepoStore((s) => s.copyText)
  const [base, setBase] = useState(draft.base)

  if (!draft.open) return null

  const current = snapshot?.status.branch ?? 'HEAD'
  const candidates = (snapshot?.branches ?? [])
    .map((b) => (b.isRemote ? b.name.replace(/^remotes\//, '') : b.name))
    .filter((n) => n !== current)
  const options = [...new Set(candidates)]
  const busy = aiBusy === 'pullRequest'
  const result = draft.result

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
          <div className="text-[13px] text-txt-bright font-medium">Pull request description</div>
          <div className="text-[11px] text-txt-muted mt-0.5">
            Written from what {current} adds on top of the base branch.
          </div>
        </div>

        <div className="px-4 py-3 border-b border-edge flex items-center gap-2">
          <span className="text-[12px] text-txt-muted">Base</span>
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            disabled={busy}
            className="bg-base-900 border border-edge rounded text-[12px] px-2 py-1 text-txt outline-none focus:border-accent disabled:opacity-40"
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            onClick={() => void generate(base)}
            disabled={busy || !base}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && <Spinner />}
            {busy ? 'Writing…' : result ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {busy && !result && (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-txt-muted">
              <Spinner /> Reading the branch and writing the description…
            </div>
          )}
          {!busy && !result && (
            <div className="text-[12px] text-txt-muted">
              Pick the base branch, then press Generate.
            </div>
          )}
          {result && (
            <div className="flex flex-col gap-3 select-text">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-txt-muted">Title</span>
                  <button
                    onClick={() => void copyText(result.title, 'PR title')}
                    className="ml-auto text-[10px] px-1.5 rounded border border-edge text-txt-muted hover:bg-base-600"
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-1 rounded border border-edge bg-base-900 px-2 py-1.5 text-[12px] text-txt-bright">
                  {result.title}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-txt-muted">
                    Description ({result.commits} commit{result.commits === 1 ? '' : 's'} vs{' '}
                    {result.base})
                  </span>
                  <button
                    onClick={() => void copyText(result.description, 'PR description')}
                    className="ml-auto text-[10px] px-1.5 rounded border border-edge text-txt-muted hover:bg-base-600"
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-1 rounded border border-edge bg-base-900 px-2 py-1.5 text-[12px] text-txt whitespace-pre-wrap font-sans">
                  {result.description}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-edge flex justify-end gap-2">
          {result && (
            <button
              onClick={() =>
                void copyText(`${result.title}\n\n${result.description}`, 'Pull request')
              }
              className="px-3 py-1 rounded border border-edge text-[12px] text-txt hover:bg-base-600"
            >
              Copy both
            </button>
          )}
          <button
            onClick={close}
            className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
