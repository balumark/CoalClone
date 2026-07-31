import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import { Row, inputClass } from './SettingsDialog'
import type { Profile } from '@shared/types'

// Settings > Profiles. A profile bundles an SSH key, a commit identity and the
// whole settings block, so switching profile switches all three at once. The key
// list comes from the SSH section's scan of ~/.ssh.

export default function ProfilesSection(): JSX.Element {
  const profiles = useRepoStore((s) => s.profiles)
  const activeId = useRepoStore((s) => s.activeProfileId)
  const save = useRepoStore((s) => s.saveProfile)
  const remove = useRepoStore((s) => s.deleteProfile)
  const activate = useRepoStore((s) => s.activateProfile)
  const loadProfiles = useRepoStore((s) => s.loadProfiles)
  const ssh = useRepoStore((s) => s.ssh)
  const loadSsh = useRepoStore((s) => s.loadSsh)
  const [editing, setEditing] = useState<string>(activeId)
  const [draft, setDraft] = useState<Profile | null>(null)

  useEffect(() => {
    void loadProfiles()
    void loadSsh()
  }, [loadProfiles, loadSsh])

  // Follow the selection (and any external change) without fighting typing.
  useEffect(() => {
    const p = profiles.find((x) => x.id === editing) ?? profiles.find((x) => x.id === activeId)
    if (p) setDraft({ ...p })
  }, [profiles, editing, activeId])

  if (!draft) return <div className="text-[12px] text-txt-muted">Loading profiles…</div>

  const stored = profiles.find((p) => p.id === draft.id)
  const dirty =
    !!stored &&
    (stored.name !== draft.name ||
      stored.sshKeyPath !== draft.sshKeyPath ||
      stored.gitName !== draft.gitName ||
      stored.gitEmail !== draft.gitEmail)

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <select
          value={draft.id}
          onChange={(e) => setEditing(e.target.value)}
          className={`${inputClass} flex-1`}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === activeId ? ' (active)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={() => void save({ name: 'New profile' })}
          title="Create a profile, seeded with the current settings"
          className="px-2 py-1 rounded border border-edge text-[12px] text-txt hover:bg-base-600"
        >
          + New
        </button>
        {draft.id !== activeId && (
          <button
            onClick={() => void activate(draft.id)}
            className="px-2 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover"
          >
            Use this
          </button>
        )}
      </div>

      <div className="divide-y divide-edge/50">
        <Row label="Name" hint="Shown in the tab bar and on the Repositories screen.">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`${inputClass} w-[260px]`}
          />
        </Row>
        <Row label="SSH key" hint="Used for clone, fetch and push while this profile is active.">
          <select
            value={draft.sshKeyPath ?? ''}
            onChange={(e) => setDraft({ ...draft, sshKeyPath: e.target.value || null })}
            className={`${inputClass} w-[260px]`}
          >
            <option value="">System default (agent / ~/.ssh/config)</option>
            {(ssh?.keys ?? []).map((k) => (
              <option key={k.path} value={k.path}>
                {k.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Commit name" hint="Stamped on repositories this profile clones or creates.">
          <input
            value={draft.gitName}
            placeholder="Your Name"
            onChange={(e) => setDraft({ ...draft, gitName: e.target.value })}
            className={`${inputClass} w-[260px]`}
          />
        </Row>
        <Row label="Commit email">
          <input
            value={draft.gitEmail}
            placeholder="you@example.com"
            onChange={(e) => setDraft({ ...draft, gitEmail: e.target.value })}
            className={`${inputClass} w-[260px]`}
          />
        </Row>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          disabled={!dirty}
          onClick={() => void save(draft)}
          className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40"
        >
          Save profile
        </button>
        {dirty && <span className="text-[11px] text-txt-muted">Unsaved changes</span>}
        <div className="flex-1" />
        {profiles.length > 1 && (
          <button
            onClick={() => {
              if (window.confirm(`Delete the profile "${draft.name}"? Its settings are lost.`))
                void remove(draft.id)
            }}
            className="px-3 py-1 rounded border border-edge text-[12px] text-bad hover:bg-bad/15"
          >
            Delete
          </button>
        )}
      </div>

      <p className="mt-5 text-[11px] text-txt-muted leading-relaxed">
        Every profile keeps its own copy of the settings in this dialog — auto-fetch, pull mode,
        appearance and the whole AI configuration included. Switching profiles switches all of
        them, together with the SSH key git authenticates with.
      </p>
    </div>
  )
}
