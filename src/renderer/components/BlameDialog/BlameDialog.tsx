import { useRepoStore } from '@renderer/store/useRepoStore'
import { relativeTime } from '@renderer/lib/format'

// git blame view: every line of a file with the commit that last touched it.
// Clicking a line jumps the main view to that commit's diff for this file.

const ZERO = '0000000'

export default function BlameDialog(): JSX.Element | null {
  const blame = useRepoStore((s) => s.blame)
  const close = useRepoStore((s) => s.closeBlame)
  const view = useRepoStore((s) => s.viewFileAtCommit)

  if (!blame) return null
  const { path, lines } = blame

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="w-[820px] max-h-[85vh] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-txt-bright font-medium">Blame</div>
            <div className="text-[11px] text-txt-muted font-mono truncate">{path}</div>
          </div>
          <button
            onClick={close}
            className="px-3 py-1 rounded text-[12px] text-txt-muted hover:bg-base-700 shrink-0"
          >
            Close
          </button>
        </div>

        <div className="overflow-auto flex-1 font-mono text-[12px] leading-[1.5]">
          {lines.map((l, i) => {
            const uncommitted = l.shortHash === ZERO
            return (
              <div key={i} className="flex items-stretch hover:bg-base-700/60 group">
                <button
                  onClick={() => {
                    if (!uncommitted) void view(l.hash, path)
                  }}
                  disabled={uncommitted}
                  title={uncommitted ? 'Not committed yet' : `${l.summary} — ${l.author}`}
                  className={`shrink-0 w-[230px] flex items-center gap-2 px-2 border-r border-edge/60 text-left ${
                    uncommitted ? 'text-txt-muted/50' : 'text-txt-muted hover:text-accent'
                  }`}
                >
                  <span className="w-[52px] shrink-0">{l.shortHash}</span>
                  <span className="truncate flex-1">{l.author}</span>
                  <span className="w-[62px] shrink-0 text-right text-[10px]">
                    {l.authorTime ? relativeTime(l.authorTime) : ''}
                  </span>
                </button>
                <span className="w-[46px] shrink-0 px-2 text-right text-txt-muted/50 select-none">
                  {l.line}
                </span>
                <pre className="flex-1 px-2 whitespace-pre text-txt select-text">{l.content}</pre>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
