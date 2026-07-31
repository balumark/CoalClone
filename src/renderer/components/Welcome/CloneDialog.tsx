import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import type { HostKind, RemoteRepo } from '@shared/types'

// GitKraken-shaped clone window: hosting services down the left, the form on the
// right. "Clone with URL" takes a URL verbatim; every other source lists YOUR
// repositories on that host and clones the one you pick.
//
// Listing needs a personal access token (stored per profile, encrypted) — no
// host exposes a repo list over SSH. The profile's SSH key is what then performs
// the clone. Without a token the source still works: fill in owner/repo by hand
// and it builds the same SSH URL.

type SourceKey = 'url' | HostKind

interface Source {
  key: SourceKey
  label: string
  /** Fixed SSH host; absent means the user supplies the server. */
  host?: string
  icon: 'globe' | 'github' | 'gitlab' | 'bucket' | 'azure' | 'server'
  /** Where to create the access token, shown when none is stored yet. */
  tokenHint?: string
}

const SOURCES: Source[] = [
  { key: 'url', label: 'Clone with URL', icon: 'globe' },
  {
    key: 'github',
    label: 'GitHub.com',
    host: 'github.com',
    icon: 'github',
    tokenHint: 'github.com → Settings → Developer settings → Personal access token (repo scope)'
  },
  {
    key: 'github-enterprise',
    label: 'GitHub Enterprise Server',
    icon: 'server',
    tokenHint: 'Your server → Settings → Developer settings → Personal access token (repo scope)'
  },
  {
    key: 'gitlab',
    label: 'GitLab.com',
    host: 'gitlab.com',
    icon: 'gitlab',
    tokenHint: 'gitlab.com → Preferences → Access tokens (read_api scope)'
  },
  {
    key: 'gitlab-self',
    label: 'GitLab (Self-Managed)',
    icon: 'server',
    tokenHint: 'Your server → Preferences → Access tokens (read_api scope)'
  },
  {
    key: 'bitbucket',
    label: 'Bitbucket.org',
    host: 'bitbucket.org',
    icon: 'bucket',
    tokenHint: 'Bitbucket → Personal settings → Access tokens (repository:read)'
  },
  {
    key: 'bitbucket-dc',
    label: 'Bitbucket Data Center',
    icon: 'server',
    tokenHint: 'Your server → Personal settings → HTTP access tokens (repo read)'
  },
  {
    key: 'azure',
    label: 'Azure DevOps',
    host: 'ssh.dev.azure.com',
    icon: 'azure',
    tokenHint: 'Azure DevOps → User settings → Personal access tokens (Code: Read)'
  }
]

// Neutral glyphs on purpose — a wonky hand-drawn brand mark looks worse than none.
const GLYPH: Record<Source['icon'], string> = {
  globe:
    'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.5 8a6.5 6.5 0 0 1 .2-1.6h3.2a16 16 0 0 0 0 3.2H1.7A6.5 6.5 0 0 1 1.5 8Zm5-1.6h3a14 14 0 0 1 0 3.2h-3a14 14 0 0 1 0-3.2Zm4.5 0h3.3a6.5 6.5 0 0 1 0 3.2H11a16 16 0 0 0 0-3.2ZM13.7 5h-2.9a10 10 0 0 0-.9-2.6A6.5 6.5 0 0 1 13.7 5ZM8 1.6c.6 0 1.4 1.2 1.8 3.4H6.2C6.6 2.8 7.4 1.6 8 1.6ZM6.1 2.4A10 10 0 0 0 5.2 5H2.3a6.5 6.5 0 0 1 3.8-2.6ZM2.3 11h2.9c.2 1 .5 1.9.9 2.6A6.5 6.5 0 0 1 2.3 11ZM8 14.4c-.6 0-1.4-1.2-1.8-3.4h3.6c-.4 2.2-1.2 3.4-1.8 3.4Zm1.9-.8c.4-.7.7-1.6.9-2.6h2.9a6.5 6.5 0 0 1-3.8 2.6Z',
  github:
    'M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8 0 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1 0-.2-.3-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z',
  gitlab: 'M8 15 5.2 6.4h5.6L8 15ZM2 6.4h3.2L8 15 2 6.4Zm12 0h-3.2L8 15l6-8.6ZM3.6 1 5.2 6.4H2L3.6 1Zm8.8 0L14 6.4h-3.2L12.4 1Z',
  bucket:
    'M1.5 2h13a.5.5 0 0 1 .5.6l-1.8 10.6a1 1 0 0 1-1 .8H3.8a1 1 0 0 1-1-.8L1 2.6a.5.5 0 0 1 .5-.6Zm4.3 4 .7 4.2h3l.7-4.2H5.8Z',
  azure: 'M9.6 1 4 12.2 0 11.6 3.4 5 9.6 1Zm.5 1.6L16 13.5 6.3 15l-2.2-2.6 6-1.7L10.1 2.6Z',
  server:
    'M1.75 1h12.5c.97 0 1.75.78 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 7H1.75A1.75 1.75 0 0 1 0 5.25v-2.5C0 1.78.78 1 1.75 1Zm0 8h12.5c.97 0 1.75.78 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25v-2.5C0 9.78.78 9 1.75 9ZM3 3.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 8a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z'
}

