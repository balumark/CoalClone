import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import Avatar from '@renderer/components/Identicon/Avatar'
import { PlusIcon } from '@renderer/components/icons/UiIcons'
import { Row, btn, inputClass } from './SettingsDialog'
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
      {/* Profile list — pick one to edit it below. */}
      <div className="rounded-lg border border-edge bg-base-900/40 p-1.5 mb-5 flex flex-col gap-0.5">
        {profiles.map((p) => {
          const selected = p.id === draft.id
          const isActive = p.id === activeId
          return (
            <button
              key={p.id}
              onClick={() => setEditing(p.id)}
              className={`flex items-center gap-3 h-12 px-2.5 rounded-md text-left ${
                selected ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-white/[0.04]'
              }`}
            >
              <Avatar email={p.gitEmail} name={p.name} size={30} className="rounded-full" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-txt-bright">{p.name}</span>
                <span className="block truncate text-[11px] text-txt-muted">
                  {p.gitEmail || 'no commit email'}
                  {p.sshKeyPath ? ` · ${p.sshKeyPath.split(/[\\/]/).pop()}` : ''}
                </span>
              </span>
              {isActive ? (
                <span className="inline-flex items-center h-[20px] px-2 rounded-full bg-good/15 text-good text-[10.5px] font-medium">
                  Active
                </span>
              ) : (
                selected && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void activate(p.id)
                    }}
                    className="inline-flex items-center h-[24px] px-2.5 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent-hover"
                  >
                    Switch to
                  </span>
                )
              )}
            </button>
          )
        })}
        <button
          onClick={() => void save({ name: 'New profile' })}
          title="Create a profile, seeded with the current settings"
          className="flex items-center gap-3 h-10 px-2.5 rounded-md text-left text-[12.5px] text-txt-muted hover:bg-white/[0.04] hover:text-txt"
        >
          <span className="w-[30px] h-[30px] rounded-full border border-dashed border-edge flex items-center justify-center">
            <PlusIcon className="text-[13px]" />
          </span>
          New profile
        </button>
      </div>

      <div className="mb-2 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-txt-muted/90">
        Edit “{draft.name || 'profile'}”
      </div>

      <div className="rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60">
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
        <button disabled={!dirty} onClick={() => void save(draft)} className={btn.primary}>
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
            className={btn.danger}
          >
            Delete
          </button>
        )}
      </div>

      <p className="mt-5 text-[11px] text-txt-muted leading-relaxed">
        Every profile keeps its own copy of the settings in this dialog — auto-fetch, pull mode,
        appearance and the whole AI configuration included. Switching profiles switches all of them,
        together with the SSH key git authenticates with.
      </p>
    </div>
  )
}
