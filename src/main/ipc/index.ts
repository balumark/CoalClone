import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import { IPC } from '@shared/ipc'
import type {
  AiProvider,
  AppSettingsPatch,
  CommitOptions,
  HostKind,
  HostQuery,
  NewRepoOptions,
  Profile,
  ConflictResolution,
  FileStatus,
  GitIdentity,
  PullOptions,
  PushOptions,
  RebaseItem,
  Result,
  RepoRef,
  ResetMode,
  StashSaveOptions
} from '@shared/types'
import { gitService, GitError } from '../git/gitService'
import {
  AiError,
  aiStatus,
  composeCommits,
  explainCommit,
  generateCommitMessage,
  generatePullRequest,
  generateStashMessage,
  resolveConflictFile,
  setAiKey
} from '../ai/aiService'
import { addToAgent, generateKey, sshEnvironment, useKeyForRepo } from '../git/sshService'
import { getAvatar } from '../avatar'
import { RepoWatcher } from '../git/watcher'
import {
  addRecentRepo,
  getRecentRepos,
  pickRepoFolder,
  removeRecentRepo
} from '../repo/repoManager'
import { getSettings, saveSettings } from '../settings'
import { HostError, hostTokenStatus, listRepos, setHostToken } from '../hosts'
import {
  activateProfile,
  deleteProfile,
  getActiveProfile,
  getProfileState,
  saveProfile
} from '../profiles'

// Registers every ipcMain.handle channel and bridges git operations to the
// renderer. Each handler returns a Result<T> so errors cross the boundary as
// data (never as an unhandled throw), letting the UI show friendly messages
// (e.g. the "dubious ownership" one-click fix).

let watcher: RepoWatcher | null = null
let currentRef: RepoRef | null = null

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

function fail(e: unknown): Result<never> {
  if (e instanceof GitError || e instanceof AiError || e instanceof HostError) {
    return { ok: false, error: e.message, code: e.code }
  }
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

/**
 * Resolve a repo-relative path to an absolute one, refusing anything that would
 * escape the open repository (a crafted "../.." can't reach outside the tree).
 */
function repoAbs(rel: string): string {
  const root = gitService.currentRepo
  if (!root) throw new GitError('No repository is open', 'NO_REPO')
  const abs = path.resolve(root, rel)
  const back = path.relative(root, abs)
  if (back.startsWith('..') || path.isAbsolute(back)) {
    throw new GitError('Path is outside the repository', 'BAD_PATH')
  }
  return abs
}

/** Launch VS Code on a file via the `code` CLI; rejects if it isn't installed. */
function openInVsCode(abs: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = process.platform === 'win32'
    const cmd = win ? 'code.cmd' : 'code'
    // shell:true is required on Windows to run the .cmd shim; quote the path so
    // spaces survive the shell.
    const arg = win ? `"${abs}"` : abs
    const child = spawn(cmd, [arg], { shell: true, detached: true, stdio: 'ignore' })
    child.on('error', () =>
      reject(
        new GitError('Could not launch VS Code — is the `code` command on your PATH?', 'NO_EDITOR')
      )
    )
    child.unref()
    // A successful spawn is enough; we don't wait for the editor to exit.
    resolve()
  })
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/** Point git at the active profile's SSH key (called at boot and on switch). */
export async function applyActiveProfile(): Promise<void> {
  const profile = await getActiveProfile()
  gitService.setSshKey(profile.sshKeyPath)
}

/** Stamp the active profile's identity on the repo that was just cloned/created. */
async function applyProfileIdentity(): Promise<void> {
  const profile = await getActiveProfile()
  if (!profile.gitName.trim() && !profile.gitEmail.trim()) return
  await gitService.setLocalIdentity(profile.gitName, profile.gitEmail)
}

function startWatching(repoPath: string): void {
  watcher?.stop()
  watcher = new RepoWatcher(300, () => broadcast(IPC.EvtRepoChanged))
  watcher.start(repoPath)
}

