import { useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import ContextMenu, { type MenuState } from '@renderer/components/ContextMenu/ContextMenu'

// GitKraken-style tab strip: one tab per open repository plus a "+" that shows
// the Repositories screen. Only the active repo is actually open in main (one
// gitService, one watcher) — a tab switch re-opens it, which is why the tab
// shows a spinner while it loads.

function RepoIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" className="shrink-0" aria-hidden>
      <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878ZM11 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm-3 10a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z" />
    </svg>
  )
}

export default function TabBar(): JSX.Element | null {
  const tabs = useRepoStore((s) => s.tabs)
  const ref = useRepoStore((s) => s.ref)
  const pickerOpen = useRepoStore((s) => s.pickerOpen)
  const openPicker = useRepoStore((s) => s.openPicker)
  const activateTab = useRepoStore((s) => s.activateTab)
  const closeTab = useRepoStore((s) => s.closeTab)
  const loading = useRepoStore((s) => s.loading)
  const profiles = useRepoStore((s) => s.profiles)
  const activeProfileId = useRepoStore((s) => s.activeProfileId)
  const activateProfile = useRepoStore((s) => s.activateProfile)
  const setSettingsOpen = useRepoStore((s) => s.setSettingsOpen)
  const [menu, setMenu] = useState<MenuState | null>(null)

  // The bar also has to exist while only the placeholder tab is there.
  if (!tabs.length && !pickerOpen) return null
  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  return (
    <div className="flex items-stretch h-9 bg-base-900 border-b border-edge shrink-0 select-none">
      <div className="flex items-stretch overflow-x-auto">
        {tabs.map((t) => {
          const active = !pickerOpen && ref?.path === t.path
          return (
            <div
              key={t.path}
              onClick={() => void activateTab(t.path)}
              title={t.path}
              className={`group flex items-center gap-2 pl-3 pr-2 min-w-[140px] max-w-[220px] border-r border-edge cursor-pointer ${
                active
                  ? 'bg-base-800 text-txt-bright border-b-2 border-b-accent'
                  : 'text-txt-muted hover:bg-base-800/60'
              }`}
            >
              <RepoIcon />
              <span className="truncate text-[12px] flex-1">{t.name}</span>
              {active && loading ? (
                <svg className="animate-spin shrink-0" width="11" height="11" viewBox="0 0 50 50" aria-hidden>
                  <circle cx="25" cy="25" r="20" fill="none" strokeWidth="6" className="stroke-base-600" opacity="0.4" />
                  <circle
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="80 200"
                    className="stroke-accent"
                  />
                </svg>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTab(t.path)
                  }}
                  title="Close tab"
                  className="shrink-0 w-4 h-4 rounded opacity-0 group-hover:opacity-100 text-txt-muted hover:text-txt hover:bg-base-600 leading-none"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
        {/* Placeholder tab: the "+" opens a tab that has no repository yet, and
            it keeps its slot in the strip until one is picked. */}
        {pickerOpen && (
          <div className="group flex items-center gap-2 pl-3 pr-2 min-w-[140px] max-w-[220px] border-r border-edge bg-base-800 text-txt-bright border-b-2 border-b-accent">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" className="shrink-0" aria-hidden>
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
            </svg>
            <span className="truncate text-[12px] flex-1 italic">New tab</span>
            {tabs.length > 0 && (
              <button
                onClick={() => openPicker(false)}
                title="Close tab"
                className="shrink-0 w-4 h-4 rounded opacity-0 group-hover:opacity-100 text-txt-muted hover:text-txt hover:bg-base-600 leading-none"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => openPicker(true)}
        disabled={pickerOpen}
        title="Open another repository"
        className="flex items-center justify-center w-9 shrink-0 border-r border-edge text-txt-muted hover:bg-base-800/60 disabled:opacity-30"
      >
        +
      </button>

      <div className="flex-1" />

      {/* The active profile decides which SSH key and settings are in play.
          A native <select> pops an OS-drawn list that never matches the dark
          chrome, so this is our own menu — same one the graph/sidebar use. */}
      {profiles.length > 0 && (
        <div className="flex items-center pr-2">
          <button
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenu({
                // Right-aligned under the button, clamped inside the window.
                x: Math.max(4, Math.min(r.right - 190, window.innerWidth - 194)),
                y: r.bottom + 4,
                items: [
                  ...profiles.map((p) => ({
                    label: `${p.id === activeProfileId ? '✓ ' : '  '}${p.name}`,
                    onClick: () => {
                      if (p.id !== activeProfileId) void activateProfile(p.id)
                    }
                  })),
                  { separator: true },
                  { label: 'Manage profiles…', onClick: () => setSettingsOpen(true, 'profiles') }
                ]
              })
            }}
            title={
              activeProfile?.sshKeyPath
                ? `Profile: ${activeProfile.name}\nSSH key: ${activeProfile.sshKeyPath}`
                : `Profile: ${activeProfile?.name ?? '—'}\nNo SSH key set for this profile`
            }
            className={`flex items-center gap-1.5 h-6 px-2 rounded border text-[11px] max-w-[180px] ${
              menu
                ? 'border-accent text-txt-bright bg-base-800'
                : 'border-edge text-txt-muted hover:text-txt hover:bg-base-800'
            }`}
          >
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" className="shrink-0" aria-hidden>
              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-2.9 0-5.25 1.6-5.25 3.25 0 .69.56 1.25 1.25 1.25h8c.69 0 1.25-.56 1.25-1.25C13.25 11.1 10.9 9.5 8 9.5Z" />
            </svg>
            <span className="truncate">{activeProfile?.name ?? 'Profile'}</span>
            <span className="text-txt-muted text-[9px] leading-none shrink-0">▼</span>
          </button>
        </div>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
