// Shared "this section couldn't load" state. A settings pane that just says
// "Reading…" forever hides the actual failure (a stale preload after an in-place
// app update is the usual one), so show the message and offer a retry.

export default function LoadFailure({
  what,
  error,
  onRetry
}: {
  what: string
  error: string
  onRetry: () => void
}): JSX.Element {
  return (
    <div className="rounded border border-bad/40 bg-bad/10 p-3 flex flex-col gap-2">
      <div className="text-[12px] text-txt-bright">Couldn&apos;t read {what}</div>
      <pre className="text-[11px] text-txt-muted font-mono whitespace-pre-wrap select-text">
        {error}
      </pre>
      <div>
        <button
          onClick={onRetry}
          className="px-2 py-1 rounded text-[11px] border border-edge text-txt hover:bg-base-700"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
