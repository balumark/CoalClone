import { useEffect, useState } from 'react'
import { useRepoStore, type SettingsTab } from '@renderer/store/useRepoStore'
import { ACCENTS } from '@renderer/lib/accents'
import Avatar from '@renderer/components/Identicon/Avatar'
import {
  IdBadgeIcon,
  KeyIcon,
  PaintbrushIcon,
  PeopleIcon,
  SlidersIcon,
  SparkleIcon,
  XIcon
} from '@renderer/components/icons/UiIcons'
import SshSection from './SshSection'
import ProfileSection from './ProfileSection'
import AiSection from './AiSection'
import ProfilesSection from './ProfilesSection'

// Preferences modal: an icon nav on the left, and on the right a page header
// (title + what the page is for) over cards of label/control rows. Everything
// persists immediately (app settings via store.updateSettings, git identity
// and SSH via their own git/ssh calls). The building blocks — Row, Card,
// SectionTitle, Check (a switch), inputClass, btn — are shared by every section.

const LIMITS = [500, 1000, 2000, 5000]
const FETCH_INTERVALS = [0, 1, 5, 10, 15, 30, 60]

const TABS: {
  key: SettingsTab
  label: string
  icon: (p: { className?: string }) => JSX.Element
  description: string
}[] = [
  {
    key: 'profiles',
    label: 'Profiles',
    icon: PeopleIcon,
    description:
      'A profile bundles an SSH key, a commit identity, its own settings and its own repositories.'
  },
  {
    key: 'profile',
    label: 'Git identity',
    icon: IdBadgeIcon,
    description: 'The name and email git stamps on your commits, and commit signing.'
  },
  {
    key: 'ssh',
    label: 'SSH & auth',
    icon: KeyIcon,
    description:
      'The keys git authenticates with, the ssh-agent, and the key this repo is pinned to.'
  },
  {
    key: 'ai',
    label: 'AI',
    icon: SparkleIcon,
    description: 'Provider, API key and what each AI feature may do.'
  },
  {
    key: 'general',
    label: 'General',
    icon: SlidersIcon,
    description: 'Fetching, pulling, startup and safety prompts.'
  },
  {
    key: 'appearance',
    label: 'Appearance',
    icon: PaintbrushIcon,
    description: 'Accent color, avatars and how diffs are laid out.'
  }
]

// --- shared building blocks --------------------------------------------------

export const inputClass =
  'min-h-[30px] bg-base-900 border border-edge rounded-md text-[12px] px-2.5 py-1 text-txt outline-none transition-shadow placeholder:text-txt-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-40'

/** Button styles every section uses, so the dialog reads as one thing. */
export const btn = {
  primary:
    'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent',
  secondary:
    'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-md border border-edge bg-base-700/60 text-txt text-[12px] hover:bg-base-600 hover:text-txt-bright disabled:opacity-40',
  danger:
    'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-md border border-bad/40 text-bad text-[12px] hover:bg-bad/10 disabled:opacity-40',
  small:
    'inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md border border-edge bg-base-700/60 text-txt text-[11.5px] hover:bg-base-600 hover:text-txt-bright disabled:opacity-40'
}

/** A small uppercase heading above a card. */
export function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-2 mt-6 first:mt-0 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-txt-muted/90">
      {children}
    </div>
  )
}

