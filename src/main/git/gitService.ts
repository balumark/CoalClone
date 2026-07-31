import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git'
import type {
  BlameLine,
  Branch,
  Commit,
  CommitOptions,
  ConflictResolution,
  DiffFile,
  FileChangeType,
  FileStatus,
  GitIdentity,
  GitOperation,
  MergeFile,
  MergeSide,
  PullOptions,
  PushOptions,
  Remote,
  RemoteDiagnosis,
  RemoteProtocol,
  RemoteReachability,
  RebaseItem,
  RepoRef,
  RepoSnapshot,
  ResetMode,
  SignatureInfo,
  SignatureKind,
  SshKeyProbe,
  Stash,
  Submodule,
  StashSaveOptions,
  StatusResult,
  Tag
} from '@shared/types'
import { computeGraph } from './graph'
import { joinLines, merge3, splitLines } from './merge3'

// ---------------------------------------------------------------------------
// This module is the ONLY place in the app that talks to git. Everything else
// goes through it via IPC. It wraps simple-git (which shells out to system git),
// so it works identically on Windows, macOS and Linux.
// ---------------------------------------------------------------------------

const SEP = '\x1f' // unit separator between log fields
const REC = '\x1e' // record separator between commits
const LOG_FORMAT = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%D', '%s', '%b'].join(SEP) + REC

export class GitError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'GitError'
    this.code = code
  }
}

// --- Windows reserved device names ------------------------------------------
// CON/PRN/AUX/NUL/COM1-9/LPT1-9 are device names on Windows, so a file with such
// a basename can be committed from Linux/macOS but can NEVER exist in a Windows
// working tree: opening it hits the device, git "writes" it successfully and then
// fails to stat it ("unable to stat just-written file NUL"). git therefore reports
// it as permanently deleted, and that phantom deletion blocks discard, stash and
// `pull --rebase` forever. The only fix is to commit the deletion (or rename the
// file from Linux). See [[platform]].
const RESERVED_WIN_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** True if any segment of a repo-relative path is a reserved Windows device name. */
export function isReservedWindowsPath(p: string): boolean {
  return p.split(/[\\/]/).some((seg) => RESERVED_WIN_NAME.test(seg.trim()))
}

/** Only Windows hosts are affected — a WSL repo opened from Windows counts. */
const ON_WINDOWS = process.platform === 'win32'

function reservedNameMessage(p: string): string {
  return (
    `"${p}" is a reserved Windows device name, so git can never create it in the ` +
    `working tree on this machine. It stays listed as deleted — and blocks discard, ` +
    `stash and pull --rebase — until you commit the deletion (or rename the file ` +
    `from Linux/macOS).`
  )
}

function toGitError(e: unknown): GitError {
  // Already classified — keep the code. Re-running the message heuristics on our
  // own errors mislabels them (e.g. "no conflict left to resolve" -> CONFLICT).
  if (e instanceof GitError) return e
  const msg = e instanceof Error ? e.message : String(e)
  if (/dubious ownership/i.test(msg)) return new GitError(msg, 'DUBIOUS_OWNERSHIP')
  const justWritten = msg.match(/unable to stat just-written file (.+?): No such file/i)
  if (justWritten) return new GitError(reservedNameMessage(justWritten[1].trim()), 'RESERVED_NAME')
  // "'origin' does not appear to be a git repository" = that remote NAME has no
  // URL configured. Distinct from NOT_A_REPO (our own folder) and from
  // REMOTE_ACCESS (a URL we can't reach) — the fix is to add the remote.
  const missingRemote = msg.match(/'([^']+)' does not appear to be a git repository/i)
  if (missingRemote) {
    return new GitError(
      `No remote named "${missingRemote[1]}" — add its URL to push there.`,
      'NO_REMOTE'
    )
  }
  if (/not a git repository/i.test(msg)) return new GitError(msg, 'NOT_A_REPO')
  if (/not fully merged/i.test(msg)) return new GitError(msg, 'NOT_MERGED')
  if (/conflict|could not apply|fix conflicts/i.test(msg)) return new GitError(msg, 'CONFLICT')
  // Remote-access failures (from fetch/pull/push) get their own code so the toast
  // can offer a "Diagnose connection" action (see diagnoseRemote / Toasts.tsx).
  if (
    /could not read from remote repository|permission denied \(publickey\)|repository not found|could not resolve host(?:name)?|authentication failed|invalid username or password/i.test(
      msg
    )
  ) {
    return new GitError(msg, 'REMOTE_ACCESS')
  }
  return new GitError(msg)
}

// --- remote diagnostics helpers --------------------------------------------

/** Parse transport, host and (SSH) user out of a remote URL. Exported for tests. */
export function parseRemoteUrl(url: string): {
  protocol: RemoteProtocol
  host: string | null
  user: string | null
} {
  if (/^ssh:\/\//i.test(url)) {
    const m = url.match(/^ssh:\/\/(?:([^@]+)@)?([^:/]+)/i)
    return { protocol: 'ssh', host: m?.[2] ?? null, user: m?.[1] ?? null }
  }
  if (/^https?:\/\//i.test(url)) {
    const m = url.match(/^https?:\/\/(?:[^@/]+@)?([^:/]+)/i)
    return { protocol: 'https', host: m?.[1] ?? null, user: null }
  }
  if (/^git:\/\//i.test(url)) {
    const m = url.match(/^git:\/\/([^:/]+)/i)
    return { protocol: 'git', host: m?.[1] ?? null, user: null }
  }
  // scp-like "[user@]host:path" — but not a Windows drive path (C:\...) or file://.
  const scp = url.match(/^(?:([^@/]+)@)?([^/:]+):(?!\/\/)(.+)$/)
  if (scp && !/^[a-z]:[\\/]/i.test(url) && !/^file:/i.test(url)) {
    return { protocol: 'ssh', host: scp[2], user: scp[1] ?? null }
  }
  return { protocol: 'local', host: null, user: null }
}

/** Classify a failed `git ls-remote` from its exit code + stderr. Exported for tests. */
export function classifyReachability(
  protocol: RemoteProtocol,
  code: number | null,
  stderr: string
): RemoteReachability {
  if (code === 0) return 'ok'
  const e = stderr.toLowerCase()
  if (
    /could not resolve host|name or service not known|nodename nor servname|temporary failure in name resolution|connection timed out|connection refused|network is unreachable|no route to host|operation timed out|host key verification failed/.test(
      e
    )
  ) {
    return 'host-unreachable'
  }
  if (/repository not found|does not (?:exist|appear to be a git)|not found/.test(e)) {
    return 'no-access'
  }
  if (protocol === 'ssh' && /permission denied|publickey/.test(e)) return 'auth-failed'
  if (
    (protocol === 'https' || protocol === 'git') &&
    /authentication failed|could not read username|terminal prompts disabled|invalid username or password/.test(
      e
    )
  ) {
    return 'https-auth'
  }
  // "Could not read from remote repository" is git's generic suffix for both a
  // rejected key and a missing repo; over SSH with nothing more specific it's
  // almost always a credential problem.
  if (/could not read from remote repository/.test(e)) {
    return protocol === 'ssh' ? 'auth-failed' : 'unknown'
  }
  return 'unknown'
}

/**
 * Read the account name a host greets an SSH key as (GitHub/GitLab/Bitbucket).
 * Exported for tests.
 */
