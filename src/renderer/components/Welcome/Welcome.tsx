import { useMemo, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import { APP_NAME } from '@shared/appInfo'
import NewRepoDialog from './NewRepoDialog'
import CloneDialog from './CloneDialog'
import logoUrl from '../../assets/logo.png'

// The "Repositories" screen: shown when nothing is open, and again whenever the
// "+" tab is pressed. Open / Clone / Create across the top, a filter over the
// recent list below, and the active profile on the right — that profile's SSH
// key is what clone (and every later fetch/push) authenticates with.

function Icon({ path }: { path: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  )
}

const ICON = {
  open: 'M1.75 1h5.5c.28 0 .53.14.68.38L9.2 3h5.05c.97 0 1.75.78 1.75 1.75v8.5c0 .97-.78 1.75-1.75 1.75H1.75C.78 15 0 14.22 0 13.25V2.75C0 1.78.78 1 1.75 1Z',
  clone: 'M8 1a.75.75 0 0 1 .75.75v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V1.75A.75.75 0 0 1 8 1ZM2 12.5a.75.75 0 0 1 .75.75v.25h10.5v-.25a.75.75 0 0 1 1.5 0v1a.75.75 0 0 1-.75.75H1.5a.75.75 0 0 1-.75-.75v-1a.75.75 0 0 1 .75-.75Z',
  create: 'M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z'
}

export default function Welcome(): JSX.Element {
  const recent = useRepoStore((s) => s.recent)
  const openDialog = useRepoStore((s) => s.openDialog)
  const openRepo = useRepoStore((s) => s.openRepo)
  const removeRecent = useRepoStore((s) => s.removeRecent)
  const loading = useRepoStore((s) => s.loading)
  const tabs = useRepoStore((s) => s.tabs)
  const profiles = useRepoStore((s) => s.profiles)
  const activeProfileId = useRepoStore((s) => s.activeProfileId)
  const activateProfile = useRepoStore((s) => s.activateProfile)
  const setSettingsOpen = useRepoStore((s) => s.setSettingsOpen)
  const [filter, setFilter] = useState('')
  const [dialog, setDialog] = useState<'clone' | 'create' | null>(null)

  const profile = profiles.find((p) => p.id === activeProfileId)
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return recent
    return recent.filter((r) => `${r.name} ${r.path}`.toLowerCase().includes(q))
  }, [recent, filter])

  const action = (label: string, icon: string, onClick: () => void): JSX.Element => (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 h-9 rounded border border-edge bg-base-800 text-[13px] text-txt hover:bg-base-700 disabled:opacity-40"
    >
      <Icon path={icon} />
      {label}
    </button>
  )

  return (
    <div className="flex h-full min-h-0 overflow-auto">
      {dialog === 'clone' && <CloneDialog onClose={() => setDialog(null)} />}
      {dialog === 'create' && <NewRepoDialog mode="create" onClose={() => setDialog(null)} />}

      <div className="flex-1 min-w-0 p-8">
        {/* Only greet on the real welcome screen; as a "+" tab it's just a list. */}
        {tabs.length === 0 && (
          <div className="flex items-center gap-3 mb-6">
            <img src={logoUrl} alt="" className="w-12 h-12 select-none" draggable={false} />
            <div className="text-xl font-semibold text-txt-bright">{APP_NAME}</div>
          </div>
        )}

        <div className="text-[15px] text-txt-bright mb-3">Repositories</div>
        <div className="flex gap-2 mb-4">
          {action('Open', ICON.open, () => void openDialog())}
          {action('Clone', ICON.clone, () => setDialog('clone'))}
          {action('Create', ICON.create, () => setDialog('create'))}
        </div>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search repositories"
          className="w-full max-w-[720px] bg-base-900 border border-edge rounded px-3 py-1.5 text-[12px] text-txt outline-none focus:border-accent"
        />

        <div className="text-[11px] uppercase tracking-wide text-txt-muted mt-5 mb-1">Recent</div>
        {filtered.length === 0 ? (
          <div className="text-[12px] text-txt-muted italic">
            {recent.length ? 'Nothing matches that.' : 'No repositories yet — open, clone or create one.'}
          </div>
        ) : (
          <div className="max-w-[720px]">
            {filtered.map((r) => (
              <div
                key={r.path}
                onClick={() => void openRepo(r.path)}
                className="group flex items-baseline gap-3 px-2 py-1 rounded cursor-pointer hover:bg-base-800"
              >
                <span className="text-accent text-[13px] shrink-0">{r.name}</span>
                <span className="text-txt-muted text-[11px] font-mono truncate flex-1">{r.path}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeRecent(r.path)
                  }}
                  title="Remove from recent"
                  className="opacity-0 group-hover:opacity-100 shrink-0 px-1 text-txt-muted hover:text-bad"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right rail: which profile is in play, since it decides the SSH key. */}
      <aside className="w-[300px] shrink-0 border-l border-edge p-6">
        <div className="text-[15px] text-txt-bright mb-3">Profile</div>
        <select
          value={activeProfileId}
          onChange={(e) => void activateProfile(e.target.value)}
          className="w-full bg-base-900 border border-edge rounded px-2 py-1.5 text-[12px] text-txt outline-none focus:border-accent"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <dl className="mt-3 text-[11px] text-txt-muted flex flex-col gap-1.5">
          <div>
            <dt className="text-txt">SSH key</dt>
            <dd className="font-mono truncate" title={profile?.sshKeyPath ?? undefined}>
              {profile?.sshKeyPath ?? 'system default'}
            </dd>
          </div>
          <div>
            <dt className="text-txt">Commit identity</dt>
            <dd className="truncate">
              {profile?.gitName || profile?.gitEmail
                ? `${profile.gitName} <${profile.gitEmail}>`
                : 'inherited from git config'}
            </dd>
          </div>
        </dl>

        <button
          onClick={() => setSettingsOpen(true, 'profiles')}
          className="mt-4 w-full px-3 py-1.5 rounded border border-edge text-[12px] text-txt hover:bg-base-700"
        >
          Manage profiles…
        </button>

        <p className="mt-4 text-[11px] text-txt-muted leading-relaxed">
          Clone and every later fetch/push use this profile&apos;s SSH key, and repositories you
          clone or create get its commit identity. Settings are saved per profile too.
        </p>
      </aside>
    </div>
  )
}
