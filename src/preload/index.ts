import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ProgressEvent } from '@shared/ipc'
import type {
  AiCommitMessage,
  AiComposerPlan,
  AiConflictResolution,
  AiKeyStatus,
  AiProvider,
  AiPullRequest,
  AppSettings,
  AppSettingsPatch,
  BlameLine,
  Commit,
  CommitOptions,
  ConflictResolution,
  DiffFile,
  FileStatus,
  GitIdentity,
  HostKind,
  HostQuery,
  HostTokenStatus,
  MergeFile,
  NewRepoOptions,
  Profile,
  ProfileState,
  ProfileWorkspace,
  PullOptions,
  PushOptions,
  RebaseItem,
  RemoteDiagnosis,
  RemoteRepoList,
  RepoRef,
  RepoSnapshot,
  ResetMode,
  Result,
  SignatureInfo,
  SshEnvironment,
  SshKey,
  StashSaveOptions,
  StatusResult
} from '@shared/types'

// contextBridge exposes a single typed `window.api` object. The renderer never
// touches ipcRenderer directly; every call is an invoke wrapper returning the
// same Result<T> the main handlers produce.

const api = {
  repo: {
    openDialog: (): Promise<Result<string | null>> => ipcRenderer.invoke(IPC.RepoOpenDialog),
    open: (dir: string): Promise<Result<RepoRef>> => ipcRenderer.invoke(IPC.RepoOpen, dir),
    recent: (): Promise<Result<RepoRef[]>> => ipcRenderer.invoke(IPC.RepoRecent),
    removeRecent: (dir: string): Promise<Result<RepoRef[]>> =>
      ipcRenderer.invoke(IPC.RepoRemoveRecent, dir),
    snapshot: (): Promise<Result<RepoSnapshot>> => ipcRenderer.invoke(IPC.RepoSnapshot),
    close: (): Promise<Result<boolean>> => ipcRenderer.invoke(IPC.RepoClose),
    clone: (opts: NewRepoOptions): Promise<Result<RepoRef>> =>
      ipcRenderer.invoke(IPC.RepoClone, opts),
    create: (opts: NewRepoOptions): Promise<Result<RepoRef>> =>
      ipcRenderer.invoke(IPC.RepoCreate, opts),
    init: (dir: string): Promise<Result<RepoRef>> => ipcRenderer.invoke(IPC.RepoInit, dir),
    trustDirectory: (dir: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitTrustDirectory, dir)
  },
  git: {
    status: (): Promise<Result<StatusResult>> => ipcRenderer.invoke(IPC.GitStatus),
    diffFile: (filePath: string, staged: boolean): Promise<Result<DiffFile>> =>
      ipcRenderer.invoke(IPC.GitDiffFile, filePath, staged),
    commitDiff: (hash: string): Promise<Result<DiffFile[]>> =>
      ipcRenderer.invoke(IPC.GitCommitDiff, hash),
    signature: (hash: string): Promise<Result<SignatureInfo>> =>
      ipcRenderer.invoke(IPC.GitSignature, hash),
    fileHistory: (filePath: string): Promise<Result<Commit[]>> =>
      ipcRenderer.invoke(IPC.GitFileHistory, filePath),
    blame: (filePath: string): Promise<Result<BlameLine[]>> =>
      ipcRenderer.invoke(IPC.GitBlame, filePath),
    diagnoseRemote: (name?: string): Promise<Result<RemoteDiagnosis>> =>
      ipcRenderer.invoke(IPC.GitDiagnoseRemote, name),
    stage: (paths: string[]): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitStage, paths),
    unstage: (paths: string[]): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitUnstage, paths),
    discard: (files: FileStatus[]): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitDiscard, files),
    commit: (opts: CommitOptions): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitCommit, opts),
    checkout: (branch: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitCheckout, branch),
    createBranch: (name: string, checkout: boolean, startPoint?: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitCreateBranch, name, checkout, startPoint),
    createTag: (name: string, ref: string, message?: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitCreateTag, name, ref, message),
    pushTag: (name: string, remote?: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitPushTag, name, remote),
    deleteTag: (name: string): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitDeleteTag, name),
    moveBranch: (name: string, target: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitMoveBranch, name, target),
    addRemote: (name: string, url: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitAddRemote, name, url),
    setRemoteUrl: (name: string, url: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitSetRemoteUrl, name, url),
    removeRemote: (name: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitRemoveRemote, name),
    deleteBranch: (name: string, force: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitDeleteBranch, name, force),
    renameBranch: (oldName: string, newName: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitRenameBranch, oldName, newName),
    merge: (branch: string): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitMerge, branch),
    rebase: (branch: string): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitRebase, branch),
    cherryPick: (hash: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitCherryPick, hash),
    revert: (hash: string): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitRevert, hash),
    reset: (hash: string, mode: ResetMode): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitReset, hash, mode),
    resolveConflict: (paths: string[], resolution: ConflictResolution): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitResolveConflict, paths, resolution),
    unresolveConflict: (paths: string[]): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitUnresolveConflict, paths),
    mergeFile: (filePath: string): Promise<Result<MergeFile>> =>
      ipcRenderer.invoke(IPC.GitMergeFile, filePath),
    saveMerge: (filePath: string, content: string, markResolved: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitSaveMerge, filePath, content, markResolved),
    continueOperation: (): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitOpContinue),
    abortOperation: (): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitOpAbort),
    rebaseRange: (fromHash: string, root: boolean): Promise<Result<Commit[]>> =>
      ipcRenderer.invoke(IPC.GitRebaseRange, fromHash, root),
    rebaseInteractive: (
      fromHash: string,
      root: boolean,
      items: RebaseItem[]
    ): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitRebaseInteractive, fromHash, root, items),
    setUpstream: (branch: string, upstream: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitSetUpstream, branch, upstream),
    fastForward: (branch: string, to: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitFastForward, branch, to),
    worktreeAdd: (dir: string, ref: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitWorktreeAdd, dir, ref),
    createPatch: (hash: string, outPath: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitCreatePatch, hash, outPath),
    filePatch: (filePath: string, staged: boolean, outPath: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitFilePatch, filePath, staged, outPath),
    ignore: (pattern: string): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitIgnore, pattern),
    ignorePath: (filePath: string, untrack: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitIgnorePath, filePath, untrack),
    stashFile: (filePath: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitStashFile, filePath),
    externalDiff: (filePath: string, staged: boolean): Promise<Result<boolean>> =>
      ipcRenderer.invoke(IPC.GitExternalDiff, filePath, staged),
    fetch: (): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitFetch),
    pull: (opts?: PullOptions): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitPull, opts),
    push: (opts: PushOptions): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitPush, opts),
    stashSave: (opts: StashSaveOptions): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitStashSave, opts),
    stashApply: (index: number): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitStashApply, index),
    stashPop: (index: number): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitStashPop, index),
    stashDrop: (index: number): Promise<Result<void>> => ipcRenderer.invoke(IPC.GitStashDrop, index)
  },
  dialog: {
    pickFolder: (defaultPath?: string): Promise<Result<string | null>> =>
      ipcRenderer.invoke(IPC.DialogPickFolder, defaultPath),
    saveFile: (defaultName: string): Promise<Result<string | null>> =>
      ipcRenderer.invoke(IPC.DialogSaveFile, defaultName)
  },
  shell: {
    resolvePath: (rel: string): Promise<Result<string>> =>
      ipcRenderer.invoke(IPC.ShellResolvePath, rel),
    showInFolder: (rel: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke(IPC.ShellShowInFolder, rel),
    openPath: (rel: string): Promise<Result<boolean>> => ipcRenderer.invoke(IPC.ShellOpenPath, rel),
    openInEditor: (rel: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke(IPC.ShellOpenInEditor, rel),
    trashFile: (rel: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke(IPC.ShellTrashFile, rel),
    openExternal: (url: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke(IPC.ShellOpenExternal, url)
  },
  ssh: {
    environment: (): Promise<Result<SshEnvironment>> => ipcRenderer.invoke(IPC.SshEnvironment),
    generateKey: (opts: {
      name: string
      comment: string
      type: 'ed25519' | 'rsa'
    }): Promise<Result<SshKey>> => ipcRenderer.invoke(IPC.SshGenerateKey, opts),
    addToAgent: (keyPath: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.SshAddToAgent, keyPath),
    useKeyForRepo: (keyPath: string | null): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.SshUseKeyForRepo, keyPath),
    deleteKey: (keyPath: string): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.SshDeleteKey, keyPath)
  },
  identity: {
    get: (): Promise<Result<GitIdentity>> => ipcRenderer.invoke(IPC.GitIdentityGet),
    set: (patch: Partial<GitIdentity>): Promise<Result<void>> =>
      ipcRenderer.invoke(IPC.GitIdentitySet, patch)
  },
  avatar: {
    get: (email: string): Promise<Result<string | null>> => ipcRenderer.invoke(IPC.AvatarGet, email)
  },
  hosts: {
    tokenStatus: (): Promise<Result<HostTokenStatus>> => ipcRenderer.invoke(IPC.HostsTokenStatus),
    setToken: (kind: HostKind, token: string | null): Promise<Result<HostTokenStatus>> =>
      ipcRenderer.invoke(IPC.HostsSetToken, kind, token),
    listRepos: (query: HostQuery): Promise<Result<RemoteRepoList>> =>
      ipcRenderer.invoke(IPC.HostsListRepos, query)
  },
  profiles: {
    get: (): Promise<Result<ProfileState>> => ipcRenderer.invoke(IPC.ProfilesGet),
    save: (patch: Partial<Profile>): Promise<Result<ProfileState>> =>
      ipcRenderer.invoke(IPC.ProfilesSave, patch),
    remove: (id: string): Promise<Result<ProfileState>> =>
      ipcRenderer.invoke(IPC.ProfilesDelete, id),
    activate: (id: string): Promise<Result<ProfileState>> =>
      ipcRenderer.invoke(IPC.ProfilesActivate, id),
    setWorkspace: (workspace: ProfileWorkspace): Promise<Result<boolean>> =>
      ipcRenderer.invoke(IPC.ProfilesSetWorkspace, workspace)
  },
  settings: {
    get: (): Promise<Result<AppSettings>> => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch: AppSettingsPatch): Promise<Result<AppSettings>> =>
      ipcRenderer.invoke(IPC.SettingsSet, patch)
  },
  ai: {
    status: (): Promise<Result<AiKeyStatus>> => ipcRenderer.invoke(IPC.AiStatus),
    setKey: (provider: AiProvider, key: string | null): Promise<Result<AiKeyStatus>> =>
      ipcRenderer.invoke(IPC.AiSetKey, provider, key),
    commitMessage: (): Promise<Result<AiCommitMessage>> => ipcRenderer.invoke(IPC.AiCommitMessage),
    explainCommit: (hash: string): Promise<Result<string>> =>
      ipcRenderer.invoke(IPC.AiExplainCommit, hash),
    stashMessage: (): Promise<Result<string>> => ipcRenderer.invoke(IPC.AiStashMessage),
    pullRequest: (base: string): Promise<Result<AiPullRequest>> =>
      ipcRenderer.invoke(IPC.AiPullRequest, base),
    // preview = return the merged text instead of writing it (the merge tool).
    resolveConflict: (filePath: string, preview?: boolean): Promise<Result<AiConflictResolution>> =>
      ipcRenderer.invoke(IPC.AiResolveConflict, filePath, preview),
    composeCommits: (): Promise<Result<AiComposerPlan>> => ipcRenderer.invoke(IPC.AiComposeCommits),
    commitGroups: (groups: { message: string; files: string[] }[]): Promise<Result<number>> =>
      ipcRenderer.invoke(IPC.GitCommitGroups, groups)
  },
  events: {
    onRepoChanged: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.EvtRepoChanged, listener)
      return () => ipcRenderer.removeListener(IPC.EvtRepoChanged, listener)
    },
    onProgress: (cb: (evt: ProgressEvent) => void): (() => void) => {
      const listener = (_e: unknown, payload: ProgressEvent): void => cb(payload)
      ipcRenderer.on(IPC.EvtProgress, listener)
      return () => ipcRenderer.removeListener(IPC.EvtProgress, listener)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