export function parseSshIdentity(out: string): {
  status: SshKeyProbe['status']
  identity?: string
} {
  let m: RegExpMatchArray | null
  if ((m = out.match(/Hi ([^!]+)! You've successfully authenticated/)))
    return { status: 'authenticated', identity: m[1].trim() }
  if ((m = out.match(/Welcome to GitLab, @?([^!]+)!/)))
    return { status: 'authenticated', identity: m[1].trim() }
  if ((m = out.match(/logged in as ([^.\s]+)/i)))
    return { status: 'authenticated', identity: m[1].trim() }
  if (/successfully authenticated/i.test(out)) return { status: 'authenticated' }
  if (/permission denied/i.test(out)) return { status: 'denied' }
  return { status: 'error' }
}

/** The last non-empty line(s) of git/ssh output, for showing context to the user. */
function lastLines(out: string, n = 4): string {
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join('\n')
}

function mapStatusChar(c: string): FileChangeType {
  switch (c) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'U':
      return 'conflicted'
    case '?':
      return 'untracked'
    default:
      return 'unknown'
  }
}

/** Map git's %G? signature code to a coarse verification kind. */
function mapSignature(code: string): SignatureKind {
  switch (code) {
    case 'G': // good, valid
    case 'U': // good, unknown validity
      return 'good'
    case 'B': // bad
    case 'R': // revoked key
    case 'X': // expired signature
    case 'Y': // expired key
      return 'invalid'
    case 'E': // cannot check (missing key)
      return 'unverified'
    default: // 'N' or empty
      return 'none'
  }
}

/** Split a combined unified patch into per-file DiffFile records. */
function splitPatch(raw: string): DiffFile[] {
  if (!raw.trim()) return []
  const files: DiffFile[] = []
  const chunks = raw.split(/(?=^diff --git )/m).filter((c) => c.startsWith('diff --git'))
  for (const chunk of chunks) {
    const header = chunk.split('\n')[0]
    const m = header.match(/^diff --git a\/(.+?) b\/(.+)$/)
    const a = m ? m[1] : ''
    const b = m ? m[2] : a
    const binary = /^Binary files /m.test(chunk) || /^GIT binary patch/m.test(chunk)
    let additions = 0
    let deletions = 0
    for (const line of chunk.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }
    files.push({
      path: b,
      origPath: a !== b ? a : undefined,
      binary,
      raw: chunk,
      additions,
      deletions
    })
  }
  return files
}

// Applied to every working-tree git call. `core.fileMode=false` makes git ignore
// exec-bit flips, which flap constantly on WSL/Windows: without it the UI hides the
// phantom mode-only changes but pull/rebase/checkout still refuse the "dirty" tree
// ("cannot pull with rebase: You have unstaged changes") while the app shows none.
/**
 * simple-git blocks anything git might EXECUTE — a `-c core.sshCommand=…` switch,
 * or an inherited env var like EDITOR / GIT_ASKPASS / GIT_EXTERNAL_DIFF — unless
 * the matching `unsafe` flag is set, and it throws for the WHOLE call, so one
 * stray variable on the host machine (VS Code injects GIT_ASKPASS into every
 * process it launches, MSYS sets PREFIX and PAGER…) killed every git operation.
 *
 * That guard exists for servers running git against untrusted input. This is a
 * desktop git client: the commands come from the user's own machine and their
 * own git config, which they could run in a terminal anyway. So all categories
 * are enabled and we stop playing whack-a-mole with environment variables.
 */
const ALLOW_UNSAFE: SimpleGitOptions['unsafe'] = {
  allowUnsafeAlias: true,
  allowUnsafeAskPass: true,
  allowUnsafeConfigPaths: true,
  allowUnsafeConfigEnvCount: true,
  allowUnsafeCredentialHelper: true,
  allowUnsafeCustomBinary: true,
  allowUnsafeDiffExternal: true,
  allowUnsafeDiffTextConv: true,
  allowUnsafeEditor: true,
  allowUnsafeFilter: true,
  allowUnsafeFsMonitor: true,
  allowUnsafeGitProxy: true,
  allowUnsafeGpgProgram: true,
  allowUnsafeHooksPath: true,
  allowUnsafeMergeDriver: true,
  allowUnsafePack: true,
  allowUnsafePager: true,
  allowUnsafeProtocolOverride: true,
  allowUnsafeSshCommand: true,
  allowUnsafeTemplateDir: true
}

const GIT_OPTIONS = { config: ['core.fileMode=false'], unsafe: ALLOW_UNSAFE }

/** `ssh -i <key>` with IdentitiesOnly so ssh can't burn the wrong key first. */
export function sshCommandForKey(keyPath: string): string {
  return `ssh -i "${keyPath}" -o IdentitiesOnly=yes`
}

/**
 * The inherited environment plus `extra`.
 *
 * `.env()` REPLACES the child environment rather than extending it, so
 * `process.env` (PATH, SSH_AUTH_SOCK, the user's credential helper settings…)
 * has to be carried over explicitly — anything we drop here silently stops
 * working. Nothing is filtered: see ALLOW_UNSAFE for why the guard that used to
 * reject these variables is switched off.
 */
function inheritedEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...extra }
}

export class GitService {
  private repoPath: string | null = null
  private git: SimpleGit | null = null
  /** The active profile's key, applied to every git call (see setSshKey). */
  private sshKeyPath: string | null = null

  get currentRepo(): string | null {
    return this.repoPath
  }

  private ensure(): SimpleGit {
    if (!this.git || !this.repoPath) throw new GitError('No repository is open', 'NO_REPO')
    return this.git
  }

  /**
   * Build a git instance for `dir`, carrying the active profile's SSH key.
   *
   * The key rides in `GIT_SSH_COMMAND` (process env, not repo config) so it
   * follows the profile rather than sticking to the repository — a repo-local
   * `core.sshCommand` written by Settings → SSH & auth still wins, which is the
   * intent: that switch is the per-repo override.
   */
  private build(dir?: string): SimpleGit {
    const git = dir ? simpleGit(dir, GIT_OPTIONS) : simpleGit(GIT_OPTIONS)
    if (!this.sshKeyPath) return git
    return git.env(
      inheritedEnv({
        GIT_SSH_COMMAND: sshCommandForKey(this.sshKeyPath),
        // A GUI can't answer a credential prompt — fail instead of hanging forever.
        GIT_TERMINAL_PROMPT: '0'
      })
    )
  }

  /** Point every later git call at this profile's key (null = system default). */
  setSshKey(keyPath: string | null): void {
    this.sshKeyPath = keyPath
    if (this.repoPath) this.git = this.build(this.repoPath)
  }

  /** Validate and open a repository; returns the normalized top-level ref. */
  async openRepo(dir: string): Promise<RepoRef> {
    try {
      // Check first: simple-git throws its own opaque message for a missing
      // directory, and the caller must be able to tell "gone" (nothing to do)
      // from "not a repo yet" (offer to initialize it).
      if (!(await this.exists(dir))) {
        throw new GitError(`"${dir}" no longer exists.`, 'NO_DIR')
      }
      const probe = simpleGit(dir)
      const isRepo = await probe.checkIsRepo()
      if (!isRepo) throw new GitError('Selected folder is not a git repository', 'NOT_A_REPO')
      const top = (await probe.revparse(['--show-toplevel'])).trim()
      const normalized = path.normalize(top)
      this.repoPath = normalized
      // NO command timeout: killing a slow git op (checkout/merge over a UNC/WSL
      // share can take a while) mid-write leaves the working tree + index half-switched
      // and corrupt. We prevent hangs by pausing the .git watcher during mutations
      // (see the action() helper) instead of by force-killing git.
      this.git = this.build(normalized)
      return { path: normalized, name: path.basename(normalized) }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Clone `url` into `<parentDir>/<name>` with the active profile's key, then
   * open it. Refuses a target that already exists rather than merging into it.
   */
  async clone(url: string, parentDir: string, name: string): Promise<RepoRef> {
    const target = path.join(parentDir, name)
    try {
      if (await this.exists(target)) {
        throw new GitError(`"${target}" already exists — pick another folder or name.`, 'EXISTS')
      }
      await fs.mkdir(parentDir, { recursive: true })
      await this.build(parentDir).clone(url, target)
    } catch (e) {
      if (e instanceof GitError) throw e
      throw toGitError(e)
    }
    return this.openRepo(target)
  }

  /** Create an empty repository at `<parentDir>/<name>` and open it. */
  async createRepo(parentDir: string, name: string): Promise<RepoRef> {
    return this.initRepo(path.join(parentDir, name))
  }

  /**
   * `git init` an existing folder (creating it if missing) and open it. This is
   * what the "not a git repository" prompt runs, so an ordinary folder can be
   * turned into a repo without leaving the open flow. Keeping any content the
   * folder already has is the point — init never touches the working tree.
   */
  async initRepo(dir: string): Promise<RepoRef> {
    const target = path.normalize(dir)
    try {
      if (await this.exists(path.join(target, '.git'))) {
        throw new GitError(`"${target}" is already a git repository.`, 'EXISTS')
      }
      await fs.mkdir(target, { recursive: true })
      await simpleGit(target, GIT_OPTIONS).init(['--initial-branch=main'])
    } catch (e) {
      if (e instanceof GitError) throw e
      throw toGitError(e)
    }
    return this.openRepo(target)
  }

  /** Stamp a repo-local identity (what a profile applies to repos it creates). */
  async setLocalIdentity(name: string, email: string): Promise<void> {
    const git = this.ensure()
    try {
      if (name.trim()) await git.raw(['config', '--local', 'user.name', name.trim()])
      if (email.trim()) await git.raw(['config', '--local', 'user.email', email.trim()])
    } catch (e) {
      throw toGitError(e)
    }
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p)
      return true
    } catch {
      return false
    }
  }

