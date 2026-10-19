import { useEffect, useRef, useState } from 'react'
import { useRepoStore, type SettingsTab } from '@renderer/store/useRepoStore'
import Avatar from '@renderer/components/Identicon/Avatar'
import { CheckIcon, ChevronIcon } from '@renderer/components/icons/RefIcons'
import {
  GearIcon,
  KeyIcon,
  PenIcon,
  PeopleIcon,
  PlusIcon,
  SparkleIcon
} from '@renderer/components/icons/UiIcons'
import type { AiProvider, Profile } from '@shared/types'

// The profile button at the right end of the tab bar and its GitKraken-style
// popover: who you are right now (avatar, commit signature, SSH key, AI),
// a switcher listing every profile, and shortcuts into the
// matching Settings pages. Our own popover, not a native menu — those can't
// show avatars and never match the dark chrome.

const AI_LABEL: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  custom: 'Custom endpoint'
}

/** Profile picture: Gravatar of the profile's email, else an identicon of its name. */
function ProfileAvatar({ p, size }: { p: Profile | undefined; size: number }): JSX.Element {
  return (
    <Avatar email={p?.gitEmail ?? ''} name={p?.name ?? '?'} size={size} className="rounded-full" />
  )
}

function fileName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

export default function ProfileMenu(): JSX.Element | null {
  const profiles = useRepoStore((s) => s.profiles)
  const activeProfileId = useRepoStore((s) => s.activeProfileId)
  const activateProfile = useRepoStore((s) => s.activateProfile)
  const setSettingsOpen = useRepoStore((s) => s.setSettingsOpen)
  const identity = useRepoStore((s) => s.identity)
  const loadIdentity = useRepoStore((s) => s.loadIdentity)
  const ai = useRepoStore((s) => s.settings.ai)

  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Fresh details every time it opens — another profile may have been edited.
  useEffect(() => {
    if (!open) return
    setPicking(false)
    void loadIdentity()
  }, [open, activeProfileId, loadIdentity])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!profiles.length) return null
  const active = profiles.find((p) => p.id === activeProfileId)

  // What a commit made NOW would be signed with: the open repo's own config,
  // else the global one. (The profile's name/email are only stamped onto repos
  // it clones/creates, so showing those here would misstate existing repos.)
  const sigName = identity?.repoName || identity?.globalName || ''
  const sigEmail = identity?.repoEmail || identity?.globalEmail || ''
  const sigSource = identity?.repoName || identity?.repoEmail ? 'this repo' : 'global git config'

  const go = (tab: SettingsTab): void => {
    setOpen(false)
    setSettingsOpen(true, tab)
  }

  const label = 'text-[10.5px] font-medium uppercase tracking-wider text-txt-muted/80'
  const action =
    'flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[12.5px] text-txt hover:bg-white/[0.06] hover:text-txt-bright'

  return (
    <div ref={rootRef} className="relative flex items-center pr-2">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Profile: ${active?.name ?? '—'}`}
        className={`flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-md text-[12px] max-w-[200px] ${
          open ? 'bg-base-700 text-txt-bright' : 'text-txt hover:bg-base-800 hover:text-txt-bright'
        }`}
      >
        <ProfileAvatar p={active} size={20} />
        <span className="truncate">{active?.name ?? 'Profile'}</span>
        <ChevronIcon
          className={`text-[10px] text-txt-muted shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>

      {open && (
        <div className="absolute right-2 top-full mt-1.5 z-50 w-[310px] rounded-lg border border-edge bg-base-800 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Current profile + switcher */}
          <div className="px-3 pt-3 pb-2">
            <div className={`${label} mb-2`}>Current profile</div>
            <button
              onClick={() => setPicking((v) => !v)}
              className={`flex items-center gap-2.5 w-full h-11 px-2.5 rounded-md border text-left ${
                picking
                  ? 'border-accent/70 bg-base-700'
                  : 'border-edge bg-base-900/60 hover:border-accent/50'
              }`}
            >
              <ProfileAvatar p={active} size={28} />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-txt-bright">{active?.name}</span>
                {active?.gitEmail && (
                  <span className="block truncate text-[11px] text-txt-muted">
                    {active.gitEmail}
                  </span>
                )}
              </span>
              <ChevronIcon
                className={`text-[11px] text-txt-muted shrink-0 transition-transform ${picking ? '-rotate-90' : 'rotate-90'}`}
              />
            </button>

            {picking && (
              <div className="mt-1 rounded-md border border-edge bg-base-900/80 py-1 max-h-[260px] overflow-auto">
                {profiles.map((p) => {
                  const isActive = p.id === activeProfileId
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setOpen(false)
                        if (!isActive) void activateProfile(p.id)
                      }}
                      className={`flex items-center gap-2.5 w-full h-10 px-2.5 text-left ${
                        isActive ? 'bg-accent/15' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <ProfileAvatar p={p} size={24} />
                      <span className="flex-1 min-w-0">
                        <span
                          className={`block truncate text-[12.5px] ${isActive ? 'text-txt-bright font-medium' : 'text-txt'}`}
                        >
                          {p.name}
                        </span>
                        {p.gitEmail && (
                          <span className="block truncate text-[10.5px] text-txt-muted">
                            {p.gitEmail}
                          </span>
                        )}
                      </span>
                      {isActive && <CheckIcon className="text-[13px] text-accent shrink-0" />}
                    </button>
                  )
                })}
                <div className="my-1 border-t border-edge/70" />
                <button
                  onClick={() => go('profiles')}
                  className="flex items-center gap-2.5 w-full h-8 px-2.5 text-[12px] text-txt-muted hover:text-txt hover:bg-white/[0.06]"
                >
                  <PlusIcon className="text-[13px] w-6 shrink-0" />
                  New profile…
                </button>
              </div>
            )}
          </div>

          {/* What this profile does on your behalf */}
          <div className="px-3 pb-2 flex flex-col gap-2.5">
            <div>
              <div className={label}>Commit signature</div>
              {sigName || sigEmail ? (
                <div className="mt-1 pl-0.5">
                  <div className="text-[12.5px] text-txt-bright truncate">{sigName || '—'}</div>
                  <div className="text-[11.5px] text-txt-muted truncate">
                    {sigEmail || 'no email set'}
                    <span className="text-txt-muted/60"> · {sigSource}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-1 pl-0.5 text-[12px] text-warn">
                  Not set — commits will fail.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[12px]">
              <KeyIcon className="text-[13px] text-txt-muted shrink-0" />
              <span className="text-txt-muted">SSH key</span>
              <span
                className="ml-auto truncate font-mono text-[11.5px] text-txt"
                title={active?.sshKeyPath ?? ''}
              >
                {active?.sshKeyPath ? fileName(active.sshKeyPath) : 'system default'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[12px]">
              <SparkleIcon className="text-[13px] text-txt-muted shrink-0" />
              <span className="text-txt-muted">AI</span>
              <span className="ml-auto flex items-center gap-1.5 text-txt">
                {ai.enabled ? AI_LABEL[ai.provider] : 'Off'}
                <span
                  className={`w-1.5 h-1.5 rounded-full ${ai.enabled ? 'bg-good' : 'bg-txt-muted/50'}`}
                />
              </span>
            </div>
          </div>

          {/* Shortcuts */}
          <div className="border-t border-edge p-1.5">
            <button onClick={() => go('profiles')} className={action}>
              <PeopleIcon className="text-[14px] text-txt-muted" />
              Manage profiles
            </button>
            <button onClick={() => go('profile')} className={action}>
              <PenIcon className="text-[14px] text-txt-muted" />
              Git identity &amp; signing
            </button>
            <button onClick={() => go('ssh')} className={action}>
              <KeyIcon className="text-[14px] text-txt-muted" />
              SSH keys
            </button>
            <button onClick={() => go('ai')} className={action}>
              <SparkleIcon className="text-[14px] text-txt-muted" />
              AI settings
            </button>
            <div className="my-1 border-t border-edge/70" />
            <button onClick={() => go('general')} className={action}>
              <GearIcon className="text-[14px] text-txt-muted" />
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
