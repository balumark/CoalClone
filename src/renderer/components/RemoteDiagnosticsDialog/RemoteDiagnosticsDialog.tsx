import { useRepoStore } from '@renderer/store/useRepoStore'
import type { RemoteReachability, SshKeyProbe } from '@shared/types'

// "Remote connection" diagnostics: tests whether the current repo's remote can be
// reached (git ls-remote), classifies why not, and — for SSH remotes — shows which
// ~/.ssh key authenticates and as whom. Answers "Could not read from remote
// repository" with a specific, actionable cause instead of git's generic message.

const REACHABILITY: Record<
  RemoteReachability,
  { label: string; tone: 'good' | 'warn' | 'bad'; glyph: string }
> = {
  ok: { label: 'Connected', tone: 'good', glyph: '✓' },
  'no-access': { label: 'Authenticated, but no access', tone: 'warn', glyph: '!' },
  'auth-failed': { label: 'Authentication failed', tone: 'bad', glyph: '✕' },
  'host-unreachable': { label: 'Host unreachable', tone: 'bad', glyph: '⚡' },
  'https-auth': { label: 'HTTPS credentials required', tone: 'warn', glyph: '!' },
  unknown: { label: "Couldn't determine", tone: 'warn', glyph: '?' }
}

const TONE: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-good border-good/40 bg-good/10',
  warn: 'text-warn border-warn/40 bg-warn/10',
  bad: 'text-bad border-bad/40 bg-bad/10'
}

function KeyRow({ k }: { k: SshKeyProbe }): JSX.Element {
  const tone =
    k.status === 'authenticated' ? 'text-good' : k.status === 'denied' ? 'text-bad' : 'text-txt-muted'
  const badge =
    k.status === 'authenticated' ? 'authenticated' : k.status === 'denied' ? 'denied' : 'no response'
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-base-700">
      <span className="font-mono text-[12px] text-txt truncate w-[130px] shrink-0" title={k.name}>
        {k.name}
      </span>
      <span className={`text-[11px] shrink-0 w-[90px] ${tone}`}>{badge}</span>
      <span className="text-[11px] text-txt-muted truncate flex-1" title={k.message}>
        {k.identity ? `→ ${k.identity}` : k.message}
      </span>
    </div>
  )
}

export default function RemoteDiagnosticsDialog(): JSX.Element | null {
  const open = useRepoStore((s) => s.remoteDiagOpen)
  const diag = useRepoStore((s) => s.remoteDiag)
  const loading = useRepoStore((s) => s.remoteDiagLoading)
  const target = useRepoStore((s) => s.remoteDiagTarget)
  const close = useRepoStore((s) => s.closeRemoteDiagnostics)
  const rerun = useRepoStore((s) => s.openRemoteDiagnostics)
  const openSettings = useRepoStore((s) => s.setSettingsOpen)

  if (!open) return null

  const rc = diag ? REACHABILITY[diag.reachability] : null
  // Everything the SSH/auth settings can actually fix from here.
  const needsAuth =
    !!diag && ['auth-failed', 'no-access', 'https-auth', 'unknown'].includes(diag.reachability)

  // z-67 puts this ABOVE the Settings dialog (z-66): "Test connection" is
  // launched from inside Settings, so its result must land in front of it.
  return (
    <div
      className="fixed inset-0 z-[67] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="w-[640px] max-h-[85vh] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-txt-bright font-medium">Remote connection</div>
            <div className="text-[11px] text-txt-muted font-mono truncate">
              {diag ? `${diag.remote} · ${diag.url}` : target ?? 'origin'}
            </div>
          </div>
          {diag && (
            <span className="text-[11px] text-txt-muted shrink-0 uppercase tracking-wide">
              {diag.protocol}
            </span>
          )}
        </div>

        <div className="overflow-auto flex-1 p-4 space-y-4">
          {loading || !diag ? (
            <div className="flex items-center gap-2 text-[12px] text-txt-muted py-6 justify-center">
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 50 50" aria-hidden>
                <circle
                  cx="25"
                  cy="25"
                  r="20"
                  fill="none"
                  strokeWidth="5"
                  className="stroke-base-600"
                  opacity="0.3"
                />
                <circle
                  cx="25"
                  cy="25"
                  r="20"
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="80 200"
                  className="stroke-accent"
                />
              </svg>
              Testing connection…
            </div>
          ) : (
            <>
              {rc && (
                <div className={`flex items-center gap-2 rounded border px-3 py-2 ${TONE[rc.tone]}`}>
                  <span className="text-[14px] leading-none">{rc.glyph}</span>
                  <span className="text-[13px] font-medium">{rc.label}</span>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wide text-txt-muted mb-1">
                  What to do
                </div>
                <ul className="space-y-1">
                  {diag.hints.map((hint, i) => (
                    <li key={i} className="text-[12px] text-txt flex gap-2">
                      <span className="text-txt-muted shrink-0">•</span>
                      <span className="select-text">{hint}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {diag.protocol === 'ssh' && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-txt-muted mb-1">
                    SSH keys ({diag.sshKeys.length}) — tested against {diag.host}
                  </div>
                  {diag.sshKeys.length === 0 ? (
                    <div className="text-[12px] text-txt-muted px-3 py-2">
                      No SSH keys found in your ~/.ssh directory.
                    </div>
                  ) : (
                    <div className="rounded border border-edge divide-y divide-edge/50">
                      {diag.sshKeys.map((k) => (
                        <KeyRow key={k.name} k={k} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wide text-txt-muted mb-1">
                  git output
                </div>
                <pre className="text-[11px] text-txt-muted font-mono whitespace-pre-wrap select-text rounded bg-base-900 border border-edge p-2 max-h-32 overflow-auto">
                  {diag.detail}
                </pre>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-edge flex justify-between gap-2">
          <button
            onClick={() => void rerun(target ?? undefined)}
            disabled={loading}
            className="px-3 py-1 rounded text-[12px] border border-edge text-txt-muted hover:bg-base-700 disabled:opacity-40"
          >
            Test again
          </button>
          <div className="flex gap-2">
            {needsAuth && (
              <button
                onClick={() => {
                  close()
                  openSettings(true, 'ssh')
                }}
                className="px-3 py-1 rounded text-[12px] bg-accent text-white hover:bg-accent-hover"
              >
                Fix authentication…
              </button>
            )}
            <button
              onClick={close}
              className="px-3 py-1 rounded text-[12px] text-txt-muted hover:bg-base-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
