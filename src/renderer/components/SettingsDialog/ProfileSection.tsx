import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import { Check, Row, btn, inputClass } from './SettingsDialog'
import LoadFailure from './LoadFailure'

// Settings > Git profile: the identity git stamps on commits. The global values
// are the account-wide default; the two repo fields write repository-local
// overrides (empty = inherit the global one), exactly like `git config --local`.

export default function ProfileSection(): JSX.Element {
  const identity = useRepoStore((s) => s.identity)
  const error = useRepoStore((s) => s.identityError)
  const reload = useRepoStore((s) => s.loadIdentity)
  const save = useRepoStore((s) => s.saveIdentity)
  const ref = useRepoStore((s) => s.ref)
  const [draft, setDraft] = useState({
    globalName: '',
    globalEmail: '',
    repoName: '',
    repoEmail: '',
    signingKey: ''
  })

  useEffect(() => {
    if (!identity) return
    setDraft({
      globalName: identity.globalName ?? '',
      globalEmail: identity.globalEmail ?? '',
      repoName: identity.repoName ?? '',
      repoEmail: identity.repoEmail ?? '',
      signingKey: identity.signingKey ?? ''
    })
  }, [identity])

  if (!identity) {
    if (error)
      return <LoadFailure what="your git config" error={error} onRetry={() => void reload()} />
    return <div className="text-[12px] text-txt-muted">Reading git config…</div>
  }

  const dirty =
    draft.globalName !== (identity.globalName ?? '') ||
    draft.globalEmail !== (identity.globalEmail ?? '') ||
    draft.repoName !== (identity.repoName ?? '') ||
    draft.repoEmail !== (identity.repoEmail ?? '') ||
    draft.signingKey !== (identity.signingKey ?? '')

  const field = (key: keyof typeof draft, placeholder: string): JSX.Element => (
    <input
      value={draft[key]}
      placeholder={placeholder}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      className={`${inputClass} w-[260px]`}
    />
  )

  return (
    <div className="flex flex-col">
      <div className="mb-2 mt-6 first:mt-0 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-txt-muted/90">
        Global identity (git config --global)
      </div>
      <div className="rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60">
        <Row label="Name" hint="Shown as the author of your commits.">
          {field('globalName', 'Your Name')}
        </Row>
        <Row label="Email" hint="Match it with your git host account to get credit for commits.">
          {field('globalEmail', 'you@example.com')}
        </Row>
      </div>

      <div className="mb-2 mt-6 first:mt-0 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-txt-muted/90">
        This repository {ref ? `(${ref.name})` : ''}
      </div>
      {ref ? (
        <div className="rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60">
          <Row label="Name override" hint="Leave empty to use the global name.">
            {field('repoName', identity.globalName ?? '(global)')}
          </Row>
          <Row label="Email override" hint="Useful for work vs. personal repos.">
            {field('repoEmail', identity.globalEmail ?? '(global)')}
          </Row>
        </div>
      ) : (
        <div className="text-[12px] text-txt-muted py-2">Open a repository to set an override.</div>
      )}

      <div className="mb-2 mt-6 first:mt-0 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-txt-muted/90">
        Signing
      </div>
      <div className="rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60">
        <Row label="Signing key" hint="GPG key id, or the path to an SSH signing key.">
          {field('signingKey', 'none')}
        </Row>
        <Row label="Sign every commit" hint="Sets commit.gpgsign — the Commit panel follows it.">
          <Check
            checked={identity.signByDefault}
            onChange={(v) => void save({ signByDefault: v })}
          />
        </Row>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          disabled={!dirty}
          onClick={() =>
            void save({
              globalName: draft.globalName,
              globalEmail: draft.globalEmail,
              ...(ref ? { repoName: draft.repoName, repoEmail: draft.repoEmail } : {}),
              signingKey: draft.signingKey
            })
          }
          className={btn.primary}
        >
          Save identity
        </button>
        {dirty && <span className="text-[11px] text-txt-muted">Unsaved changes</span>}
      </div>
    </div>
  )
}
