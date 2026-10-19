import { useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import type { SshKey } from '@shared/types'
import { inputClass } from './SettingsDialog'
import LoadFailure from './LoadFailure'

// Settings > SSH & auth. This is the "make git authentication work" screen: it
// shows the keys the OS ssh (the one this app shells out to) can actually see,
// whether the agent holds them, and which key THIS repository is pinned to via
// core.sshCommand. Every dead end the Remote Diagnostics dialog can report has a
// button here: generate a key, copy the public half, load it into the agent, or
// bind a key to the open repo.

function KeyCard({ k }: { k: SshKey }): JSX.Element {
  const copyText = useRepoStore((s) => s.copyText)
  const addKeyToAgent = useRepoStore((s) => s.addKeyToAgent)
  const pinRepoKey = useRepoStore((s) => s.pinRepoKey)
  const deleteKey = useRepoStore((s) => s.deleteSshKey)
  const ref = useRepoStore((s) => s.ref)

  return (
    <div className="rounded border border-edge p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[12px] text-txt-bright truncate">{k.name}</span>
        {k.type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-700 text-txt-muted shrink-0">
            {k.type}
          </span>
        )}
        {k.inAgent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-good/15 text-good shrink-0">
            in agent
          </span>
        )}
        {k.usedByRepo && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0">
            used by this repo
          </span>
        )}
      </div>
      <div className="text-[11px] text-txt-muted font-mono truncate" title={k.fingerprint ?? ''}>
        {k.fingerprint ?? 'fingerprint unavailable'}
        {k.comment ? ` · ${k.comment}` : ''}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          disabled={!k.publicKey}
          onClick={() => void copyText(k.publicKey ?? '', 'public key')}
          title={k.publicKey ?? 'No .pub file next to this key'}
          className="px-2 py-1 rounded text-[11px] border border-edge text-txt hover:bg-base-700 disabled:opacity-40"
        >
          Copy public key
        </button>
        <button
          disabled={k.inAgent}
          onClick={() => void addKeyToAgent(k.path)}
          className="px-2 py-1 rounded text-[11px] border border-edge text-txt hover:bg-base-700 disabled:opacity-40"
        >
          Add to agent
        </button>
        {ref &&
          (k.usedByRepo ? (
            <button
              onClick={() => void pinRepoKey(null)}
              className="px-2 py-1 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
            >
              Unpin from repo
            </button>
          ) : (
            <button
              onClick={() => void pinRepoKey(k.path)}
              className="px-2 py-1 rounded text-[11px] bg-accent text-white hover:bg-accent-hover"
            >
              Use for this repo
            </button>
          ))}
        <button
          onClick={() => void deleteKey(k)}
          title="Move this key pair to the trash"
          className="ml-auto px-2 py-1 rounded text-[11px] border border-bad/40 text-bad hover:bg-bad/10"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function GenerateForm({ defaultComment }: { defaultComment: string }): JSX.Element {
  const generate = useRepoStore((s) => s.generateSshKey)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('id_ed25519')
  const [comment, setComment] = useState(defaultComment)
  const [type, setType] = useState<'ed25519' | 'rsa'>('ed25519')
  const [working, setWorking] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover"
      >
        Generate new SSH key
      </button>
    )
  }
  return (
    <div className="rounded border border-edge p-3 flex flex-col gap-2">
      <div className="text-[12px] text-txt-bright">New SSH key</div>
      <div className="flex gap-2 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="file name"
          className={`${inputClass} w-[160px]`}
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="comment (usually your email)"
          className={`${inputClass} flex-1 min-w-[180px]`}
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
      <div className="text-[11px] text-txt-muted">
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
            setOpen(false)
          }}
          className="px-3 py-1 rounded bg-accent text-white text-[12px] hover:bg-accent-hover disabled:opacity-40"
        >
          {working ? 'Generating…' : 'Generate'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1 rounded text-[12px] text-txt-muted hover:bg-base-700"
        >
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-txt">Keys in {ssh.dir}</div>
          <div className="text-[11px] text-txt-muted">
            {ssh.agentRunning
              ? 'ssh-agent is running.'
              : (ssh.agentMessage ?? 'ssh-agent is not available.')}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {ref && (
            <button
              onClick={() => void diagnose()}
              className="px-2 py-1 rounded text-[11px] border border-edge text-txt hover:bg-base-700"
            >
              Test connection
            </button>
          )}
          <button
            onClick={() => void reload()}
            className="px-2 py-1 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {ssh.keys.length === 0 ? (
        <div className="rounded border border-warn/40 bg-warn/10 p-3 text-[12px] text-txt">
          No SSH keys in {ssh.dir}. Generate one below, then add its public half to your git host —
          git can&apos;t authenticate over SSH without it.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ssh.keys.map((k) => (
            <KeyCard key={k.path} k={k} />
          ))}
        </div>
      )}

      <GenerateForm defaultComment={identity?.globalEmail ?? ''} />

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => void openExternal('https://github.com/settings/ssh/new')}
          className="px-2 py-1 rounded text-[11px] border border-edge text-txt hover:bg-base-700"
        >
          Add key on GitHub ↗
        </button>
        <button
          onClick={() => void openExternal('https://gitlab.com/-/user_settings/ssh_keys')}
          className="px-2 py-1 rounded text-[11px] border border-edge text-txt hover:bg-base-700"
        >
          Add key on GitLab ↗
        </button>
      </div>

      <p className="text-[11px] text-txt-muted leading-relaxed">
        This app runs the operating system&apos;s git and ssh, so only the keys above are used — a
        repository you normally work with inside WSL relies on WSL&apos;s own ~/.ssh, which is a
        different directory. Pinning a key with <span className="font-mono">Use for this repo</span>{' '}
        writes <span className="font-mono">core.sshCommand</span> into the repository&apos;s config.
        {ssh.repoSshCommand && (
          <>
            {' '}
            Current value: <span className="font-mono">{ssh.repoSshCommand}</span>
          </>
        )}
      </p>
    </div>
  )
}
