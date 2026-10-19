import { useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import type { SshKey } from '@shared/types'
import { AlertIcon, KeyIcon, PlusIcon } from '@renderer/components/icons/UiIcons'
import { Card, SectionTitle, btn, inputClass } from './SettingsDialog'
import LoadFailure from './LoadFailure'

// Settings > SSH & auth. This is the "make git authentication work" screen: it
// shows the keys the OS ssh (the one this app shells out to) can actually see,
// whether the agent holds them, and which key THIS repository is pinned to via
// core.sshCommand. Every dead end the Remote Diagnostics dialog can report has a
// button here: generate a key, copy the public half, load it into the agent, or
// bind a key to the open repo.

function Badge({
  tone,
  children
}: {
  tone: 'muted' | 'good' | 'accent'
  children: React.ReactNode
}): JSX.Element {
  const cls =
    tone === 'good'
      ? 'bg-good/15 text-good'
      : tone === 'accent'
        ? 'bg-accent/20 text-accent'
        : 'bg-base-600 text-txt-muted'
  return (
    <span
      className={`inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-medium shrink-0 ${cls}`}
    >
      {children}
    </span>
  )
}

function KeyCard({ k }: { k: SshKey }): JSX.Element {
  const copyText = useRepoStore((s) => s.copyText)
  const addKeyToAgent = useRepoStore((s) => s.addKeyToAgent)
  const pinRepoKey = useRepoStore((s) => s.pinRepoKey)
  const deleteKey = useRepoStore((s) => s.deleteSshKey)
  const ref = useRepoStore((s) => s.ref)

  return (
    <div
      className={`rounded-lg border p-3.5 flex gap-3 ${
        k.usedByRepo ? 'border-accent/50 bg-accent/[0.06]' : 'border-edge bg-base-900/40'
      }`}
    >
      <div
        className={`w-9 h-9 shrink-0 rounded-md flex items-center justify-center ${
          k.usedByRepo ? 'bg-accent/20 text-accent' : 'bg-base-700 text-txt-muted'
        }`}
      >
        <KeyIcon className="text-[16px]" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-[13px] text-txt-bright truncate">{k.name}</span>
            {k.type && <Badge tone="muted">{k.type}</Badge>}
            {k.inAgent && <Badge tone="good">in agent</Badge>}
            {k.usedByRepo && <Badge tone="accent">used by this repo</Badge>}
          </div>
          <div
            className="mt-0.5 text-[11px] text-txt-muted font-mono truncate"
            title={`${k.fingerprint ?? ''}${k.comment ? `\n${k.comment}` : ''}`}
          >
            {k.comment && <span className="text-txt">{k.comment}</span>}
            {k.comment && ' · '}
            {k.fingerprint ?? 'fingerprint unavailable'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            disabled={!k.publicKey}
            onClick={() => void copyText(k.publicKey ?? '', 'public key')}
            title={k.publicKey ?? 'No .pub file next to this key'}
            className={btn.small}
          >
            Copy public key
          </button>
          <button
            disabled={k.inAgent}
            onClick={() => void addKeyToAgent(k.path)}
            className={btn.small}
          >
            Add to agent
          </button>
          {ref &&
            (k.usedByRepo ? (
              <button onClick={() => void pinRepoKey(null)} className={btn.small}>
                Unpin from repo
              </button>
            ) : (
              <button
                onClick={() => void pinRepoKey(k.path)}
                className="inline-flex items-center h-7 px-2.5 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover"
              >
                Use for this repo
              </button>
            ))}
          <button
            onClick={() => void deleteKey(k)}
            title="Move this key pair to the trash"
            className="ml-auto inline-flex items-center h-7 px-2.5 rounded-md text-[11.5px] text-bad/90 hover:bg-bad/10 hover:text-bad"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function GenerateForm({
  defaultComment,
  onClose
}: {
  defaultComment: string
  onClose: () => void
}): JSX.Element {
  const generate = useRepoStore((s) => s.generateSshKey)
  const [name, setName] = useState('id_ed25519')
  const [comment, setComment] = useState(defaultComment)
  const [type, setType] = useState<'ed25519' | 'rsa'>('ed25519')
  const [working, setWorking] = useState(false)

  return (
    <div className="rounded-lg border border-accent/40 bg-base-900/40 p-4 flex flex-col gap-3">
      <div className="text-[13px] font-medium text-txt-bright">New SSH key</div>
      <div className="grid grid-cols-[1fr_1.6fr_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="file name"
          className={inputClass}
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="comment (usually your email)"
          className={inputClass}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'ed25519' | 'rsa')}
          className={inputClass}
        >
          <option value="ed25519">ed25519</option>
          <option value="rsa">rsa 4096</option>
        </select>
      </div>
      <div className="text-[11.5px] text-txt-muted leading-snug">
        Created without a passphrase so git never stops to ask — the private key stays in your
        ~/.ssh, only the public half goes to the git host.
      </div>
      <div className="flex gap-2">
        <button
          disabled={working || !name.trim()}
          onClick={async () => {
            setWorking(true)
            await generate({ name: name.trim(), comment, type })
            setWorking(false)
            onClose()
          }}
          className={btn.primary}
        >
          {working ? 'Generating…' : 'Generate key'}
        </button>
        <button onClick={onClose} className={btn.secondary}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function SshSection(): JSX.Element {
  const ssh = useRepoStore((s) => s.ssh)
  const loading = useRepoStore((s) => s.sshLoading)
  const error = useRepoStore((s) => s.sshError)
  const reload = useRepoStore((s) => s.loadSsh)
  const identity = useRepoStore((s) => s.identity)
  const openExternal = useRepoStore((s) => s.openExternal)
  const diagnose = useRepoStore((s) => s.openRemoteDiagnostics)
  const ref = useRepoStore((s) => s.ref)
  const [generating, setGenerating] = useState(false)

  if (!ssh) {
    if (error)
      return <LoadFailure what="your SSH keys" error={error} onRetry={() => void reload()} />
    return (
      <div className="text-[12px] text-txt-muted">
        {loading ? 'Reading ~/.ssh…' : 'Not loaded.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Agent status */}
      {ssh.agentRunning ? (
        <div className="flex items-center gap-2 text-[12px] text-txt-muted mb-4">
          <span className="w-2 h-2 rounded-full bg-good" />
          ssh-agent is running
        </div>
      ) : (
        <div className="flex gap-3 rounded-lg border border-warn/40 bg-warn/[0.08] p-3.5 mb-4">
          <AlertIcon className="text-[16px] text-warn shrink-0 mt-0.5" />
          <div className="min-w-0 text-[12px] leading-relaxed">
            <div className="text-txt-bright font-medium">ssh-agent is not available</div>
            <div className="text-txt-muted select-text break-words">
              {ssh.agentMessage ?? 'Keys still work when pinned to a profile or repo.'}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between gap-3 mb-2">
        <SectionTitle>
          Keys in <span className="normal-case tracking-normal font-mono">{ssh.dir}</span>
        </SectionTitle>
        <div className="flex gap-1.5 shrink-0 mb-2">
          {ref && (
            <button onClick={() => void diagnose()} className={btn.small}>
              Test connection
            </button>
          )}
          <button onClick={() => void reload()} className={btn.small}>
            Refresh
          </button>
        </div>
      </div>

      {ssh.keys.length === 0 ? (
        <Card className="py-4 text-[12px] text-txt">
          No SSH keys in {ssh.dir}. Generate one below, then add its public half to your git host —
          git can&apos;t authenticate over SSH without it.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {ssh.keys.map((k) => (
            <KeyCard key={k.path} k={k} />
          ))}
        </div>
      )}

      <div className="mt-4">
        {generating ? (
          <GenerateForm
            defaultComment={identity?.globalEmail ?? ''}
            onClose={() => setGenerating(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setGenerating(true)} className={btn.primary}>
              <PlusIcon className="text-[13px]" />
              Generate new key
            </button>
            <div className="flex-1" />
            <button
              onClick={() => void openExternal('https://github.com/settings/ssh/new')}
              className={btn.small}
            >
              Add key on GitHub ↗
            </button>
            <button
              onClick={() => void openExternal('https://gitlab.com/-/user_settings/ssh_keys')}
              className={btn.small}
            >
              Add key on GitLab ↗
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-[11.5px] text-txt-muted leading-relaxed">
        This app runs the operating system&apos;s git and ssh, so only the keys above are used — a
        repository you normally work with inside WSL relies on WSL&apos;s own ~/.ssh, which is a
        different directory. Pinning a key with <span className="font-mono">Use for this repo</span>{' '}
        writes <span className="font-mono">core.sshCommand</span> into the repository&apos;s config.
        {ssh.repoSshCommand && (
          <>
            {' '}
            Current value: <span className="font-mono text-txt">{ssh.repoSshCommand}</span>
          </>
        )}
      </p>
    </div>
  )
}
