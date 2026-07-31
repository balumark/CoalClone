import { useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'

// Clone / Create, sharing one dialog because they only differ by the URL field.
// Both land in <parent folder>/<name> and both run under the active profile.

export type NewRepoMode = 'clone' | 'create'

/** `git@host:owner/repo.git` / `https://host/owner/repo` → `repo`. */
function nameFromUrl(url: string): string {
  const clean = url.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const last = clean.split(/[/:]/).pop() ?? ''
  return /^[\w.-]+$/.test(last) ? last : ''
}

export default function NewRepoDialog({
  mode,
  onClose
}: {
  mode: NewRepoMode
  onClose: () => void
}): JSX.Element {
  const cloneRepo = useRepoStore((s) => s.cloneRepo)
  const createRepo = useRepoStore((s) => s.createRepo)
  const pickFolder = useRepoStore((s) => s.pickFolder)
  const loading = useRepoStore((s) => s.loading)
  const profiles = useRepoStore((s) => s.profiles)
  const activeProfileId = useRepoStore((s) => s.activeProfileId)

  const [url, setUrl] = useState('')
  // Prefilled with the last clone/create target — same folder nearly every time.
  const [parentDir, setParentDir] = useState(useRepoStore.getState().settings.cloneDir)
  const [name, setName] = useState('')
  // Once the name is edited by hand, stop overwriting it from the URL.
  const [nameTouched, setNameTouched] = useState(false)

  const profile = profiles.find((p) => p.id === activeProfileId)
  const cloning = mode === 'clone'
  const ready = !!parentDir && !!name.trim() && (!cloning || !!url.trim())

  const submit = async (): Promise<void> => {
    if (!ready || loading) return
    const opts = { url: url.trim(), parentDir, name: name.trim() }
    const done = cloning ? await cloneRepo(opts) : await createRepo(opts)
    if (done) onClose()
  }

  const label = 'text-[12px] text-txt mb-1'
  const input =
    'w-full bg-base-900 border border-edge rounded px-2 py-1.5 text-[12px] text-txt outline-none focus:border-accent'

  return (
    <div
      className="fixed inset-0 z-[66] flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[520px] rounded-lg border border-edge bg-base-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge">
          <div className="text-[13px] text-txt-bright font-medium">
            {cloning ? 'Clone a repository' : 'Create a repository'}
          </div>
          <div className="text-[11px] text-txt-muted mt-0.5">
            {cloning
              ? `Authenticated with the ${profile?.name ?? 'active'} profile's SSH key.`
              : 'Starts an empty repository on the main branch.'}
          </div>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {cloning && (
            <div>
              <div className={label}>Remote URL</div>
              <input
                autoFocus
                value={url}
                placeholder="git@github.com:owner/repo.git"
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (!nameTouched) setName(nameFromUrl(e.target.value))
                }}
                className={input}
              />
            </div>
          )}

          <div>
            <div className={label}>Where to put it</div>
            <div className="flex gap-2">
              <input
                value={parentDir}
                readOnly
                placeholder="Pick a parent folder…"
                className={`${input} flex-1 text-txt-muted font-mono`}
              />
              <button
                onClick={async () => {
                  const dir = await pickFolder(parentDir || undefined)
                  if (dir) setParentDir(dir)
                }}
                className="px-3 rounded border border-edge text-[12px] text-txt hover:bg-base-700"
              >
                Browse…
              </button>
            </div>
          </div>

          <div>
            <div className={label}>Folder name</div>
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
              className={input}
            />
            {parentDir && name.trim() && (
              <div className="mt-1 text-[11px] text-txt-muted font-mono truncate">
                → {parentDir}
                {parentDir.includes('/') ? '/' : '\\'}
                {name.trim()}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-edge flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-edge text-[12px] text-txt hover:bg-base-600"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!ready || loading}
            className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cloning ? 'Clone' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