/** Wrap a mutating action with start/done progress events + Result handling. */
async function action<T>(name: string, fn: () => Promise<T>): Promise<Result<T>> {
  broadcast(IPC.EvtProgress, { action: name, message: `${name}…`, done: false })
  // Pause the file watcher so its polling handles don't lock .git files while git
  // rewrites them (Windows/UNC) — that contention makes checkout/commit crawl/hang.
  await watcher?.pause()
  try {
    const value = await fn()
    return ok(value)
  } catch (e) {
    return fail(e)
  } finally {
    watcher?.resume()
    broadcast(IPC.EvtProgress, { action: name, message: '', done: true })
  }
}

export function registerIpcHandlers(): void {
  // --- repo management ---
  ipcMain.handle(IPC.RepoOpenDialog, async () => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const dir = await pickRepoFolder(win)
      return ok(dir)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.RepoOpen, async (_e, dir: string) => {
    try {
      const ref = await gitService.openRepo(dir)
      currentRef = ref
      await addRecentRepo(ref)
      startWatching(ref.path)
      return ok(ref)
    } catch (e) {
      return fail(e)
    }
  })

  // Clone/create run under the active profile: its SSH key authenticates the
  // clone, and its identity is stamped locally on the repo we just made (we own
  // that repo, so writing --local config into it is not a surprise).
  ipcMain.handle(IPC.RepoClone, async (_e, opts: NewRepoOptions) =>
    action('Cloning', async () => {
      const ref = await gitService.clone(opts.url ?? '', opts.parentDir, opts.name)
      await applyProfileIdentity()
      currentRef = ref
      await addRecentRepo(ref)
      startWatching(ref.path)
      return ref
    })
  )

  ipcMain.handle(IPC.RepoCreate, async (_e, opts: NewRepoOptions) =>
    action('Creating repository', async () => {
      const ref = await gitService.createRepo(opts.parentDir, opts.name)
      await applyProfileIdentity()
      currentRef = ref
      await addRecentRepo(ref)
      startWatching(ref.path)
      return ref
    })
  )

  // Same deal for initializing a folder the user tried to open: it becomes our
  // repo, so it gets the profile identity and joins the recent list.
  ipcMain.handle(IPC.RepoInit, async (_e, dir: string) =>
    action('Initializing repository', async () => {
      const ref = await gitService.initRepo(dir)
      await applyProfileIdentity()
      currentRef = ref
      await addRecentRepo(ref)
      startWatching(ref.path)
      return ref
    })
  )

  // --- hosting services (repo listing needs a token; SSH alone can't enumerate) ---
  ipcMain.handle(IPC.HostsTokenStatus, async () => {
    try {
      return ok(await hostTokenStatus())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.HostsSetToken, async (_e, kind: HostKind, token: string | null) => {
    try {
      return ok(await setHostToken(kind, token))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.HostsListRepos, async (_e, query: HostQuery) => {
    try {
      return ok(await listRepos(query))
    } catch (e) {
      return fail(e)
    }
  })

  // --- profiles ---
  ipcMain.handle(IPC.ProfilesGet, async () => {
    try {
      return ok(await getProfileState())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.ProfilesSave, async (_e, patch: Partial<Profile>) => {
    try {
      const state = await saveProfile(patch)
      await applyActiveProfile()
      return ok(state)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.ProfilesDelete, async (_e, id: string) => {
    try {
      const state = await deleteProfile(id)
      await applyActiveProfile()
      return ok(state)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.ProfilesActivate, async (_e, id: string) => {
    try {
      const state = await activateProfile(id)
      await applyActiveProfile()
      return ok(state)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.RepoRecent, async () => {
    try {
      return ok(await getRecentRepos())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.RepoRemoveRecent, async (_e, dir: string) => {
    try {
      return ok(await removeRecentRepo(dir))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.DialogPickFolder, async (_e, defaultPath?: string) => {
    try {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const res = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory', 'createDirectory'],
        // Reopen where the user last pointed a clone, not at the home folder.
        ...(defaultPath ? { defaultPath } : {})
      })
      return ok(res.canceled || !res.filePaths[0] ? null : res.filePaths[0])
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.DialogSaveFile, async (_e, defaultName: string) => {
    try {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const res = await dialog.showSaveDialog(win!, {
        defaultPath: defaultName,
        filters: [
          { name: 'Patch', extensions: ['patch'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      return ok(res.canceled || !res.filePath ? null : res.filePath)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.RepoSnapshot, async () => {
    try {
      if (!currentRef) throw new GitError('No repository is open', 'NO_REPO')
      const { commitLimit } = await getSettings()
      return ok(await gitService.snapshot(currentRef, commitLimit))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.SettingsGet, async () => {
    try {
      return ok(await getSettings())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.SettingsSet, async (_e, patch: AppSettingsPatch) => {
    try {
      return ok(await saveSettings(patch))
    } catch (e) {
      return fail(e)
    }
  })

  // --- AI assistance ---
  // Keys never cross the bridge in either direction except when the user types a
  // new one; everything else is a status flag. The prompts are built here so the
  // renderer never has to ship a whole diff through IPC.
  ipcMain.handle(IPC.AiStatus, async () => {
    try {
      return ok(await aiStatus())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.AiSetKey, async (_e, provider: AiProvider, key: string | null) => {
    try {
      return ok(await setAiKey(provider, key))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.AiCommitMessage, async () => {
    try {
      const [diff, status, recent] = await Promise.all([
        gitService.stagedPatch(),
        gitService.status(),
        gitService.log(10)
      ])
      return ok(
        await generateCommitMessage({
          diff,
          branch: status.branch,
          recentSubjects: recent.map((c) => c.subject)
        })
      )
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.AiExplainCommit, async (_e, hash: string) => {
    try {
      const raw = await gitService.commitPatch(hash)
      return ok(
        await explainCommit({
          header: 'Commit under review (hash, author, date, message, stat and patch follow):',
          patch: raw
        })
      )
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.AiStashMessage, async () => {
    try {
      return ok(await generateStashMessage({ diff: await gitService.workingPatch() }))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.AiPullRequest, async (_e, base: string) => {
    try {
      const status = await gitService.status()
      const { log, patch, commits } = await gitService.branchPatch(base)
      return ok(
        await generatePullRequest({
          base,
          branch: status.branch ?? 'HEAD',
          log,
          patch,
          commits
        })
      )
    } catch (e) {
      return fail(e)
    }
  })

  // Writes the merged file back to the working tree but deliberately leaves it
  // unstaged: the user reviews the diff and then marks it resolved themselves.
  //
  // `preview` is the merge tool's mode: nothing is written, the merged text comes
  // back and lands in the Output pane so the user can still edit it there.
  ipcMain.handle(IPC.AiResolveConflict, async (_e, filePath: string, preview?: boolean) => {
    try {
      // The merge tool works off the index stages, so it asks for the same
      // source. For the file-row button the working copy is the truth (it may
      // have been hand-edited) — but a modify/delete conflict leaves no markers
      // in it at all, so fall back to the rebuilt document there too.
      let content = preview ? '' : await gitService.conflictedFile(filePath)
      if (!content.includes('<<<<<<<')) content = await gitService.conflictDocument(filePath)
      const merged = await resolveConflictFile({ path: filePath, content })
      const outcome = { path: filePath, note: merged.note, confidence: merged.confidence }
      if (preview) return ok({ ...outcome, content: merged.content })
      await gitService.writeWorkingFile(filePath, merged.content)
      return ok(outcome)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.AiComposeCommits, async () => {
    try {
      const status = await gitService.status()
      const files = [...new Set([...status.staged, ...status.unstaged].map((f) => f.path))]
      return ok(await composeCommits({ files, diff: await gitService.workingPatch() }))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitCommitGroups, async (_e, groups: { message: string; files: string[] }[]) =>
    action('Creating commits', () => gitService.commitGroups(groups))
  )

  ipcMain.handle(IPC.RepoClose, async () => {
    await watcher?.stop()
    watcher = null
    currentRef = null
    gitService.close()
    return ok(true)
  })

  ipcMain.handle(IPC.GitTrustDirectory, async (_e, dir: string) => {
    return action('Trust directory', () => gitService.trustDirectory(dir))
  })

  ipcMain.handle(IPC.AvatarGet, async (_e, email: string) => {
    try {
      return ok(await getAvatar(email))
    } catch (e) {
      return fail(e)
    }
  })

  // --- read ---
  ipcMain.handle(IPC.GitStatus, async () => {
    try {
      return ok(await gitService.status())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitDiffFile, async (_e, filePath: string, staged: boolean) => {
    try {
      return ok(await gitService.diffFile(filePath, staged))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitCommitDiff, async (_e, hash: string) => {
    try {
      return ok(await gitService.commitDiff(hash))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitSignature, async (_e, hash: string) => {
    try {
      return ok(await gitService.signatureInfo(hash))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitFileHistory, async (_e, filePath: string) => {
    try {
      return ok(await gitService.fileHistory(filePath))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitBlame, async (_e, filePath: string) => {
    try {
      return ok(await gitService.blame(filePath))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.GitDiagnoseRemote, async (_e, name?: string) => {
    try {
      return ok(await gitService.diagnoseRemote(name))
    } catch (e) {
      return fail(e)
    }
  })

  // --- mutations ---
  ipcMain.handle(IPC.GitStage, async (_e, paths: string[]) =>
    action('Stage', () => gitService.stage(paths))
  )
  ipcMain.handle(IPC.GitUnstage, async (_e, paths: string[]) =>
    action('Unstage', () => gitService.unstage(paths))
  )
  ipcMain.handle(IPC.GitDiscard, async (_e, files: FileStatus[]) =>
    action('Discard', () => gitService.discard(files))
  )
  ipcMain.handle(IPC.GitCommit, async (_e, opts: CommitOptions) =>
    action('Commit', () => gitService.commit(opts))
  )
  ipcMain.handle(IPC.GitCheckout, async (_e, branch: string) =>
    action('Checkout', () => gitService.checkout(branch))
  )
  ipcMain.handle(
    IPC.GitCreateBranch,
    async (_e, name: string, checkout: boolean, startPoint?: string) =>
      action('Create branch', () => gitService.createBranch(name, checkout, startPoint))
  )
  ipcMain.handle(IPC.GitCreateTag, async (_e, name: string, ref: string, message?: string) =>
    action('Create tag', () => gitService.createTag(name, ref, message))
  )
  ipcMain.handle(IPC.GitPushTag, async (_e, name: string, remote?: string) =>
    action('Push tag', () => gitService.pushTag(name, remote))
  )
  ipcMain.handle(IPC.GitDeleteTag, async (_e, name: string) =>
    action('Delete tag', () => gitService.deleteTag(name))
  )
  ipcMain.handle(IPC.GitMoveBranch, async (_e, name: string, target: string) =>
    action('Move branch', () => gitService.moveBranch(name, target))
  )
  ipcMain.handle(IPC.GitAddRemote, async (_e, name: string, url: string) =>
    action('Add remote', () => gitService.addRemote(name, url))
  )
  ipcMain.handle(IPC.GitSetRemoteUrl, async (_e, name: string, url: string) =>
    action('Set remote URL', () => gitService.setRemoteUrl(name, url))
  )
  ipcMain.handle(IPC.GitRemoveRemote, async (_e, name: string) =>
    action('Remove remote', () => gitService.removeRemote(name))
  )
  ipcMain.handle(IPC.GitDeleteBranch, async (_e, name: string, force: boolean) =>
    action('Delete branch', () => gitService.deleteBranch(name, force))
  )
  ipcMain.handle(IPC.GitRenameBranch, async (_e, oldName: string, newName: string) =>
    action('Rename branch', () => gitService.renameBranch(oldName, newName))
  )
  ipcMain.handle(IPC.GitMerge, async (_e, branch: string) =>
    action('Merge', () => gitService.merge(branch))
  )
  ipcMain.handle(IPC.GitRebase, async (_e, branch: string) =>
    action('Rebase', () => gitService.rebase(branch))
  )
  ipcMain.handle(IPC.GitCherryPick, async (_e, hash: string) =>
    action('Cherry-pick', () => gitService.cherryPick(hash))
  )
  ipcMain.handle(IPC.GitRevert, async (_e, hash: string) =>
    action('Revert', () => gitService.revert(hash))
  )
  ipcMain.handle(IPC.GitReset, async (_e, hash: string, mode: ResetMode) =>
    action('Reset', () => gitService.reset(hash, mode))
  )
  ipcMain.handle(
    IPC.GitResolveConflict,
    async (_e, paths: string[], resolution: ConflictResolution) =>
      action('Resolve', () => gitService.resolveConflict(paths, resolution))
  )
  ipcMain.handle(IPC.GitUnresolveConflict, async (_e, paths: string[]) =>
    action('Unresolve', () => gitService.unresolveConflict(paths))
  )
  // Read-only: builds the 3-way model for the merge tool, so no `action` wrapper
  // (it must not flip the busy indicator or trigger a refresh).
  ipcMain.handle(IPC.GitMergeFile, async (_e, filePath: string) => {
    try {
      return ok(await gitService.mergeFile(filePath))
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(
    IPC.GitSaveMerge,
    async (_e, filePath: string, content: string, markResolved: boolean) =>
      action('Resolve', () => gitService.saveMerge(filePath, content, markResolved))
  )
  ipcMain.handle(IPC.GitOpContinue, async () =>
    action('Continue', () => gitService.continueOperation())
  )
  ipcMain.handle(IPC.GitOpAbort, async () => action('Abort', () => gitService.abortOperation()))
  ipcMain.handle(IPC.GitRebaseRange, async (_e, fromHash: string, root: boolean) => {
    try {
      return ok(await gitService.rebaseRange(fromHash, root))
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(
    IPC.GitRebaseInteractive,
    async (_e, fromHash: string, root: boolean, items: RebaseItem[]) =>
      action('Interactive rebase', () => gitService.rebaseInteractive(fromHash, root, items))
  )
  ipcMain.handle(IPC.GitSetUpstream, async (_e, branch: string, upstream: string) =>
    action('Set upstream', () => gitService.setUpstream(branch, upstream))
  )
  ipcMain.handle(IPC.GitFastForward, async (_e, branch: string, to: string) =>
    action('Fast-forward', () => gitService.fastForward(branch, to))
  )
  ipcMain.handle(IPC.GitWorktreeAdd, async (_e, dir: string, ref: string) =>
    action('Create worktree', () => gitService.worktreeAdd(dir, ref))
  )
  ipcMain.handle(IPC.GitCreatePatch, async (_e, hash: string, outPath: string) =>
    action('Create patch', () => gitService.createPatch(hash, outPath))
  )
  ipcMain.handle(IPC.GitFetch, async () => action('Fetch', () => gitService.fetch()))
  ipcMain.handle(IPC.GitPull, async (_e, opts?: PullOptions) =>
    action('Pull', () => gitService.pull(opts))
  )
  ipcMain.handle(IPC.GitPush, async (_e, opts: PushOptions) =>
    action('Push', () => gitService.push(opts))
  )
  ipcMain.handle(IPC.GitStashSave, async (_e, opts: StashSaveOptions) =>
    action('Stash', () => gitService.stashSave(opts))
  )
  ipcMain.handle(IPC.GitStashApply, async (_e, index: number) =>
    action('Stash apply', () => gitService.stashApply(index))
  )
  ipcMain.handle(IPC.GitStashPop, async (_e, index: number) =>
    action('Stash pop', () => gitService.stashPop(index))
  )
  ipcMain.handle(IPC.GitStashDrop, async (_e, index: number) =>
    action('Stash drop', () => gitService.stashDrop(index))
  )
  ipcMain.handle(IPC.GitFilePatch, async (_e, filePath: string, staged: boolean, outPath: string) =>
    action('Create patch', () => gitService.filePatch(filePath, staged, outPath))
  )
  ipcMain.handle(IPC.GitIgnore, async (_e, pattern: string) =>
    action('Ignore', () => gitService.addToIgnore(pattern))
  )
  ipcMain.handle(IPC.GitIgnorePath, async (_e, filePath: string, untrack: boolean) =>
    action('Ignore', () => gitService.ignorePath(filePath, untrack))
  )
  ipcMain.handle(IPC.GitStashFile, async (_e, filePath: string) =>
    action('Stash file', () => gitService.stashFile(filePath))
  )
  ipcMain.handle(IPC.GitExternalDiff, async (_e, filePath: string, staged: boolean) => {
    try {
      const root = gitService.currentRepo
      if (!root) throw new GitError('No repository is open', 'NO_REPO')
      const args = ['difftool', '--no-prompt']
      if (staged) args.push('--cached')
      args.push('--', filePath)
      // Fire-and-forget: a GUI difftool blocks until closed, so we detach instead
      // of awaiting (and never pause the watcher for it).
      const child = spawn('git', args, {
        cwd: root,
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32'
      })
      child.on('error', () => {})
      child.unref()
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  // --- shell / OS integrations ---
  ipcMain.handle(IPC.ShellResolvePath, async (_e, rel: string) => {
    try {
      return ok(repoAbs(rel))
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(IPC.ShellShowInFolder, async (_e, rel: string) => {
    try {
      shell.showItemInFolder(repoAbs(rel))
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(IPC.ShellOpenPath, async (_e, rel: string) => {
    try {
      const err = await shell.openPath(repoAbs(rel))
      if (err) throw new GitError(err, 'OPEN_FAILED')
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(IPC.ShellOpenInEditor, async (_e, rel: string) => {
    try {
      await openInVsCode(repoAbs(rel))
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(IPC.ShellTrashFile, async (_e, rel: string) => {
    try {
      await shell.trashItem(repoAbs(rel))
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(IPC.ShellOpenExternal, async (_e, url: string) => {
    try {
      // Only web links — never let the renderer hand the OS an arbitrary scheme.
      if (!/^https:\/\//i.test(url))
        throw new GitError('Only https links can be opened.', 'BAD_URL')
      await shell.openExternal(url)
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  // --- authentication: SSH keys + git identity ---
  ipcMain.handle(IPC.SshEnvironment, async () => {
    try {
      return ok(await sshEnvironment())
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(
    IPC.SshGenerateKey,
    async (_e, opts: { name: string; comment: string; type: 'ed25519' | 'rsa' }) =>
      action('Generate SSH key', () => generateKey(opts))
  )
  ipcMain.handle(IPC.SshAddToAgent, async (_e, keyPath: string) =>
    action('Add key to agent', () => addToAgent(keyPath))
  )
  ipcMain.handle(IPC.SshUseKeyForRepo, async (_e, keyPath: string | null) =>
    action('Set repository key', () => useKeyForRepo(keyPath))
  )
  ipcMain.handle(IPC.GitIdentityGet, async () => {
    try {
      return ok(await gitService.identity())
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(IPC.GitIdentitySet, async (_e, patch: Partial<GitIdentity>) =>
    action('Save identity', () => gitService.setIdentity(patch))
  )
}

export async function disposeIpc(): Promise<void> {
  await watcher?.stop()
  watcher = null
}
