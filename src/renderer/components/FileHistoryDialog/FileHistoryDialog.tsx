import { useRepoStore } from '@renderer/store/useRepoStore'
import { relativeTime } from '@renderer/lib/format'

// Lists the commits that touched a single file (git log --follow). Clicking a
// commit jumps the main view to that commit and selects this file's diff.

export default function FileHistoryDialog(): JSX.Element | null {
  const fileHistory = useRepoStore((s) => s.fileHistory)
  const close = useRepoStore((s) => s.closeFileHistory)
  const view = useRepoStore((s) => s.viewFileAtCommit)

  if (!fileHistory) return null
  const { path, commits } = fileHistory

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="w-[620px] max-h-[80vh] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-txt-bright font-medium">File history</div>
            <div className="text-[11px] text-txt-muted font-mono truncate">{path}</div>
          </div>
          <span className="text-[11px] text-txt-muted shrink-0">{commits.length} commits</span>
        </div>

        <div className="overflow-auto flex-1 p-1">
          {commits.map((c) => (
            <button
              key={c.hash}
              onClick={() => void view(c.hash, path)}
              className="flex items-center w-full text-left gap-3 px-3 py-1.5 rounded hover:bg-base-700"
            >
              <span className="truncate text-[12px] text-txt flex-1">{c.subject}</span>
              <span className="shrink-0 text-[11px] text-txt-muted truncate max-w-[120px]">
                {c.authorName}
              </span>
              <span className="shrink-0 text-[11px] text-txt-muted w-[70px] text-right">
                {relativeTime(c.authorDate)}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-txt-muted w-[56px]">
                {c.shortHash}
              </span>
            </button>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-edge flex justify-end">
          <button
            onClick={close}
            className="px-3 py-1 rounded text-[12px] text-txt-muted hover:bg-base-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