  close(): void {
    this.repoPath = null
    this.git = null
  }

  /** Add the current repo path to git's safe.directory (fixes WSL/Windows dubious ownership). */
  async trustDirectory(dir: string): Promise<void> {
    try {
      // Use a repo-independent simpleGit instance for a --global config write.
      const git = simpleGit()
      // git matches safe.directory against its INTERNAL path spelling, which uses
      // forward slashes. A UNC/WSL path (\\wsl.localhost\repo) is seen by git as
      // //wsl.localhost/repo, and Git-for-Windows additionally needs the %(prefix)/
      // form (exactly what its own error hint suggests). The backslash form we used to
      // add never matched, so the fix silently did nothing. Add every spelling.
      const fwd = dir.replace(/\\/g, '/')
      const variants = new Set<string>([path.normalize(dir), fwd])
      if (fwd.startsWith('//')) variants.add(`%(prefix)/${fwd}`)
      for (const v of variants) {
        await git.addConfig('safe.directory', v, true, 'global')
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Which multi-step operation (if any) is paused in the repo, via .git markers. */
  private async detectOperation(): Promise<GitOperation | null> {
    const git = this.ensure()
    try {
      const gitDir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim()
      const has = async (rel: string): Promise<boolean> => {
        try {
          await fs.access(path.join(gitDir, rel))
          return true
        } catch {
          return false
        }
      }
      // Order matters: rebase dirs can coexist with other markers.
      if ((await has('rebase-merge')) || (await has('rebase-apply'))) return 'rebase'
      if (await has('REVERT_HEAD')) return 'revert'
      if (await has('CHERRY_PICK_HEAD')) return 'cherry-pick'
      if (await has('MERGE_HEAD')) return 'merge'
      return null
    } catch {
      return null
    }
  }

  // --- git config -----------------------------------------------------------

  /**
   * Read one config value. `local` needs an open repo; `global` works without
   * one (Settings can edit the identity before any repo is opened). Returns null
   * when the key isn't set — git exits non-zero for that, which isn't an error here.
   */
  async getConfig(key: string, scope: 'local' | 'global'): Promise<string | null> {
    const repo = this.repoPath
    if (scope === 'local' && !repo) return null
    try {
      const git = scope === 'local' ? this.ensure() : simpleGit()
      const value = (await git.raw(['config', `--${scope}`, '--get', key])).trim()
      return value.length > 0 ? value : null
    } catch {
      return null
    }
  }

  /** Set (or, with a null value, unset) one config key. */
  async setConfig(key: string, value: string | null, scope: 'local' | 'global'): Promise<void> {
    const repo = this.repoPath
    if (scope === 'local' && !repo) {
      throw new GitError('Open a repository first — this setting is repository-local.', 'NO_REPO')
    }
    const git = scope === 'local' ? this.ensure() : simpleGit()
    try {
      if (value === null) {
        // --unset fails with exit 5 when the key wasn't set; that's a no-op, not an error.
        try {
          await git.raw(['config', `--${scope}`, '--unset', key])
        } catch (e) {
          if (!/exit code=5/i.test(e instanceof Error ? e.message : String(e))) throw e
        }
      } else {
        await git.raw(['config', `--${scope}`, key, value])
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Write (or clear) the repo's `core.sshCommand` — the key a repository
   * authenticates with (see sshService.useKeyForRepo). Writing that key is one
   * of the things ALLOW_UNSAFE re-enables.
   */
  async setRepoSshCommand(value: string | null): Promise<void> {
    const repo = this.repoPath
    if (!repo) throw new GitError('Open a repository first.', 'NO_REPO')
    const g = simpleGit(repo, GIT_OPTIONS)
    try {
      if (value === null) {
        try {
          await g.raw(['config', '--local', '--unset', 'core.sshCommand'])
        } catch (e) {
          // Exit 5 = the key wasn't set, which is the state we wanted anyway.
          if (!/exit code=5/i.test(e instanceof Error ? e.message : String(e))) throw e
        }
      } else {
        await g.raw(['config', '--local', 'core.sshCommand', value])
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** The author identity + signing config behind commits, global and repo-level. */
  async identity(): Promise<GitIdentity> {
    const [globalName, globalEmail, repoName, repoEmail, signingKey, gpgSign] = await Promise.all([
      this.getConfig('user.name', 'global'),
      this.getConfig('user.email', 'global'),
      this.getConfig('user.name', 'local'),
      this.getConfig('user.email', 'local'),
      this.getConfig('user.signingkey', 'local').then(
        async (v) => v ?? (await this.getConfig('user.signingkey', 'global'))
      ),
      this.getConfig('commit.gpgsign', 'local').then(
        async (v) => v ?? (await this.getConfig('commit.gpgsign', 'global'))
      )
    ])
    return {
      globalName,
      globalEmail,
      repoName,
      repoEmail,
      signingKey,
      signByDefault: gpgSign === 'true'
    }
  }

  /**
   * Write the identity back. Only the provided fields are touched; an empty
   * string clears the key (used to drop a repo-level override back to global).
   */
  async setIdentity(
    patch: Partial<Omit<GitIdentity, 'signByDefault'>> & { signByDefault?: boolean }
  ): Promise<void> {
    const norm = (v: string | null | undefined): string | null | undefined =>
      v === undefined ? undefined : v?.trim() || null
    const writes: [string, string | null | undefined, 'local' | 'global'][] = [
      ['user.name', norm(patch.globalName), 'global'],
      ['user.email', norm(patch.globalEmail), 'global'],
      ['user.name', norm(patch.repoName), 'local'],
      ['user.email', norm(patch.repoEmail), 'local'],
      ['user.signingkey', norm(patch.signingKey), 'global']
    ]
    for (const [key, value, scope] of writes) {
      if (value === undefined) continue
      await this.setConfig(key, value, scope)
    }
    if (patch.signByDefault !== undefined) {
      await this.setConfig('commit.gpgsign', patch.signByDefault ? 'true' : null, 'global')
    }
  }

  /** Whether a signing key is configured (so the UI can offer/toggle signing). */
  private async hasSigningKey(): Promise<boolean> {
    const git = this.ensure()
    try {
      const key = (await git.raw(['config', '--get', 'user.signingkey'])).trim()
      return key.length > 0
    } catch {
      return false // not set → git config exits non-zero
    }
  }

  /**
   * Working-tree paths whose unstaged change touches content (not just the file
   * mode). `git diff --numstat` lists added/deleted line counts; a tracked file
   * with `0\t0` changed only its mode — a phantom modification on filesystems
   * that don't preserve the executable bit (WSL over a Windows/UNC path). Binary
   * files show `-\t-` and are always kept.
   */
  private async contentChangedPaths(): Promise<Set<string> | null> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['diff', '--numstat'])
      const set = new Set<string>()
      for (const line of raw.split('\n')) {
        const m = line.match(/^(\S+)\t(\S+)\t(.+)$/)
        if (!m) continue
        const [, add, del, path] = m
        if (add === '-' || del === '-' || add !== '0' || del !== '0') set.add(path)
      }
      return set
    } catch {
      // Unknown — return null so the caller hides nothing (shows all changes).
      return null
    }
  }

  async status(): Promise<StatusResult> {
    const git = this.ensure()
    try {
      const s = await git.status()
      const operation = await this.detectOperation()
      const signingConfigured = await this.hasSigningKey()
      const conflicted = new Set(s.conflicted)
      // On WSL/Windows the executable bit flaps, so git reports files as modified
      // with no content diff ("File without changes"). Hide these spurious
      // mode-only changes — a file is a real change only if numstat shows content.
      const contentChanged = await this.contentChangedPaths()
      const staged: FileStatus[] = []
      const unstaged: FileStatus[] = []
      for (const f of s.files) {
        // Flagged so the UI can explain why this file can't be restored here.
        const res = ON_WINDOWS && isReservedWindowsPath(f.path) ? { reserved: true as const } : {}
        if (conflicted.has(f.path)) {
          unstaged.push({ path: f.path, type: 'conflicted', staged: false, ...res })
          continue
        }
        const index = f.index
        const wd = f.working_dir
        if (index !== ' ' && index !== '?') {
          staged.push({ path: f.path, type: mapStatusChar(index), staged: true, ...res })
        }
        if (wd !== ' ') {
          // A plain modification with no content delta is a phantom mode-only flip.
          if (wd === 'M' && contentChanged && !contentChanged.has(f.path)) continue
          unstaged.push({
            path: f.path,
            type: wd === '?' ? 'untracked' : mapStatusChar(wd),
            staged: false,
            ...res
          })
        }
      }
      return {
        staged,
        unstaged,
        branch: s.current ?? null,
        upstream: s.tracking ?? null,
        ahead: s.ahead,
        behind: s.behind,
        isClean: s.isClean(),
        operation,
        signingConfigured
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Signature verification for a single commit (%G? + %GS), fetched on demand. */
  async signatureInfo(hash: string): Promise<SignatureInfo> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['show', '--no-patch', `--format=%G?${SEP}%GS`, hash])
      const [code, signer] = raw.trim().split(SEP)
      return { kind: mapSignature((code ?? '').trim()), signer: (signer ?? '').trim() }
    } catch (e) {
      throw toGitError(e)
    }
  }

  private parseCommits(raw: string): Commit[] {
    return raw
      .split(REC)
      .map((r) => r.replace(/^\n/, ''))
      .filter((r) => r.trim().length > 0)
      .map((rec) => {
        const [hash, shortHash, parents, an, ae, aI, refs, subject, body] = rec.split(SEP)
        return {
          hash,
          shortHash,
          parents: parents ? parents.trim().split(/\s+/).filter(Boolean) : [],
          authorName: an,
          authorEmail: ae,
          authorDate: aI,
          refs: refs
            ? refs
                .split(', ')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          subject: subject ?? '',
          body: body ?? ''
        } satisfies Commit
      })
  }

  /** First-parent (base) commit of every stash — the commit its marker sits on. */
  private async stashBaseHashes(): Promise<string[]> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['stash', 'list', '--format=%P'])
      return raw
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async log(limit = 500): Promise<Commit[]> {
    const git = this.ensure()
    try {
      // refs/stash is under refs/, so a bare --all pulls the stash's internal
      // WIP/index commits into the graph. Exclude it (stashes render as their own
      // dotted-square markers, see stashes()), but explicitly include each stash's
      // BASE commit as a rev — after a history rewrite (squash/rebase) the base can
      // be unreachable from any branch, and without it the marker has no row to sit on.
      const stashBases = await this.stashBaseHashes()
      const raw = await git.raw([
        'log',
        '--exclude=refs/stash',
        '--all',
        '--date-order',
        `--max-count=${limit}`,
        `--pretty=format:${LOG_FORMAT}`,
        ...stashBases
      ])
      return this.parseCommits(raw)
    } catch (e) {
      const err = toGitError(e)
      // A repo with no commits yet: return empty history rather than erroring.
      if (/does not have any commits yet|bad default revision/i.test(err.message)) return []
      throw err
    }
  }

  /**
   * The commits an interactive rebase would edit if it started at `fromHash`:
   * fromHash..HEAD, oldest-first (git's todo order). `root` handles the case where
   * fromHash is the very first commit (no parent).
   */
  async rebaseRange(fromHash: string, root: boolean): Promise<Commit[]> {
    const git = this.ensure()
    try {
      const range = root ? 'HEAD' : `${fromHash}~1..HEAD`
      const raw = await git.raw([
        'log',
        '--reverse',
        '--date-order',
        `--pretty=format:${LOG_FORMAT}`,
        range
      ])
      return this.parseCommits(raw)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Run an interactive rebase non-interactively: we feed git the todo list via
   * GIT_SEQUENCE_EDITOR (a plain `cp` of a temp file we write — works on Windows
   * too, since Git ships `cp`), and GIT_EDITOR=true so squash/fixup accept the
   * default message without opening an editor. A conflict pauses the rebase and
   * flows into the normal conflict UI. reword is intentionally unsupported here.
   */
  async rebaseInteractive(fromHash: string, root: boolean, items: RebaseItem[]): Promise<void> {
    if (!this.repoPath) throw new GitError('No repository is open', 'NO_REPO')
    const todo = items.map((i) => `${i.action} ${i.hash}`).join('\n') + '\n'
    const tmp = path.join(os.tmpdir(), `kc-rebase-${Date.now()}.txt`)
    await fs.writeFile(tmp, todo, 'utf8')
    const seqEditor = `cp '${tmp.replace(/\\/g, '/')}'`
    try {
      // Fresh instance so we don't leave the editor env on the shared singleton.
      const g = simpleGit(this.repoPath, GIT_OPTIONS).env(
        inheritedEnv({ GIT_SEQUENCE_EDITOR: seqEditor, GIT_EDITOR: 'true' })
      )
      await g.rebase(root ? ['-i', '--root'] : ['-i', `${fromHash}~1`])
    } catch (e) {
      throw toGitError(e)
    } finally {
      await fs.rm(tmp, { force: true })
    }
  }

  /** Commits that touched a file, newest-first, following renames. */
  async fileHistory(filePath: string): Promise<Commit[]> {
    const git = this.ensure()
    try {
      const raw = await git.raw([
        'log',
        '--follow',
        '--date-order',
        `--pretty=format:${LOG_FORMAT}`,
        '--',
        filePath
      ])
      return this.parseCommits(raw)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Per-line blame for a file (git blame --porcelain), newest info cached per commit. */
  async blame(filePath: string): Promise<BlameLine[]> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['blame', '--porcelain', '--', filePath])
      const meta = new Map<string, { author: string; time: number; summary: string }>()
      const out: BlameLine[] = []
      let cur = ''
      let curLine = 0
      for (const l of raw.split('\n')) {
        const header = l.match(/^([0-9a-f]{40}) \d+ (\d+)/)
        if (header) {
          cur = header[1]
          curLine = parseInt(header[2], 10)
          if (!meta.has(cur)) meta.set(cur, { author: '', time: 0, summary: '' })
          continue
        }
        const m = meta.get(cur)
        if (m && l.startsWith('author ')) m.author = l.slice(7)
        else if (m && l.startsWith('author-time ')) m.time = parseInt(l.slice(12), 10)
        else if (m && l.startsWith('summary ')) m.summary = l.slice(8)
        else if (l.startsWith('\t')) {
          const info = meta.get(cur) ?? { author: '', time: 0, summary: '' }
          out.push({
            line: curLine,
            content: l.slice(1),
            hash: cur,
            shortHash: cur.slice(0, 7),
            author: info.author,
            authorTime: info.time ? new Date(info.time * 1000).toISOString() : '',
            summary: info.summary
          })
        }
      }
      return out
    } catch (e) {
      throw toGitError(e)
    }
  }

  async diffFile(filePath: string, staged: boolean): Promise<DiffFile> {
    const git = this.ensure()
    try {
      const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath]
      const raw = await git.raw(args)
      if (raw.trim()) {
        return splitPatch(raw)[0] ?? this.emptyDiff(filePath)
      }
      // No tracked diff and unstaged -> likely an untracked file. Synthesize an
      // all-additions diff from the file content.
      if (!staged) {
        return await this.untrackedDiff(filePath)
      }
      return this.emptyDiff(filePath)
    } catch (e) {
      throw toGitError(e)
    }
  }

  private emptyDiff(filePath: string): DiffFile {
    return { path: filePath, binary: false, raw: '', additions: 0, deletions: 0 }
  }

  private async untrackedDiff(filePath: string): Promise<DiffFile> {
    if (!this.repoPath) return this.emptyDiff(filePath)
    const abs = path.join(this.repoPath, filePath)
    let content: Buffer
    try {
      content = await fs.readFile(abs)
    } catch {
      return this.emptyDiff(filePath)
    }
    const binary = content.includes(0)
    if (binary) {
      return {
        path: filePath,
        binary: true,
        raw: `diff --git a/${filePath} b/${filePath}\nBinary file (untracked)\n`,
        additions: 0,
        deletions: 0
      }
    }
    const text = content.toString('utf8')
    const lines = text.length === 0 ? [] : text.replace(/\n$/, '').split('\n')
    const bodyLines = lines.map((l) => `+${l}`).join('\n')
    const raw =
      `diff --git a/${filePath} b/${filePath}\n` +
      `new file mode 100644\n` +
      `--- /dev/null\n` +
      `+++ b/${filePath}\n` +
      `@@ -0,0 +1,${lines.length} @@\n` +
      (bodyLines ? bodyLines + '\n' : '')
    return { path: filePath, binary: false, raw, additions: lines.length, deletions: 0 }
  }

  async commitDiff(hash: string): Promise<DiffFile[]> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['show', hash, '--format=', '--patch', '--unified=3'])
      return splitPatch(raw)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Raw `git diff --cached` (stat header + patch) for the whole index — the input
   * the AI commit-message generator reads. Empty string when nothing is staged.
   */
  async stagedPatch(): Promise<string> {
    const git = this.ensure()
    try {
      const stat = await git.raw(['diff', '--cached', '--stat'])
      if (!stat.trim()) return ''
      const patch = await git.raw(['diff', '--cached', '--unified=3', '--no-color'])
      return `${stat.trim()}\n\n${patch}`
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Every uncommitted change (staged + unstaged + untracked) as one patch — the
   * input for the stash-message and commit-composer prompts.
   */
  async workingPatch(): Promise<string> {
    const git = this.ensure()
    try {
      const stat = await git.raw(['diff', 'HEAD', '--stat'])
      const patch = await git.raw(['diff', 'HEAD', '--unified=3', '--no-color'])
      // Untracked files are invisible to `diff HEAD`; synthesize their additions.
      const status = await this.status()
      const untracked = status.unstaged.filter((f) => f.type === 'untracked')
      const extras: string[] = []
      for (const f of untracked) {
        const d = await this.untrackedDiff(f.path).catch(() => null)
        if (d?.raw) extras.push(d.raw)
      }
      return [stat.trim(), patch, ...extras].filter((s) => s && s.trim()).join('\n\n')
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * What this branch adds on top of `base`: the commit subjects plus the merged
   * diff (`base...HEAD`) — the input for the pull-request prompt.
   */
  async branchPatch(base: string): Promise<{ log: string; patch: string; commits: number }> {
    const git = this.ensure()
    try {
      const log = await git.raw(['log', `${base}..HEAD`, '--format=%s%n%b', '--no-color'])
      const subjects = await git.raw(['log', `${base}..HEAD`, '--format=%H', '--no-color'])
      const stat = await git.raw(['diff', `${base}...HEAD`, '--stat', '--no-color'])
      const patch = await git.raw(['diff', `${base}...HEAD`, '--unified=3', '--no-color'])
      return {
        log: log.trim(),
        patch: `${stat.trim()}\n\n${patch}`,
        commits: subjects.split('\n').filter((l) => l.trim()).length
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Absolute path of a repo-relative file, refusing anything that would escape
   * the working tree — these helpers write whatever the renderer hands them.
   */
  private inRepo(filePath: string): string {
    const root = this.repoPath
    if (!root) throw new GitError('No repository is open', 'NO_REPO')
    const abs = path.resolve(root, filePath)
    const back = path.relative(root, abs)
    if (back.startsWith('..') || path.isAbsolute(back)) {
      throw new GitError('Path is outside the repository', 'BAD_PATH')
    }
    return abs
  }

  /** Read a conflicted working-tree file verbatim, conflict markers and all. */
  async conflictedFile(filePath: string): Promise<string> {
    const abs = this.inRepo(filePath)
    try {
      return await fs.readFile(abs, 'utf8')
    } catch (e) {
      throw new GitError(
        `Could not read ${filePath}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  /** Write a resolved file back to the working tree (deliberately NOT staged). */
  async writeWorkingFile(filePath: string, content: string): Promise<void> {
    const abs = this.inRepo(filePath)
    try {
      await fs.writeFile(abs, content, 'utf8')
    } catch (e) {
      throw new GitError(
        `Could not write ${filePath}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  /**
   * Commit Composer: turn one dirty tree into several commits. Each group is
   * staged on its own and committed, in order.
   *
   * This resets the index first — whatever was staged by hand is regrouped, which
   * is the whole point of the feature (the UI warns about it).
   */
  async commitGroups(groups: { message: string; files: string[] }[]): Promise<number> {
    const git = this.ensure()
    try {
      let made = 0
      for (const group of groups) {
        const files = group.files.filter((f) => f.trim())
        if (!files.length || !group.message.trim()) continue
        await git.raw(['reset', '--quiet'])
        await git.raw(['add', '--', ...files])
        // A group whose files turn out to hold no change would abort the commit.
        const staged = await git.raw(['diff', '--cached', '--name-only'])
        if (!staged.trim()) continue
        await git.raw(['commit', '-m', group.message])
        made++
      }
      return made
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Raw `git show` (message + stat + patch) for one commit, for AI analysis. */
  async commitPatch(hash: string): Promise<string> {
    const git = this.ensure()
    try {
      return await git.raw([
        'show',
        hash,
        '--stat',
        '--patch',
        '--unified=3',
        '--no-color',
        '--format=%H%n%an <%ae>%n%aI%n%n%B'
      ])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async branches(): Promise<Branch[]> {
    const git = this.ensure()
    try {
      const summary = await git.branch(['-a', '-v'])
      return Object.values(summary.branches).map((b) => ({
        name: b.name,
        current: b.current,
        isRemote: b.name.startsWith('remotes/'),
        upstream: null,
        ahead: 0,
        behind: 0,
        commit: b.commit
      }))
    } catch (e) {
      throw toGitError(e)
    }
  }

  async remotes(): Promise<Remote[]> {
    const git = this.ensure()
    try {
      const list = await git.getRemotes(true)
      return list.map((r) => ({
        name: r.name,
        fetchUrl: r.refs.fetch,
        pushUrl: r.refs.push || r.refs.fetch
      }))
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Spawn a short-lived read-only probe (git ls-remote / ssh -T) and capture its
   * output, killing it after `timeoutMs` so an unreachable host can't hang the UI.
   * Safe to kill (unlike the mutating ops that deliberately run without a timeout):
   * these commands never touch the working tree or index.
   */
  private runProbe(
    cmd: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    timeoutMs = 15000
  ): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const child = spawn(cmd, args, {
        cwd: this.repoPath ?? undefined,
        env,
        windowsHide: true
      })
      const timer = setTimeout(() => {
        timedOut = true
        child.kill()
      }, timeoutMs)
      child.stdout?.on('data', (d) => (stdout += d.toString()))
      child.stderr?.on('data', (d) => (stderr += d.toString()))
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({ code: null, stdout, stderr: `${stderr}${String(err)}`, timedOut })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code, stdout, stderr, timedOut })
      })
    })
  }

  /** Private SSH keys in ~/.ssh (paired .pub files, plus default-named keys). */
  private async listSshKeys(): Promise<{ name: string; path: string; hasPublic: boolean }[]> {
    const dir = path.join(os.homedir(), '.ssh')
    try {
      const entries = await fs.readdir(dir)
      const pubs = new Set(entries.filter((e) => e.endsWith('.pub')).map((e) => e.slice(0, -4)))
      const keys: { name: string; path: string; hasPublic: boolean }[] = []
      for (const name of pubs) {
        if (entries.includes(name)) keys.push({ name, path: path.join(dir, name), hasPublic: true })
      }
      // Default private keys can exist without a stored .pub sibling.
      for (const def of ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa']) {
        if (entries.includes(def) && !pubs.has(def)) {
          keys.push({ name: def, path: path.join(dir, def), hasPublic: false })
        }
      }
      return keys.slice(0, 10)
    } catch {
      return [] // no ~/.ssh at all
    }
  }

  /** Ordered, plain-language remediation hints for a diagnosis outcome. */
  private buildDiagnosisHints(
    reachability: RemoteReachability,
    host: string | null,
    sshKeys: SshKeyProbe[]
  ): string[] {
    const h = host ?? 'the server'
    const authedAs = sshKeys.find((k) => k.status === 'authenticated')?.identity
    const isGitHub = /github\.com$/i.test(host ?? '')
    switch (reachability) {
      case 'ok':
        return ['Connection works — fetch and pull will succeed over this remote.']
      case 'no-access': {
        const hints = [
          authedAs
            ? `You authenticate to ${h} as "${authedAs}", but that account can't see this repository.`
            : `You authenticate to ${h}, but your account can't see this repository.`,
          'This is what a private repo reports when your account lacks access.'
        ]
        if (isGitHub) {
          hints.push(
            'If the owning organization uses SAML SSO, authorize this SSH key for it: GitHub → Settings → SSH and GPG keys → Configure SSO → Authorize.'
          )
        }
        hints.push(
          `Otherwise ask an admin to grant ${authedAs ? `"${authedAs}"` : 'your account'} access, or switch the remote to an account that has it.`
        )
        return hints
      }
      case 'auth-failed': {
        // A key that authenticates while git still gets "Permission denied" means
        // ssh simply didn't offer that key for this remote — the fixable case.
        const working = sshKeys.find((k) => k.status === 'authenticated')
        if (working) {
          return [
            `Your key "${working.name}" DOES authenticate to ${h}${working.identity ? ` as "${working.identity}"` : ''} — but git didn't use it for this remote.`,
            'Pin it to this repository: Settings → SSH & auth → "Use for this repo" (writes core.sshCommand with IdentitiesOnly).',
            'Alternatively load it into ssh-agent, or name it in ~/.ssh/config for this host.'
          ]
        }
        const hints = [`${h} rejected every SSH key on this machine (Permission denied).`]
        if (sshKeys.length === 0) {
          hints.push(`No SSH keys were found in ${path.join(os.homedir(), '.ssh')}.`)
        }
        hints.push(
          `Add your public key to ${h} (its SSH keys settings), or start ssh-agent and load the right key.`,
          `Note: this app runs the OS git/ssh — a repo you normally use inside WSL may rely on WSL's own ~/.ssh keys, which are separate from ${os.homedir()}.`
        )
        return hints
      }
      case 'host-unreachable':
        return [
          `Couldn't reach ${h} at all — this is a network/DNS/host-key problem, not a permissions one.`,
          'Check your internet connection, VPN, and that the remote URL host is spelled correctly.'
        ]
      case 'https-auth':
        return [
          'This is an HTTPS remote and no credentials are available.',
          'GitHub no longer accepts account passwords — use a Personal Access Token as the password, configure a git credential helper, or switch the remote to SSH.'
        ]
      default:
        return [
          "Couldn't classify the failure automatically — see the raw git output below.",
          'Verify the remote URL, your network, and your credentials for this host.'
        ]
    }
  }

  /**
   * Diagnose whether a remote (default `origin`) can actually be reached — the
   * "why does pull say Could not read from remote repository?" tool. Runs a
   * read-only `git ls-remote` (fast-fail, never prompts), classifies the result,
   * and for SSH remotes probes each ~/.ssh key to show which identity it logs in as.
   */
  async diagnoseRemote(name?: string): Promise<RemoteDiagnosis> {
    this.ensure()
    const remotes = await this.remotes()
    if (remotes.length === 0) {
      throw new GitError('This repository has no remotes configured.', 'NO_REMOTE')
    }
    const remote =
      remotes.find((r) => r.name === name) ?? remotes.find((r) => r.name === 'origin') ?? remotes[0]
    const url = remote.fetchUrl
    const { protocol, host, user } = parseRemoteUrl(url)

    // Make network git fail fast instead of hanging on a credential/passphrase
    // prompt (which a GUI can't answer anyway) or a slow connect.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND:
        'ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new'
    }

    const probe = await this.runProbe('git', ['ls-remote', '--heads', remote.name], env, 20000)
    const reachability: RemoteReachability = probe.timedOut
      ? 'host-unreachable'
      : classifyReachability(protocol, probe.code, probe.stderr)
    const detail = probe.timedOut
      ? `Timed out contacting ${host ?? 'the remote'}.`
      : lastLines(probe.stderr || probe.stdout) || '(no output)'

    // For SSH remotes, probe each key so the user can see which one (if any)
    // authenticates and as whom — exactly the manual `ssh -T` check.
    const sshKeys: SshKeyProbe[] = []
    if (protocol === 'ssh' && host) {
      const keys = await this.listSshKeys()
      const sshUser = user ?? 'git'
      const probed = await Promise.all(
        keys.map(async (k) => {
          const r = await this.runProbe(
            'ssh',
            [
              '-i',
              k.path,
              '-o',
              'IdentitiesOnly=yes',
              '-o',
              'BatchMode=yes',
              '-o',
              'ConnectTimeout=10',
              '-o',
              'StrictHostKeyChecking=accept-new',
              '-T',
              `${sshUser}@${host}`
            ],
            env,
            15000
          )
          const out = `${r.stderr}\n${r.stdout}`
          const id = parseSshIdentity(out)
          return {
            name: k.name,
            hasPublic: k.hasPublic,
            status: r.timedOut ? 'error' : id.status,
            message: lastLines(out, 1) || (r.timedOut ? 'Timed out' : 'No response'),
            ...(id.identity ? { identity: id.identity } : {})
          } satisfies SshKeyProbe
        })
      )
      sshKeys.push(...probed)
    }

    const hints = this.buildDiagnosisHints(reachability, host, sshKeys)
    return { remote: remote.name, url, protocol, host, user, reachability, detail, sshKeys, hints }
  }

  async tags(): Promise<Tag[]> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['tag', '--format=%(refname:short)%1f%(objectname:short)'])
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          const [name, commit] = l.split('\x1f')
          return { name, commit: commit ?? '' }
        })
    } catch (e) {
      throw toGitError(e)
    }
  }

  async stashes(): Promise<Stash[]> {
    const git = this.ensure()
    try {
      // %H = stash commit, %P = parents (first is the base commit), %gs = reflog subject.
      const raw = await git.raw(['stash', 'list', `--format=%H${SEP}%P${SEP}%gs`])
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((line, index) => {
          const [hash, parents, subject] = line.split(SEP)
          const parentList = parents ? parents.trim().split(/\s+/).filter(Boolean) : []
          const branch = subject?.match(/^(?:WIP on|On) ([^:]+):/)?.[1] ?? ''
          return {
            index,
            message: subject ?? '',
            branch,
            hash: hash ?? '',
            parentHash: parentList[0] ?? ''
          } satisfies Stash
        })
    } catch (e) {
      throw toGitError(e)
    }
  }

  async submodules(): Promise<Submodule[]> {
    const git = this.ensure()
    try {
      const raw = await git.raw(['submodule', 'status'])
      const stateMap: Record<string, Submodule['state']> = {
        ' ': 'ok',
        '+': 'modified',
        '-': 'uninitialized',
        U: 'conflict'
      }
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          const state = stateMap[l[0]] ?? 'ok'
          const m = l.slice(1).match(/^([0-9a-f]+)\s+(\S+)(?:\s+\((.+)\))?$/)
          if (!m) return null
          return {
            path: m[2],
            hash: m[1],
            shortHash: m[1].slice(0, 7),
            state,
            ...(m[3] ? { ref: m[3] } : {})
          } satisfies Submodule
        })
        .filter((s): s is Submodule => s !== null)
    } catch {
      return [] // no .gitmodules / not supported → none
    }
  }

  // --- mutations -----------------------------------------------------------

  async stage(paths: string[]): Promise<void> {
    const git = this.ensure()
    try {
      await git.add(paths)
    } catch (e) {
      throw toGitError(e)
    }
  }

  async unstage(paths: string[]): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['reset', '--', ...paths])
    } catch (e) {
      // Unborn branch (no HEAD yet): fall back to removing from the index.
      try {
        await git.raw(['rm', '--cached', '-r', '--', ...paths])
      } catch (e2) {
        throw toGitError(e2)
      }
    }
  }

  /**
   * Tracked paths that git reports as deleted from the working tree but whose name
   * is a reserved Windows device name — i.e. deletions that can never be undone on
   * this machine (see `isReservedWindowsPath`). Empty off Windows.
   */
  private async reservedPhantomDeletions(): Promise<string[]> {
    if (!ON_WINDOWS) return []
    const git = this.ensure()
    try {
      const raw = await git.raw(['ls-files', '--deleted'])
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && isReservedWindowsPath(l))
    } catch {
      return []
    }
  }

  async discard(files: FileStatus[]): Promise<void> {
    const git = this.ensure()
    const repo = this.repoPath
    // A reserved-name file can't be checked out here; git would fail mid-way and
    // leave the rest un-discarded. Skip those, discard the rest, then report.
    const blocked = ON_WINDOWS
      ? files.filter((f) => f.type !== 'untracked' && isReservedWindowsPath(f.path))
      : []
    if (blocked.length) files = files.filter((f) => !blocked.includes(f))
    try {
      const tracked = files.filter((f) => f.type !== 'untracked').map((f) => f.path)
      const untracked = files.filter((f) => f.type === 'untracked').map((f) => f.path)
      if (tracked.length) await git.checkout(['--', ...tracked])
      if (repo) {
        for (const p of untracked) {
          await fs.rm(path.join(repo, p), { force: true, recursive: true })
        }
      }
    } catch (e) {
      throw toGitError(e)
    }
    if (blocked.length) throw new GitError(reservedNameMessage(blocked[0].path), 'RESERVED_NAME')
  }

  async commit(opts: CommitOptions): Promise<void> {
    const git = this.ensure()
    try {
      const options: Record<string, null> = {}
      if (opts.amend) options['--amend'] = null
      if (opts.sign) options['-S'] = null
      await git.commit(opts.message, undefined, options)
    } catch (e) {
      throw toGitError(e)
    }
  }

  async checkout(branch: string): Promise<void> {
    const git = this.ensure()
    try {
      // Checking out a remote-tracking branch creates a matching local tracking branch.
      const local = branch.replace(/^remotes\/[^/]+\//, '')
      if (local === branch) {
        await git.checkout(branch)
      } else {
        await git.checkout(['-B', local, '--track', branch.replace(/^remotes\//, '')])
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Create a branch, optionally from a specific start point (commit/branch/tag). */
  async createBranch(name: string, checkout: boolean, startPoint?: string): Promise<void> {
    const git = this.ensure()
    try {
      if (checkout) {
        if (startPoint) await git.checkout(['-b', name, startPoint])
        else await git.checkoutLocalBranch(name)
      } else {
        await git.branch(startPoint ? [name, startPoint] : [name])
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Create a tag at a ref (lightweight, or annotated when a message is given). */
  async createTag(name: string, ref: string, message?: string): Promise<void> {
    const git = this.ensure()
    try {
      if (message) await git.raw(['tag', '-a', name, ref, '-m', message])
      else await git.raw(['tag', name, ref])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async pushTag(name: string, remote = 'origin'): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['push', remote, name])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async deleteTag(name: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['tag', '-d', name])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Force-move a (non-current) branch to point at a target commit (git branch -f). */
  async moveBranch(name: string, target: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['branch', '-f', name, target])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async deleteBranch(name: string, force: boolean): Promise<void> {
    const git = this.ensure()
    try {
      await git.deleteLocalBranch(name, force)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Rename a local branch (git branch -m). Renaming the current branch is allowed. */
  async renameBranch(oldName: string, newName: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['branch', '-m', oldName, newName])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Merge another branch into the current one. Conflicts surface as code CONFLICT. */
  async merge(branch: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.merge([branch.replace(/^remotes\//, '')])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Rebase the current branch onto another branch. */
  async rebase(branch: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.rebase([branch.replace(/^remotes\//, '')])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async cherryPick(hash: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['cherry-pick', hash])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Create a commit that undoes the given commit (no editor). */
  async revert(hash: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['revert', '--no-edit', hash])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Move the current branch to a commit; soft/mixed keep changes, hard discards them. */
  async reset(hash: string, mode: ResetMode): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['reset', `--${mode}`, hash])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Resolve conflicted files by taking one side, or staging a manual edit ('mark'). */
  async resolveConflict(paths: string[], resolution: ConflictResolution): Promise<void> {
    const git = this.ensure()
    try {
      if (resolution === 'ours') await git.raw(['checkout', '--ours', '--', ...paths])
      else if (resolution === 'theirs') await git.raw(['checkout', '--theirs', '--', ...paths])
      // For every resolution the file ends up staged as resolved.
      await git.add(paths)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Put a resolved file back into conflict — `checkout -m` rebuilds the three
   * index stages and the marked-up working copy, so the merge tool can reopen it.
   */
  async unresolveConflict(paths: string[]): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['checkout', '--merge', '--', ...paths])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Name one side of a merge for the merge tool's pane headers: the short hash
   * plus whatever branch/tag git can attach to it (empty when it's unnamed).
   */
  private async describeRef(ref: string): Promise<MergeSide> {
    const git = this.ensure()
    let commit = ''
    try {
      commit = (await git.raw(['rev-parse', '--short', ref])).trim()
    } catch {
      return { label: '', commit: '' }
    }
    let label = ''
    try {
      label = (await git.raw(['name-rev', '--name-only', '--always', ref])).trim()
    } catch {
      label = ''
    }
    // `--always` falls back to the hash, which the header already shows.
    if (!label || label === commit || label === 'undefined') label = ''
    return { label: label.replace(/^(remotes|tags)\//, ''), commit }
  }

  /**
   * The three index stages of a conflicted file, merged into the segment list the
   * merge tool renders. Stage 1 is the merge base, 2 is ours, 3 is theirs; a
   * missing stage means that side has no content (add/add, or delete/modify).
   */
  async mergeFile(filePath: string): Promise<MergeFile> {
    const git = this.ensure()
    // Index paths are always forward-slashed, whatever the host separator is.
    const p = filePath.replace(/\\/g, '/')
    try {
      const unmerged = await git.raw(['ls-files', '-u', '--', p])
      const stages = new Set<string>()
      for (const line of unmerged.split('\n')) {
        const m = line.match(/^\d+ [0-9a-f]+ ([123])\t/)
        if (m) stages.add(m[1])
      }
      if (stages.size === 0) {
        throw new GitError(`${filePath} has no conflict left to resolve`, 'NOT_CONFLICTED')
      }
      const read = async (stage: string): Promise<string> =>
        stages.has(stage) ? await git.raw(['show', `:${stage}:${p}`]) : ''

      const [baseText, oursText, theirsText] = await Promise.all([read('1'), read('2'), read('3')])
      const op = await this.detectOperation()
      const otherRef =
        op === 'rebase'
          ? 'REBASE_HEAD'
          : op === 'cherry-pick'
            ? 'CHERRY_PICK_HEAD'
            : op === 'revert'
              ? 'REVERT_HEAD'
              : 'MERGE_HEAD'
      const [ours, theirs] = await Promise.all([
        this.describeRef('HEAD'),
        this.describeRef(otherRef)
      ])

      const binary = [baseText, oursText, theirsText].some((t) => t.includes('\0'))
      const oursSplit = splitLines(oursText)
      const segments = binary
        ? []
        : merge3(splitLines(baseText).lines, oursSplit.lines, splitLines(theirsText).lines)
      return {
        path: filePath,
        ours,
        theirs,
        segments,
        conflicts: segments.filter((s) => s.kind === 'conflict').length,
        noBase: !stages.has('1'),
        binary,
        crlf: oursSplit.crlf,
        // A side with no content says nothing about the file's final newline;
        // fall back to "yes", which is what a text file normally wants.
        trailingNewline: oursText === '' ? true : oursSplit.trailingNewline
      }
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * The conflicted file rebuilt from the index stages in git's diff3 marker
   * style. Unlike the working copy this exists for EVERY kind of conflict —
   * a modify/delete leaves no markers in the working tree at all — so it is what
   * the AI merge is fed from the merge tool.
   */
  async conflictDocument(filePath: string): Promise<string> {
    const model = await this.mergeFile(filePath)
    if (model.binary) {
      throw new GitError(`${filePath} is binary — there is nothing to merge`, 'BINARY')
    }
    const oursName = model.ours.label || model.ours.commit || 'ours'
    const theirsName = model.theirs.label || model.theirs.commit || 'theirs'
    const out: string[] = []
    for (const s of model.segments) {
      if (s.kind === 'conflict') {
        out.push(
          `<<<<<<< ${oursName}`,
          ...s.ours,
          '||||||| base',
          ...s.base,
          '=======',
          ...s.theirs,
          `>>>>>>> ${theirsName}`
        )
      } else if (s.kind === 'theirs') {
        out.push(...s.theirs)
      } else {
        // common and ours both carry the ours-side text.
        out.push(...s.ours)
      }
    }
    return joinLines(out, { crlf: model.crlf, trailingNewline: model.trailingNewline })
  }

  /**
   * Write the merge tool's output back to the working tree, optionally staging it
   * as resolved. Saving without resolving is allowed on purpose: a half-finished
   * merge should survive closing the dialog.
   */
  async saveMerge(filePath: string, content: string, markResolved: boolean): Promise<void> {
    await this.writeWorkingFile(filePath, content)
    if (!markResolved) return
    const git = this.ensure()
    try {
      await git.add([filePath])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Continue the paused operation once conflicts are resolved. May conflict again. */
  async continueOperation(): Promise<void> {
    const git = this.ensure()
    const op = await this.detectOperation()
    try {
      // core.editor=true makes git accept the default message without opening an editor.
      if (op === 'merge') await git.raw(['commit', '--no-edit'])
      else if (op === 'rebase') await git.raw(['-c', 'core.editor=true', 'rebase', '--continue'])
      else if (op === 'cherry-pick')
        await git.raw(['-c', 'core.editor=true', 'cherry-pick', '--continue'])
      else if (op === 'revert') await git.raw(['-c', 'core.editor=true', 'revert', '--continue'])
      else throw new GitError('No operation in progress', 'NO_OP')
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Abort the paused operation, restoring the pre-operation state. */
  async abortOperation(): Promise<void> {
    const git = this.ensure()
    const op = await this.detectOperation()
    try {
      if (op === 'merge') await git.raw(['merge', '--abort'])
      else if (op === 'rebase') await git.raw(['rebase', '--abort'])
      else if (op === 'cherry-pick') await git.raw(['cherry-pick', '--abort'])
      else if (op === 'revert') await git.raw(['revert', '--abort'])
      else throw new GitError('No operation in progress', 'NO_OP')
    } catch (e) {
      throw toGitError(e)
    }
  }

  async addRemote(name: string, url: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.addRemote(name, url)
    } catch (e) {
      throw toGitError(e)
    }
  }

  async setRemoteUrl(name: string, url: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['remote', 'set-url', name, url])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async removeRemote(name: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.removeRemote(name)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Set (or retarget) a branch's upstream tracking ref (git branch --set-upstream-to). */
  async setUpstream(branch: string, upstream: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['branch', `--set-upstream-to=${upstream.replace(/^remotes\//, '')}`, branch])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Advance <branch> to <to> by fast-forward only (never a merge commit). For the
   * checked-out branch this is `merge --ff-only`; for any other branch we update
   * its ref via `fetch . <to>:<branch>`, which refuses non-fast-forward moves.
   */
  async fastForward(branch: string, to: string): Promise<void> {
    const git = this.ensure()
    try {
      const current = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      const src = to.replace(/^remotes\//, '')
      if (current === branch) await git.raw(['merge', '--ff-only', src])
      else await git.raw(['fetch', '.', `${src}:${branch}`])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Add a new linked working tree checked out at <ref> (git worktree add). */
  async worktreeAdd(dir: string, ref: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.raw(['worktree', 'add', dir, ref.replace(/^remotes\//, '')])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Write a single commit as a mailbox .patch file (git format-patch -1 --stdout). */
  async createPatch(hash: string, outPath: string): Promise<void> {
    const git = this.ensure()
    try {
      const patch = await git.raw(['format-patch', '-1', '--stdout', hash])
      await fs.writeFile(outPath, patch, 'utf8')
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Write a single file's working (or staged) diff out as a .patch file. */
  async filePatch(filePath: string, staged: boolean, outPath: string): Promise<void> {
    const git = this.ensure()
    try {
      const args = ['diff']
      if (staged) args.push('--cached')
      args.push('--', filePath)
      const patch = await git.raw(args)
      await fs.writeFile(outPath, patch, 'utf8')
    } catch (e) {
      throw toGitError(e)
    }
  }

  /**
   * Ignore a single working-tree path. Adds it to .gitignore, and — because
   * .gitignore only affects UNtracked files — also drops a tracked file from the
   * index (`git rm --cached`) so git actually stops surfacing it. The file stays
   * on disk; the removal shows as a staged deletion to commit.
   */
  async ignorePath(filePath: string, untrack: boolean): Promise<void> {
    await this.addToIgnore(filePath)
    if (untrack) {
      const git = this.ensure()
      try {
        await git.raw(['rm', '--cached', '--', filePath])
      } catch (e) {
        throw toGitError(e)
      }
    }
  }

  /** Append a pattern to the repo's root .gitignore (no-op if already present). */
  async addToIgnore(pattern: string): Promise<void> {
    if (!this.repoPath) throw new GitError('No repository is open', 'NO_REPO')
    const trimmed = pattern.trim()
    if (!trimmed) return
    const file = path.join(this.repoPath, '.gitignore')
    try {
      let existing = ''
      try {
        existing = await fs.readFile(file, 'utf8')
      } catch {
        // No .gitignore yet — we'll create it.
      }
      const present = existing.split(/\r?\n/).some((l) => l.trim() === trimmed)
      if (present) return
      const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
      await fs.appendFile(file, `${prefix}${trimmed}\n`, 'utf8')
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Stash just one path (includes it even when untracked). */
  async stashFile(filePath: string): Promise<void> {
    const git = this.ensure()
    try {
      await git.stash(['push', '--include-untracked', '--', filePath])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async fetch(): Promise<void> {
    const git = this.ensure()
    try {
      await git.fetch(['--all', '--prune'])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async pull(opts?: PullOptions): Promise<void> {
    const git = this.ensure()
    try {
      const flags: string[] = []
      if (opts?.mode === 'ff-only') flags.push('--ff-only')
      else if (opts?.mode === 'rebase') flags.push('--rebase')
      else flags.push('--ff')
      await git.pull(flags)
    } catch (e) {
      const err = toGitError(e)
      // "You have unstaged changes" while the only change is an un-restorable
      // reserved-name deletion is a dead end — say what actually has to be done.
      if (/unstaged changes|local changes/i.test(err.message)) {
        const phantom = (await this.reservedPhantomDeletions())[0]
        if (phantom) throw new GitError(reservedNameMessage(phantom), 'RESERVED_NAME')
      }
      throw err
    }
  }

  async push(opts: PushOptions): Promise<void> {
    const git = this.ensure()
    try {
      const flags: string[] = []
      if (opts.setUpstream) flags.push('--set-upstream')
      if (opts.force) flags.push('--force-with-lease')
      if (opts.remote && opts.branch) await git.push(opts.remote, opts.branch, flags)
      else await git.push(flags)
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Save the working tree to a new stash. Untracked files are included when asked. */
  async stashSave(opts: StashSaveOptions): Promise<void> {
    const git = this.ensure()
    // `git stash push` would create the stash and THEN fail to reset the index over
    // a reserved-name file, leaving a stash entry plus an unchanged tree. Refuse first.
    const phantom = (await this.reservedPhantomDeletions())[0]
    if (phantom) throw new GitError(reservedNameMessage(phantom), 'RESERVED_NAME')
    try {
      const args = ['push']
      if (opts.includeUntracked) args.push('--include-untracked')
      if (opts.message) args.push('-m', opts.message)
      await git.stash(args)
    } catch (e) {
      throw toGitError(e)
    }
  }

  async stashApply(index: number): Promise<void> {
    const git = this.ensure()
    try {
      await git.stash(['apply', `stash@{${index}}`])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async stashPop(index: number): Promise<void> {
    const git = this.ensure()
    try {
      await git.stash(['pop', `stash@{${index}}`])
    } catch (e) {
      throw toGitError(e)
    }
  }

  async stashDrop(index: number): Promise<void> {
    const git = this.ensure()
    try {
      await git.stash(['drop', `stash@{${index}}`])
    } catch (e) {
      throw toGitError(e)
    }
  }

  /** Gather a full snapshot for the renderer in one round-trip. */
  async snapshot(ref: RepoRef, logLimit = 500): Promise<RepoSnapshot> {
    const [status, commits, branches, remotes, tags, stashes, submodules] = await Promise.all([
      this.status(),
      this.log(logLimit),
      this.branches(),
      this.remotes(),
      this.tags(),
      this.stashes(),
      this.submodules()
    ])
    const graph = computeGraph(commits)
    return { ref, status, commits, graph, branches, remotes, tags, stashes, submodules }
  }
}

export const gitService = new GitService()
