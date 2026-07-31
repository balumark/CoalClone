import { useEffect, useState } from 'react'
import { useRepoStore, type SettingsTab } from '@renderer/store/useRepoStore'
import { ACCENTS } from '@renderer/lib/accents'
import SshSection from './SshSection'
import ProfileSection from './ProfileSection'
import AiSection from './AiSection'
import ProfilesSection from './ProfilesSection'

// Preferences modal, GitKraken-style: a section list on the left, the settings
// themselves on the right. Everything persists immediately (app settings via
// store.updateSettings, git identity and SSH via their own git/ssh calls).

const LIMITS = [500, 1000, 2000, 5000]
const FETCH_INTERVALS = [0, 1, 5, 10, 15, 30, 60]

const TABS: { key: SettingsTab; label: string; hint: string }[] = [
  { key: 'profiles', label: 'Profiles', hint: 'SSH key, identity, settings' },
  { key: 'general', label: 'General', hint: 'Fetching, startup, safety' },
  { key: 'profile', label: 'Git profile', hint: 'Name, email, signing' },
  { key: 'ssh', label: 'SSH & auth', hint: 'Keys, agent, this repo' },
  { key: 'ai', label: 'AI', hint: 'Provider, key, features' },
  { key: 'appearance', label: 'Appearance', hint: 'Accent, avatars, diffs' }
]

/** Label + control on one row — the layout every section uses. */
export function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-[12px] text-txt">{label}</div>
        {hint && <div className="text-[11px] text-txt-muted mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

export const inputClass =
  'bg-base-900 border border-edge rounded text-[12px] px-2 py-1 text-txt outline-none focus:border-accent'

export function Check({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-accent w-4 h-4"
    />
  )
}

function GeneralSection(): JSX.Element {
  const settings = useRepoStore((s) => s.settings)
  const update = useRepoStore((s) => s.updateSettings)
  return (
    <div className="divide-y divide-edge/50">
      <Row
        label="Auto-fetch interval"
        hint="Fetches all remotes in the background. 0 disables it."
      >
        <select
          value={settings.autoFetchMinutes}
          onChange={(e) => void update({ autoFetchMinutes: Number(e.target.value) })}
          className={inputClass}
        >
          {FETCH_INTERVALS.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Off' : `${n} min`}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Default pull behaviour" hint="What the Pull button does when clicked.">
        <select
          value={settings.pullMode}
          onChange={(e) =>
            void update({ pullMode: e.target.value as typeof settings.pullMode })
          }
          className={inputClass}
        >
          <option value="ff">Merge (fast-forward if possible)</option>
          <option value="ff-only">Fast-forward only</option>
          <option value="rebase">Rebase</option>
        </select>
      </Row>
      <Row label="Commits to load" hint="The graph is virtualized, so higher is fine.">
        <select
          value={settings.commitLimit}
          onChange={(e) => void update({ commitLimit: Number(e.target.value) })}
          className={inputClass}
        >
          {LIMITS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Reopen last repository" hint="Skip the welcome screen on launch.">
        <Check
          checked={settings.reopenLastRepo}
          onChange={(v) => void update({ reopenLastRepo: v })}
        />
      </Row>
      <Row label="Confirm before discarding" hint="Ask before throwing away working-tree changes.">
        <Check checked={settings.confirmDiscard} onChange={(v) => void update({ confirmDiscard: v })} />
      </Row>
    </div>
  )
}

function AppearanceSection(): JSX.Element {
  const settings = useRepoStore((s) => s.settings)
  const update = useRepoStore((s) => s.updateSettings)
  return (
    <div className="divide-y divide-edge/50">
      <Row label="Accent color">
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              onClick={() => void update({ accent: a.key })}
              title={a.label}
              className={`w-6 h-6 rounded-full border-2 ${
                settings.accent === a.key ? 'border-txt-bright' : 'border-transparent'
              }`}
              style={{ background: `rgb(${a.rgb})` }}
            />
          ))}
        </div>
      </Row>
      <Row label="Author avatars (Gravatar)" hint="Off = generated identicons only, no network.">
        <Check checked={settings.avatars} onChange={(v) => void update({ avatars: v })} />
      </Row>
      <Row label="Diff layout" hint="Remembered across sessions.">
        <select
          value={settings.diffFormat}
          onChange={(e) =>
            void update({ diffFormat: e.target.value as typeof settings.diffFormat })
          }
          className={inputClass}
        >
          <option value="line-by-line">Unified</option>
          <option value="side-by-side">Side by side</option>
        </select>
      </Row>
    </div>
  )
}

export default function SettingsDialog(): JSX.Element | null {
  const open = useRepoStore((s) => s.settingsOpen)
  const setOpen = useRepoStore((s) => s.setSettingsOpen)
  const tab = useRepoStore((s) => s.settingsTab)
  const loadSsh = useRepoStore((s) => s.loadSsh)
  const loadIdentity = useRepoStore((s) => s.loadIdentity)
  const [active, setActive] = useState<SettingsTab>(tab)

  // Follow deep links (e.g. the "Fix authentication" button in the toast).
  useEffect(() => {
    if (open) setActive(tab)
  }, [open, tab])

  useEffect(() => {
    if (!open) return
    if (active === 'ssh') void loadSsh()
    // The SSH section needs the identity too — it seeds the new key's comment.
    if (active === 'ssh' || active === 'profile') void loadIdentity()
  }, [open, active, loadSsh, loadIdentity])

  if (!open) return null
  const close = (): void => setOpen(false)

  return (
    <div
      className="fixed inset-0 z-[66] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="w-[720px] h-[560px] flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between">
          <div className="text-[13px] text-txt-bright font-medium">Settings</div>
          <button onClick={close} className="text-txt-muted hover:text-txt">
            ⨯
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="w-[190px] shrink-0 border-r border-edge p-2 flex flex-col gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`text-left px-2 py-1.5 rounded ${
                  active === t.key ? 'bg-accent/20 text-txt-bright' : 'text-txt hover:bg-base-700'
                }`}
              >
                <div className="text-[12px]">{t.label}</div>
                <div className="text-[10px] text-txt-muted">{t.hint}</div>
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-auto p-4">
            {active === 'profiles' && <ProfilesSection />}
            {active === 'general' && <GeneralSection />}
            {active === 'profile' && <ProfileSection />}
            {active === 'ssh' && <SshSection />}
            {active === 'ai' && <AiSection />}
            {active === 'appearance' && <AppearanceSection />}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-edge flex justify-end">
          <button
            onClick={close}
            className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