/** Trailing repo segment of a URL → the folder name to clone into. */
function nameFromUrl(url: string): string {
  const clean = url.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const last = clean.split(/[/:]/).pop() ?? ''
  return /^[\w.-]+$/.test(last) ? last : ''
}

export default function CloneDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const cloneRepo = useRepoStore((s) => s.cloneRepo)
  const pickFolder = useRepoStore((s) => s.pickFolder)
  const loading = useRepoStore((s) => s.loading)
  const profiles = useRepoStore((s) => s.profiles)
  const activeProfileId = useRepoStore((s) => s.activeProfileId)
  const activateProfile = useRepoStore((s) => s.activateProfile)
  const saveProfile = useRepoStore((s) => s.saveProfile)
  const ssh = useRepoStore((s) => s.ssh)
  const loadSsh = useRepoStore((s) => s.loadSsh)
  const hostTokens = useRepoStore((s) => s.hostTokens)
  const hostRepos = useRepoStore((s) => s.hostRepos)
  const hostAccount = useRepoStore((s) => s.hostAccount)
  const hostLoading = useRepoStore((s) => s.hostLoading)
  const hostError = useRepoStore((s) => s.hostError)
  const loadHostTokens = useRepoStore((s) => s.loadHostTokens)
  const saveHostToken = useRepoStore((s) => s.setHostToken)
  const listHostRepos = useRepoStore((s) => s.listHostRepos)
  const clearHostRepos = useRepoStore((s) => s.clearHostRepos)

  const [source, setSource] = useState<SourceKey>('url')
  // Start from wherever the last clone went — the folder rarely changes.
  const [parentDir, setParentDir] = useState(useRepoStore.getState().settings.cloneDir)
  const [url, setUrl] = useState('')
  const [server, setServer] = useState('')
  const [owner, setOwner] = useState('')
  const [project, setProject] = useState('')
  const [repo, setRepo] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  // Repo picker state
  const [listOpen, setListOpen] = useState(false)
  const [picked, setPicked] = useState<RemoteRepo | null>(null)
  const [token, setToken] = useState('')
  // Re-opens the paste field for a source that already has a token stored.
  const [replacingToken, setReplacingToken] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // A dropdown you can't dismiss is a trap — click away or press Escape.
  useEffect(() => {
    if (!listOpen) return
    const onDown = (e: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setListOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setListOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [listOpen])

  const active = SOURCES.find((s) => s.key === source) as Source
  const profile = profiles.find((p) => p.id === activeProfileId)
  const selfHosted = !active.host
  const azure = source === 'azure'
  const hasToken = source !== 'url' && !!hostTokens?.saved.includes(source)

  useEffect(() => {
    void loadHostTokens()
    // The key dropdown lists ~/.ssh, the same scan the SSH settings section uses.
    void loadSsh()
  }, [loadHostTokens, loadSsh])

  // Every source starts from a clean slate — a repo list from GitHub has no
  // business showing up after switching to GitLab.
  useEffect(() => {
    clearHostRepos()
    setPicked(null)
    setListOpen(false)
    setToken('')
    setReplacingToken(false)
  }, [source, clearHostRepos])

  // The URL to clone: either typed, picked from the host, or built by hand.
  const builtUrl = ((): string => {
    if (source === 'url') return url.trim()
    if (picked) return picked.sshUrl
    const host = active.host ?? server.trim()
    if (!host || !repo.trim()) return ''
    if (azure) {
      if (!owner.trim() || !project.trim()) return ''
      return `git@${host}:v3/${owner.trim()}/${project.trim()}/${repo.trim()}`
    }
    if (!owner.trim()) return ''
    return `git@${host}:${owner.trim()}/${repo.trim()}.git`
  })()

  /** Repos grouped under their owner, filtered by what's typed in Repository. */
  const groups = useMemo(() => {
    const q = repo.trim().toLowerCase()
    const matching = (hostRepos ?? []).filter((r) =>
      q ? `${r.owner}/${r.name}`.toLowerCase().includes(q) : true
    )
    const byOwner = new Map<string, RemoteRepo[]>()
    for (const r of matching) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r])
    return [...byOwner.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [hostRepos, repo])

  // Keep the folder name in step with whatever the URL currently is.
  useEffect(() => {
    if (!nameTouched) setName(nameFromUrl(builtUrl))
  }, [builtUrl, nameTouched])

  const ready = !!parentDir && !!builtUrl && !!name.trim() && !loading

  const submit = async (): Promise<void> => {
    if (!ready) return
    const done = await cloneRepo({ url: builtUrl, parentDir, name: name.trim() })
    if (done) onClose()
  }

  const label = 'w-[150px] shrink-0 text-right text-[12px] text-txt pt-1.5'
  const input =
    'flex-1 bg-base-900 border border-edge rounded px-2 py-1.5 text-[12px] text-txt outline-none focus:border-accent'

  const field = (
    text: string,
    node: JSX.Element,
    hint?: string
  ): JSX.Element => (
    <div className="flex items-start gap-3">
      <div className={label}>{text}</div>
      <div className="flex-1 min-w-0">
        {node}
        {hint && <div className="text-[11px] text-txt-muted mt-1">{hint}</div>}
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[66] flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[880px] h-[560px] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-edge shrink-0">
          <div className="text-[15px] text-txt-bright">Clone a Repository</div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt text-[16px] leading-none">
            ✕
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="w-[240px] shrink-0 border-r border-edge overflow-auto py-1">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSource(s.key)}
                className={`flex items-center gap-2.5 w-full text-left px-4 py-2 text-[12px] ${
                  source === s.key
                    ? 'bg-accent/20 text-txt-bright'
                    : 'text-txt hover:bg-base-700'
                }`}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" className="shrink-0" aria-hidden>
                  <path d={GLYPH[s.icon]} />
                </svg>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 overflow-auto p-5">
            <div className="text-[14px] text-txt-bright mb-4">
              {source === 'url' ? 'Clone a Repo' : `Clone from ${active.label}`}
            </div>

            <div className="flex flex-col gap-3 max-w-[640px]">
              {field(
                'Where to clone to',
                <div className="flex gap-2">
                  <input
                    value={parentDir}
                    readOnly
                    placeholder="Pick a folder…"
                    className={`${input} font-mono text-txt-muted`}
                  />
                  <button
                    onClick={async () => {
                      const dir = await pickFolder(parentDir || undefined)
                      if (dir) setParentDir(dir)
                    }}
                    className="px-3 rounded border border-accent/60 text-[12px] text-accent hover:bg-accent/15"
                  >
                    Browse
                  </button>
                </div>
              )}

              {source === 'url' &&
                field(
                  'URL',
                  <input
                    autoFocus
                    value={url}
                    placeholder="git@github.com:owner/repo.git"
                    onChange={(e) => setUrl(e.target.value)}
                    className={`${input} w-full`}
                  />
                )}

              {selfHosted &&
                field(
                  'Server',
                  <input
                    value={server}
                    placeholder="git.company.com"
                    onChange={(e) => setServer(e.target.value)}
                    className={`${input} w-full`}
                  />,
                  'Host name only — the SSH URL is built from it.'
                )}

              {azure &&
                field(
                  'Organization',
                  <input
                    value={owner}
                    placeholder="my-org"
                    onChange={(e) => setOwner(e.target.value)}
                    className={`${input} w-full`}
                  />,
                  'Azure DevOps scopes its API per organization.'
                )}

              {/* With a token we list the account's repositories; without one the
                  same source still works by typing owner/repo by hand. */}
              {/* Owner and repository are ALWAYS here: they build the clone URL on
                  their own, so a token that lists nothing can never trap you. */}
              {source !== 'url' &&
                !azure &&
                field(
                  'Owner / organization',
                  <input
                    value={owner}
                    placeholder="owner or organization"
                    onChange={(e) => {
                      setOwner(e.target.value)
                      setPicked(null)
                      clearHostRepos()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && hasToken) {
                        setListOpen(true)
                        void listHostRepos({ kind: source, server, org: owner })
                      }
                    }}
                    className={`${input} w-full`}
                  />
                )}

              {source !== 'url' && replacingToken && (
                <>
                  <div className="rounded border border-edge bg-base-900/60 p-3">
                    <div className="flex items-center gap-2">
                      <div className="text-[12px] text-txt">
                        {hasToken
                          ? `Replace the ${active.label} token`
                          : `Connect ${active.label} to browse your repositories`}
                      </div>
                      {hasToken && (
                        <button
                          onClick={() => {
                            setReplacingToken(false)
                            setToken('')
                          }}
                          className="ml-auto text-[11px] text-txt-muted hover:text-txt"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-txt-muted mt-1 leading-relaxed">
                      <span className="text-warn">Not your SSH key</span> — a different credential:
                      an access token, which is the only way to ask a host what repositories you
                      have (SSH can&apos;t). Your SSH key still performs the clone itself. Create it
                      at: {active.tokenHint}. Stored encrypted, per profile.
                      <br />
                      Optional — you can skip this and type owner/repository below instead.
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="password"
                        value={token}
                        placeholder="Paste the access token"
                        onChange={(e) => setToken(e.target.value)}
                        className={`${input} w-full`}
                      />
                      <button
                        onClick={async () => {
                          if (!token.trim()) return
                          await saveHostToken(source, token.trim())
                          setToken('')
                          setReplacingToken(false)
                          setListOpen(true)
                          void listHostRepos({ kind: source, server, org: owner })
                        }}
                        disabled={!token.trim() || hostTokens?.encryptionAvailable === false}
                        className="px-3 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40"
                      >
                        {hasToken ? 'Save' : 'Connect'}
                      </button>
                    </div>
                    {hostTokens?.encryptionAvailable === false && (
                      <div className="text-[11px] text-bad mt-1">
                        No OS keychain available here, so a token can&apos;t be stored safely.
                      </div>
                    )}
                  </div>

                </>
              )}

              {azure &&
                field(
                  'Project',
                  <input
                    value={project}
                    placeholder="my-project"
                    onChange={(e) => setProject(e.target.value)}
                    className={`${input} w-full`}
                  />
                )}

              {/* The Repository field IS the picker: focusing it opens the list,
                  typing filters it, and it stays a plain text field when there is
                  no token. No extra button to discover. */}
              {source !== 'url' &&
                field(
                  'Repository',
                  <div className="relative" ref={pickerRef}>
                    <div className="flex gap-2">
                      <input
                        value={repo}
                        placeholder={hasToken ? 'type or pick…' : 'repo'}
                        onFocus={() => {
                          if (!hasToken) return
                          setListOpen(true)
                          if (!hostRepos && !hostLoading) {
                            void listHostRepos({ kind: source, server, org: owner })
                          }
                        }}
                        onChange={(e) => {
                          setRepo(e.target.value)
                          setPicked(null)
                          if (hasToken) setListOpen(true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submit()
                        }}
                        className={`${input} w-full`}
                      />
                      {!hasToken && (
                        <button
                          onClick={() => setReplacingToken(true)}
                          title={`Connect ${active.label} to list repositories`}
                          className="px-3 shrink-0 rounded border border-edge text-[12px] text-txt hover:bg-base-700"
                        >
                          Browse…
                        </button>
                      )}
                    </div>

                    {listOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded border border-edge bg-base-900 shadow-lg">
                        <div className="flex items-center gap-2 px-2 py-1 border-b border-edge">
                          <span className="flex-1 text-[10px] text-txt-muted">
                            {hostLoading
                              ? 'Loading…'
                              : `${hostRepos?.length ?? 0} repositories — keep typing to filter`}
                          </span>
                          <button
                            onClick={() => void listHostRepos({ kind: source, server, org: owner })}
                            title="Reload from the host"
                            className="px-2 rounded border border-edge text-[12px] text-txt hover:bg-base-700"
                          >
                            ⟳
                          </button>
                          <button
                            onClick={() => setListOpen(false)}
                            className="px-2 text-txt-muted hover:text-txt"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="max-h-[220px] overflow-auto">
                          {hostLoading && (
                            <div className="px-3 py-2 text-[12px] text-txt-muted">Loading…</div>
                          )}
                          {hostError && (
                            <div className="px-3 py-2 text-[12px] text-bad whitespace-pre-wrap">
                              {hostError}
                            </div>
                          )}
                          {!hostLoading && !hostError && hostRepos?.length === 0 && (
                            <div className="px-3 py-2 text-[12px] text-txt-muted leading-relaxed">
                              No repositories came back
                              {hostAccount?.account ? ` for ${hostAccount.account}` : ''}.
                              {/* The token type decides the fix, so say which one this is. */}
                              {hostAccount?.tokenKind === 'fine-grained' && (
                                <>
                                  {' '}
                                  This is a <span className="text-txt">fine-grained</span> token, and
                                  those start with <span className="text-txt">no permissions at
                                  all</span> — it cannot see private repositories.
                                  <br />
                                  <span className="text-txt">
                                    Fastest fix: make a classic token instead
                                  </span>{' '}
                                  — Developer settings → Tokens (classic) → Generate new token → tick{' '}
                                  <span className="text-txt">repo</span>. That one sees every repo you
                                  have access to, organizations included.
                                </>
                              )}
                              {hostAccount?.tokenKind === 'classic' && (
                                <>
                                  {' '}
                                  This is a <span className="text-txt">classic</span> token with
                                  scopes:{' '}
                                  <span className="text-txt">
                                    {hostAccount.scopes.join(', ') || 'none'}
                                  </span>
                                  .{' '}
                                  {hostAccount.scopes.includes('repo')
                                    ? 'It has the repo scope, so if an organization is missing it needs SSO authorization (Configure SSO next to the token).'
                                    : 'Add the repo scope to it — without it private repositories stay invisible.'}
                                </>
                              )}
                              <br />
                              Either way you can close this and type the name — cloning never needs
                              the token.
                              <button
                                onClick={() => {
                                  setListOpen(false)
                                  setReplacingToken(true)
                                }}
                                className="block mt-1.5 px-2 py-0.5 rounded border border-edge text-[11px] text-txt hover:bg-base-700"
                              >
                                Use a different token
                              </button>
                            </div>
                          )}
                          {!hostLoading && !hostError && !!hostRepos?.length && !groups.length && (
                            <div className="px-3 py-2 text-[12px] text-txt-muted">
                              None of the {hostRepos.length} repositories match that.
                            </div>
                          )}
                          {groups.map(([groupOwner, repos]) => (
                            <div key={groupOwner}>
                              <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-txt-muted bg-base-800 sticky top-0">
                                {groupOwner}
                              </div>
                              {repos.map((r) => (
                                <button
                                  key={r.sshUrl}
                                  onClick={() => {
                                    // Mirror the pick into the plain fields, so the
                                    // form always shows what is about to be cloned.
                                    setPicked(r)
                                    setOwner(r.owner)
                                    setRepo(r.name)
                                    setNameTouched(false)
                                    setListOpen(false)
                                  }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-[12px] text-txt hover:bg-base-700"
                                >
                                  <span className="text-txt-muted shrink-0">
                                    {r.private ? '🔒' : '🌐'}
                                  </span>
                                  <span className="truncate">{r.name}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {field(
                'Folder name',
                <input
                  value={name}
                  placeholder="repo"
                  onChange={(e) => {
                    setNameTouched(true)
                    setName(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                  className={`${input} w-full`}
                />,
                parentDir && name.trim()
                  ? `→ ${parentDir}${parentDir.includes('/') ? '/' : '\\'}${name.trim()}`
                  : undefined
              )}

              {source !== 'url' && builtUrl && (
                <div className="flex items-start gap-3">
                  <div className={label}>Will clone</div>
                  <div className="flex-1 font-mono text-[11px] text-txt-muted break-all pt-1.5">
                    {builtUrl}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => void submit()}
                  disabled={!ready}
                  className="px-4 py-1.5 rounded border border-accent/60 text-[12px] text-accent hover:bg-accent/15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? 'Cloning…' : 'Clone the repo!'}
                </button>
              </div>

              {/* Who clones this. Both selects write straight to the profile, so
                  the choice sticks for later fetch/push too — there is no
                  clone-only key, the profile IS the identity. */}
              <div className="mt-1 rounded border border-edge bg-base-900/60 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-[130px] shrink-0 text-right text-[12px] text-txt">Profile</div>
                  <select
                    value={activeProfileId}
                    onChange={(e) => void activateProfile(e.target.value)}
                    className={`${input} flex-1`}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-[130px] shrink-0 text-right text-[12px] text-txt">SSH key</div>
                  <select
                    value={profile?.sshKeyPath ?? ''}
                    onChange={(e) =>
                      void saveProfile({ id: activeProfileId, sshKeyPath: e.target.value || null })
                    }
                    title={profile?.sshKeyPath ?? 'System default'}
                    className={`${input} flex-1`}
                  >
                    <option value="">System default (agent / ~/.ssh/config)</option>
                    {(ssh?.keys ?? []).map((k) => (
                      <option key={k.path} value={k.path}>
                        {k.name} — {k.path}
                      </option>
                    ))}
                  </select>
                </div>
                {/* The listing token lives here too — it is a credential like the
                    others, and hiding it inside the Browse panel made it
                    unreachable whenever that panel wasn't open. */}
                {source !== 'url' && (
                  <div className="flex items-center gap-3">
                    <div className="w-[130px] shrink-0 text-right text-[12px] text-txt">
                      Access token
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[12px] text-txt-muted flex-1 truncate">
                        {hasToken ? `${active.label} connected` : 'Not connected (optional)'}
                      </span>
                      <button
                        onClick={() => {
                          setListOpen(false)
                          setReplacingToken(true)
                        }}
                        className="px-2 py-1 rounded border border-edge text-[11px] text-txt hover:bg-base-700"
                      >
                        {hasToken ? 'Change token' : 'Add token'}
                      </button>
                      {hasToken && (
                        <button
                          onClick={() => void saveHostToken(source as HostKind, null)}
                          className="px-2 py-1 rounded border border-edge text-[11px] text-bad hover:bg-bad/15"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-txt-muted leading-relaxed pl-[142px]">
                  Profile and SSH key are saved on the profile, so fetch and push use them too. The
                  token only lists repositories.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