/** A rounded group of rows. */
export function Card({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={`rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60 ${className}`}
    >
      {children}
    </div>
  )
}

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
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-[12.5px] text-txt-bright">{label}</div>
        {hint && <div className="text-[11.5px] text-txt-muted mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

/** An on/off switch (named Check for the existing call sites). */
export function Check({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 w-[34px] h-[20px] rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-accent' : 'bg-base-500'
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[14px]' : ''
        }`}
      />
    </button>
  )
}

// --- the two sections that live here -----------------------------------------

function GeneralSection(): JSX.Element {
  const settings = useRepoStore((s) => s.settings)
  const update = useRepoStore((s) => s.updateSettings)
  return (
    <>
      <SectionTitle>Remotes</SectionTitle>
      <Card>
        <Row label="Auto-fetch interval" hint="Fetches all remotes in the background.">
          <select
            value={settings.autoFetchMinutes}
            onChange={(e) => void update({ autoFetchMinutes: Number(e.target.value) })}
            className={inputClass}
          >
            {FETCH_INTERVALS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Off' : `Every ${n} min`}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Default pull behaviour" hint="What the Pull button does when clicked.">
          <select
            value={settings.pullMode}
            onChange={(e) => void update({ pullMode: e.target.value as typeof settings.pullMode })}
            className={inputClass}
          >
            <option value="ff">Merge (fast-forward if possible)</option>
            <option value="ff-only">Fast-forward only</option>
            <option value="rebase">Rebase</option>
          </select>
        </Row>
      </Card>

      <SectionTitle>History</SectionTitle>
      <Card>
        <Row label="Commits to load" hint="The graph is virtualized, so higher is fine.">
          <select
            value={settings.commitLimit}
            onChange={(e) => void update({ commitLimit: Number(e.target.value) })}
            className={inputClass}
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </Row>
      </Card>

      <SectionTitle>Startup &amp; safety</SectionTitle>
      <Card>
        <Row label="Reopen last repositories" hint="Bring back this profile's tabs on launch.">
          <Check
            checked={settings.reopenLastRepo}
            onChange={(v) => void update({ reopenLastRepo: v })}
          />
        </Row>
        <Row
          label="Confirm before discarding"
          hint="Ask before throwing away working-tree changes."
        >
          <Check
            checked={settings.confirmDiscard}
            onChange={(v) => void update({ confirmDiscard: v })}
          />
        </Row>
      </Card>
    </>
  )
}

function AppearanceSection(): JSX.Element {
  const settings = useRepoStore((s) => s.settings)
  const update = useRepoStore((s) => s.updateSettings)
  return (
    <>
      <SectionTitle>Theme</SectionTitle>
      <Card>
        <Row label="Accent color" hint="Buttons, selection and focus rings.">
          <div className="flex gap-2">
            {ACCENTS.map((a) => {
              const on = settings.accent === a.key
              return (
                <button
                  key={a.key}
                  onClick={() => void update({ accent: a.key })}
                  title={a.label}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                    on ? 'ring-2 ring-offset-2 ring-offset-base-800 ring-txt-bright' : ''
                  }`}
                  style={{ background: `rgb(${a.rgb})` }}
                />
              )
            })}
          </div>
        </Row>
        <Row label="Author avatars (Gravatar)" hint="Off = generated identicons only, no network.">
          <Check checked={settings.avatars} onChange={(v) => void update({ avatars: v })} />
        </Row>
      </Card>

      <SectionTitle>Diffs</SectionTitle>
      <Card>
        <Row label="Diff layout" hint="Remembered across sessions.">
          <div className="flex rounded-md border border-edge overflow-hidden">
            {(
              [
                ['line-by-line', 'Unified'],
                ['side-by-side', 'Side by side']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void update({ diffFormat: value })}
                className={`h-[28px] px-3 text-[12px] ${
                  settings.diffFormat === value
                    ? 'bg-accent text-white'
                    : 'bg-base-900 text-txt-muted hover:text-txt'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
      </Card>
    </>
  )
}

// --- the dialog --------------------------------------------------------------

export default function SettingsDialog(): JSX.Element | null {
  const open = useRepoStore((s) => s.settingsOpen)
  const setOpen = useRepoStore((s) => s.setSettingsOpen)
  const tab = useRepoStore((s) => s.settingsTab)
  const loadSsh = useRepoStore((s) => s.loadSsh)
  const loadIdentity = useRepoStore((s) => s.loadIdentity)
  const profiles = useRepoStore((s) => s.profiles)
  const activeProfileId = useRepoStore((s) => s.activeProfileId)
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  const close = (): void => setOpen(false)
  const page = TABS.find((t) => t.key === active) ?? TABS[0]
  const profile = profiles.find((p) => p.id === activeProfileId)

  return (
    <div
      className="fixed inset-0 z-[66] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onMouseDown={close}
    >
      <div
        className="w-[920px] max-w-[94vw] h-[660px] max-h-[90vh] flex rounded-xl border border-edge bg-base-800 shadow-2xl shadow-black/60 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Nav */}
        <nav className="w-[220px] shrink-0 flex flex-col bg-base-900/60 border-r border-edge">
          <div className="px-5 pt-5 pb-4 text-[15px] font-semibold text-txt-bright">Settings</div>
          <div className="flex-1 px-2.5 flex flex-col gap-0.5">
            {TABS.map((t) => {
              const on = active === t.key
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => setActive(t.key)}
                  className={`relative flex items-center gap-3 h-9 px-3 rounded-md text-left text-[13px] transition-colors ${
                    on
                      ? 'bg-accent/15 text-txt-bright'
                      : 'text-txt-muted hover:bg-white/[0.04] hover:text-txt'
                  }`}
                >
                  {on && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-accent" />
                  )}
                  <Icon className={`text-[15px] shrink-0 ${on ? 'text-accent' : ''}`} />
                  {t.label}
                </button>
              )
            })}
          </div>
          {/* Settings belong to the active profile — say whose they are. */}
          {profile && (
            <div className="m-2.5 flex items-center gap-2.5 rounded-lg border border-edge bg-base-800/80 px-3 py-2.5">
              <Avatar
                email={profile.gitEmail}
                name={profile.name}
                size={26}
                className="rounded-full"
              />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-txt-muted">
                  Editing profile
                </div>
                <div className="truncate text-[12.5px] text-txt-bright">{profile.name}</div>
              </div>
            </div>
          )}
        </nav>

        {/* Page */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-start gap-4 px-7 pt-6 pb-4 border-b border-edge/70">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold text-txt-bright">{page.label}</h2>
              <p className="mt-1 text-[12.5px] text-txt-muted">{page.description}</p>
            </div>
            <button
              onClick={close}
              title="Close (Esc)"
              className="-mr-2 -mt-1 p-1.5 rounded-md text-txt-muted hover:text-txt-bright hover:bg-white/[0.06]"
            >
              <XIcon className="text-[16px]" />
            </button>
          </header>

          <div className="flex-1 overflow-auto px-7 py-5">
            <div className="max-w-[640px]">
              {active === 'profiles' && <ProfilesSection />}
              {active === 'general' && <GeneralSection />}
              {active === 'profile' && <ProfileSection />}
              {active === 'ssh' && <SshSection />}
              {active === 'ai' && <AiSection />}
              {active === 'appearance' && <AppearanceSection />}
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 px-7 py-3 border-t border-edge/70">
            <span className="text-[11.5px] text-txt-muted">
              {active === 'profiles'
                ? 'Edits apply with “Save profile”; switching takes effect at once.'
                : active === 'profile'
                  ? 'These values are written to your git config.'
                  : active === 'ssh'
                    ? 'Keys live in ~/.ssh; pinning writes this repository’s config.'
                    : `Changes are saved automatically${profile ? ` to “${profile.name}”` : ''}.`}
            </span>
            <button onClick={close} className={btn.primary}>
              Done
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
