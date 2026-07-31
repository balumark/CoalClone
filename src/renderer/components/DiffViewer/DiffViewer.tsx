import { useMemo } from 'react'
import { html as diffHtml } from 'diff2html'
import { useRepoStore } from '@renderer/store/useRepoStore'

// Renders the currently selected DiffFile via diff2html. Toggle between
// side-by-side and unified layouts. Binary/empty diffs get a friendly message.

export default function DiffViewer(): JSX.Element {
  const diff = useRepoStore((s) => s.diff)
  const openFileHistory = useRepoStore((s) => s.openFileHistory)
  const openBlame = useRepoStore((s) => s.openBlame)
  // Layout is a persisted preference (Settings > Appearance), not view-local state.
  const format = useRepoStore((s) => s.settings.diffFormat)
  const updateSettings = useRepoStore((s) => s.updateSettings)
  const setFormat = (diffFormat: 'side-by-side' | 'line-by-line'): void => {
    void updateSettings({ diffFormat })
  }

  const rendered = useMemo(() => {
    if (!diff || !diff.raw.trim()) return ''
    return diffHtml(diff.raw, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: format
    })
  }, [diff, format])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-9 border-b border-edge bg-base-800 shrink-0">
        <div className="truncate font-mono text-[12px] text-txt-bright">
          {diff ? diff.path : 'No file selected'}
          {diff && (
            <span className="ml-3 text-[11px]">
              <span className="text-good">+{diff.additions}</span>{' '}
              <span className="text-bad">-{diff.deletions}</span>
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {diff && !diff.binary && (
            <button
              onClick={() => void openBlame(diff.path)}
              title="Blame — who last changed each line"
              className="px-2 py-0.5 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
            >
              Blame
            </button>
          )}
          {diff && (
            <button
              onClick={() => void openFileHistory(diff.path)}
              title="Show this file's commit history"
              className="px-2 py-0.5 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
            >
              History
            </button>
          )}
          {(['line-by-line', 'side-by-side'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-2 py-0.5 rounded text-[11px] border ${
                format === f
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'border-edge text-txt-muted hover:bg-base-700'
              }`}
            >
              {f === 'line-by-line' ? 'Unified' : 'Split'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 select-text">
        {!diff && (
          <div className="flex items-center justify-center h-full text-txt-muted text-sm">
            Select a file to view its diff.
          </div>
        )}
        {diff && diff.binary && (
          <div className="flex items-center justify-center h-full text-txt-muted text-sm">
            Binary file — no textual diff.
          </div>
        )}
        {diff && !diff.binary && !diff.raw.trim() && (
          <div className="flex items-center justify-center h-full text-txt-muted text-sm">
            No changes.
          </div>
        )}
        {diff && !diff.binary && rendered && (
          <div dangerouslySetInnerHTML={{ __html: rendered }} />
        )}
      </div>
    </div>
  )
}
