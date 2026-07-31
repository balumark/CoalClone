import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { SshKey, SshEnvironment } from '@shared/types'
import { GitError, gitService } from './gitService'

// ---------------------------------------------------------------------------
// SSH authentication: the keys in ~/.ssh, the agent that holds them, and which
// key the open repo is pinned to. This is what turns the Remote Diagnostics
// "Permission denied (publickey)" dead end into something the user can fix from
// inside the app: generate a key, copy the public half, load it into the agent,
// or point this repository at a specific key.
//
// Everything here shells out to the OS `ssh-keygen` / `ssh-add` (the same
// binaries git itself uses), so what the app reports is what git will do.
// ---------------------------------------------------------------------------

export const sshDir = (): string => path.join(os.homedir(), '.ssh')

/** Run a short-lived ssh helper, capturing output instead of throwing. */
function run(
  cmd: string,
  args: string[],
  timeoutMs = 15000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(cmd, args, { windowsHide: true })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: `${stderr}${String(err)}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** `ssh-keygen -l -f <key>` → "256 SHA256:xxxx comment (ED25519)". */
async function describeKey(keyPath: string): Promise<Pick<SshKey, 'fingerprint' | 'type' | 'comment'>> {
  const { code, stdout } = await run('ssh-keygen', ['-l', '-f', keyPath], 8000)
  const m = code === 0 ? stdout.trim().match(/^\d+\s+(\S+)\s+(.*?)\s*\(([^)]+)\)$/) : null
  if (!m) return { fingerprint: null, type: null, comment: null }
  return { fingerprint: m[1], type: m[3], comment: m[2] === 'no comment' ? null : m[2] }
}

/** Fingerprints currently loaded in the agent, or why we couldn't ask. */
async function agentFingerprints(): Promise<{
  running: boolean
  message: string | null
  fingerprints: Set<string>
}> {
  const { code, stdout, stderr } = await run('ssh-add', ['-l'], 8000)
  // ssh-add exits 1 with "The agent has no identities." — that's a *running* agent.
  if (code === 0 || /no identities/i.test(stdout + stderr)) {
    const fps = new Set(
      stdout
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[1])
        .filter((f): f is string => !!f && f.startsWith('SHA256:'))
    )
    return { running: true, message: null, fingerprints: fps }
  }
  // ssh-add's own wording is useless on its own ("Error connecting to agent: No
  // such file or directory"), so always append what to actually do about it.
  const hint =
    process.platform === 'win32'
      ? 'Start it once from an admin PowerShell: Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent'
      : 'Start it with: eval $(ssh-agent -s)'
  const reason = stderr.trim().split('\n')[0] || 'ssh-agent is not running.'
  return { running: false, message: `${reason} — ${hint}`, fingerprints: new Set() }
}

/** Private keys in ~/.ssh: every file with a .pub sibling, plus default names. */
async function keyFiles(): Promise<string[]> {
  const dir = sshDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const pubs = new Set(entries.filter((e) => e.endsWith('.pub')).map((e) => e.slice(0, -4)))
  const names = entries.filter((e) => pubs.has(e))
  for (const def of ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa']) {
    if (entries.includes(def) && !names.includes(def)) names.push(def)
  }
  return names.slice(0, 20)
}

/** The repo's pinned key path, parsed out of `core.sshCommand` (`ssh -i <path>`). */
export function keyFromSshCommand(cmd: string | null): string | null {
  if (!cmd) return null
  const m = cmd.match(/-i\s+"([^"]+)"|-i\s+'([^']+)'|-i\s+(\S+)/)
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}

/** Everything the Settings > SSH section shows, in one call. */
export async function sshEnvironment(): Promise<SshEnvironment> {
  const dir = sshDir()
  const agent = await agentFingerprints()
  const repoSshCommand = gitService.currentRepo
    ? await gitService.getConfig('core.sshCommand', 'local')
    : null
  const pinned = keyFromSshCommand(repoSshCommand)
  const keys: SshKey[] = []
  for (const name of await keyFiles()) {
    const keyPath = path.join(dir, name)
    let publicKey: string | null = null
    try {
      publicKey = (await fs.readFile(`${keyPath}.pub`, 'utf8')).trim()
    } catch {
      publicKey = null // private-only key; ssh-keygen -y could derive it, but that may prompt
    }
    // Fingerprint the .pub when we have one — reading an encrypted private key
    // can block on a passphrase prompt we have no way to answer.
    const info = await describeKey(publicKey ? `${keyPath}.pub` : keyPath)
    keys.push({
      name,
      path: keyPath,
      publicKey,
      ...info,
      inAgent: !!info.fingerprint && agent.fingerprints.has(info.fingerprint),
      usedByRepo: !!pinned && path.normalize(pinned) === path.normalize(keyPath)
    })
  }
  return {
    dir,
    keys,
    agentRunning: agent.running,
    agentMessage: agent.message,
    repoSshCommand
  }
}

/** `ssh-keygen -t <type>` into ~/.ssh/<name>, no passphrase (agent-less friendly). */
export async function generateKey(opts: {
  name: string
  comment: string
  type: 'ed25519' | 'rsa'
}): Promise<SshKey> {
  const name = opts.name.trim()
  if (!/^[\w.-]+$/.test(name)) {
    throw new GitError('Key name may only contain letters, digits, dot, dash and underscore.')
  }
  const dir = sshDir()
  await fs.mkdir(dir, { recursive: true })
  const keyPath = path.join(dir, name)
  const exists = await fs
    .access(keyPath)
    .then(() => true)
    .catch(() => false)
  if (exists) throw new GitError(`${keyPath} already exists — pick another name.`, 'KEY_EXISTS')
  const args = ['-t', opts.type, '-f', keyPath, '-N', '', '-q']
  if (opts.type === 'rsa') args.push('-b', '4096')
  if (opts.comment.trim()) args.push('-C', opts.comment.trim())
  const { code, stderr } = await run('ssh-keygen', args, 60000)
  if (code !== 0) {
    throw new GitError(stderr.trim() || 'ssh-keygen failed — is OpenSSH installed?', 'SSH_KEYGEN')
  }
  const env = await sshEnvironment()
  const made = env.keys.find((k) => k.name === name)
  if (!made) throw new GitError('The key was generated but could not be read back.', 'SSH_KEYGEN')
  return made
}

/** Load a key into the running ssh-agent so git stops asking for it. */
export async function addToAgent(keyPath: string): Promise<void> {
  const { code, stderr, stdout } = await run('ssh-add', [keyPath], 30000)
  if (code !== 0) {
    throw new GitError(
      (stderr || stdout).trim() || 'ssh-add failed — is ssh-agent running?',
      'SSH_AGENT'
    )
  }
}

/**
 * Pin the open repository to one key by setting `core.sshCommand`. This is the
 * "authenticate THIS repo" switch: it survives restarts, needs no agent, and
 * `IdentitiesOnly=yes` stops ssh from offering (and burning) the wrong keys first.
 * Pass null to clear it.
 */
export async function useKeyForRepo(keyPath: string | null): Promise<void> {
  if (!keyPath) {
    await gitService.setRepoSshCommand(null)
    return
  }
  const posix = keyPath.replace(/\\/g, '/')
  await gitService.setRepoSshCommand(`ssh -i "${posix}" -o IdentitiesOnly=yes`)
}
