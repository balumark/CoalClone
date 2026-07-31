import { useRepoStore } from '@renderer/store/useRepoStore'

// Bottom-right toast stack. Error toasts for the WSL/Windows "dubious ownership"
// case get a one-click "Trust & retry" action wired to git safe.directory.

export default function Toasts(): JSX.Element {
  const toasts = useRepoStore((s) => s.toasts)
  const dismiss = useRepoStore((s) => s.dismissToast)
  const trustDirectory = useRepoStore((s) => s.trustDirectory)
  const diagnoseRemote = useRepoStore((s) => s.openRemoteDiagnostics)
  const stage = useRepoStore((s) => s.stage)
  const openSettings = useRepoStore((s) => s.setSettingsOpen)

  // Every AI failure that the user can fix themselves is a settings problem.
  const AI_FIXABLE = ['AI_NO_KEY', 'AI_BAD_KEY', 'AI_DISABLED', 'AI_NO_MODEL', 'AI_NO_BASE_URL']

  // Reserved-name errors name the file in the message; stash/pull have no path field.
  const reservedPath = (t: { path?: string; message: string }): string | null =>
    t.path ?? t.message.match(/^"(.+?)" is a reserved/)?.[1] ?? null

  return (
    // Above every dialog (they run z-60..z-70): toasts are the app's only error
    // channel, and one rendered behind a modal is one the user never sees — an
    // action then just looks like it did nothing.
    <div className="fixed bottom-3 right-3 flex flex-col gap-2 z-[90] w-[360px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded border p-3 text-[12px] shadow-lg ${
            t.kind === 'error'
              ? 'bg-bad/10 border-bad/40 text-txt-bright'
              : 'bg-base-700 border-edge text-txt'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1 whitespace-pre-wrap select-text">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-txt-muted hover:text-txt">
              ⨯
            </button>
          </div>
          {t.code === 'DUBIOUS_OWNERSHIP' && t.path && (
            <button
              onClick={() => {
                dismiss(t.id)
                void trustDirectory(t.path!)
              }}
              className="mt-2 px-2 py-1 rounded bg-accent text-white text-[11px] hover:bg-accent-hover"
            >
              Trust this directory & retry
            </button>
          )}
          {t.code === 'RESERVED_NAME' && reservedPath(t) && (
            <button
              onClick={() => {
                dismiss(t.id)
                void stage([reservedPath(t)!])
              }}
              className="mt-2 px-2 py-1 rounded bg-accent text-white text-[11px] hover:bg-accent-hover"
            >
              Stage its deletion
            </button>
          )}
          {t.code && AI_FIXABLE.includes(t.code) && (
            <button
              onClick={() => {
                dismiss(t.id)
                openSettings(true, 'ai')
              }}
              className="mt-2 px-2 py-1 rounded bg-accent text-white text-[11px] hover:bg-accent-hover"
            >
              Open AI settings
            </button>
          )}
          {t.code === 'REMOTE_ACCESS' && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  dismiss(t.id)
                  void diagnoseRemote()
                }}
                className="px-2 py-1 rounded bg-accent text-white text-[11px] hover:bg-accent-hover"
              >
                Diagnose connection
              </button>
              <button
                onClick={() => {
                  dismiss(t.id)
                  openSettings(true, 'ssh')
                }}
                className="px-2 py-1 rounded border border-edge text-txt text-[11px] hover:bg-base-700"
              >
                SSH keys…
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
