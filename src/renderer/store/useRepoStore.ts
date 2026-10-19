import { create } from 'zustand'
import { applyAccent } from '@renderer/lib/accents'
import type {
  AiCommitMessage,
  AiComposerCommit,
  AiComposerPlan,
  AiFeatureKey,
  AiKeyStatus,
  AiProvider,
  AiPullRequest,
  AiSettingsPatch,
  AiTestResult,
  AppSettings,
  AppSettingsPatch,
  BlameLine,
  Commit,
  CommitOptions,
  DiffFile,
  ConflictResolution,
  FileStatus,
  HostKind,
  HostQuery,
  HostTokenStatus,
  MergeFile,
  NewRepoOptions,
  Profile,
  ProfileState,
  ProfileWorkspace,
  RemoteRepo,
  RemoteRepoList,
  PullOptions,
  PushOptions,
  GitIdentity,
  RebaseAction,
  RebaseItem,
  RemoteDiagnosis,
  RepoRef,
  RepoSnapshot,
  ResetMode,
  Result,
  SshEnvironment,
  SshKey,
  StashSaveOptions
} from '@shared/types'

export type SelectionMode = 'working' | 'commit'

/** One row in the interactive-rebase editor (carries the subject for display). */
export interface RebasePlanItem {
  hash: string
  subject: string
  action: RebaseAction
}

export interface RebasePlan {
  fromHash: string
  root: boolean
  items: RebasePlanItem[]
}

export interface FileHistory {
  path: string
  commits: Commit[]
}

export interface BlameView {
  path: string
  lines: BlameLine[]
}

/** Outcome of an AI merge preview — the merged text, or why there isn't one. */
export type AiMergePreview =
  | { ok: true; content: string; note: string; confidence: number | null }
  | { ok: false; error: string }

/** Options for the in-app text prompt (Electron has no working window.prompt). */
export interface AskInputOptions {
  title: string
  initial?: string
  placeholder?: string
  okLabel?: string
  /** Explanatory line under the title (confirm dialogs carry the question here). */
  message?: string
  /** Confirm mode: no text field, OK resolves a non-null value, Cancel null. */
  confirm?: boolean
}

interface PromptRequest extends AskInputOptions {
  resolve: (value: string | null) => void
}

export interface Toast {
  id: number
  kind: 'error' | 'info'
  message: string
  /** Error code from the main process, used to offer contextual fixes. */
  code?: string
  /** Path involved (used by the dubious-ownership one-click fix). */
  path?: string
}

interface RepoState {
  ref: RepoRef | null
  snapshot: RepoSnapshot | null
  recent: RepoRef[]
  /** False until the first init() completes — drives the startup splash. */
  booted: boolean
  loading: boolean
  /** Human-readable phase shown on the loading overlay while opening a repo. */
  loadingMsg: string | null
  busy: string | null
  /** The raw action name behind `busy` ('Fetch' | 'Pull' | 'Push' | …), so a
   *  button can show a spinner only for the operation it actually started. */
  busyAction: string | null
  toasts: Toast[]

  // selection
  mode: SelectionMode
  selectedCommit: string | null
  selectedPath: string | null
  selectedStaged: boolean
  diff: DiffFile | null
  commitDiffs: DiffFile[] | null

  // lifecycle
  init: () => Promise<void>
  openDialog: () => Promise<void>
  openRepo: (dir: string) => Promise<void>
  removeRecent: (dir: string) => Promise<void>
  closeRepo: () => Promise<void>
  refresh: () => Promise<void>

  // tabs — several repositories open at once, GitKraken-style
  /** Every open repository, in tab order. */
  tabs: RepoRef[]
  /** True while the "Repositories" (new tab) screen is showing over the repo. */
  pickerOpen: boolean
  openPicker: (open: boolean) => void
  activateTab: (repoPath: string) => Promise<void>
  closeTab: (repoPath: string) => Promise<void>

  // profiles — SSH key + identity + settings, all switched together
  profiles: Profile[]
  activeProfileId: string
  loadProfiles: () => Promise<void>
  saveProfile: (patch: Partial<Profile>) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  activateProfile: (id: string) => Promise<void>

  // clone / create (both run under the active profile's SSH key)
  cloneRepo: (opts: NewRepoOptions) => Promise<boolean>
  createRepo: (opts: NewRepoOptions) => Promise<boolean>
  /** `git init` an existing folder and open it — offered when Open hits a non-repo. */
  initRepo: (dir: string) => Promise<boolean>
  /** Native folder picker, opened at `defaultPath` when one is given. */
  pickFolder: (defaultPath?: string) => Promise<string | null>

  // hosting services — listing repositories needs an API token per profile
  hostTokens: HostTokenStatus | null
  hostRepos: RemoteRepo[] | null
  /** Who/what the token turned out to be — only filled in when the list is empty. */
  hostAccount: Omit<RemoteRepoList, 'repos'> | null
  hostLoading: boolean
  hostError: string | null
  loadHostTokens: () => Promise<void>
  setHostToken: (kind: HostKind, token: string | null) => Promise<void>
  listHostRepos: (query: HostQuery) => Promise<void>
  clearHostRepos: () => void

  // selection actions
  selectWorking: () => Promise<void>
  selectCommit: (hash: string) => Promise<void>
  selectWorkingFile: (path: string, staged: boolean) => Promise<void>
  selectCommitFile: (path: string) => void

  // git mutations
  stage: (paths: string[]) => Promise<void>
  unstage: (paths: string[]) => Promise<void>
  discard: (files: FileStatus[]) => Promise<void>
  commit: (opts: CommitOptions) => Promise<void>
  checkout: (branch: string) => Promise<void>
  createBranch: (name: string, checkout: boolean, startPoint?: string) => Promise<void>
  createTag: (name: string, ref: string, message?: string) => Promise<void>
  pushTag: (name: string) => Promise<void>
  deleteTag: (name: string) => Promise<void>
  moveBranch: (name: string, target: string) => Promise<void>
  addRemote: (name: string, url: string) => Promise<void>
  setRemoteUrl: (name: string, url: string) => Promise<void>
  removeRemote: (name: string) => Promise<void>
  // remote connectivity diagnostics ("Could not read from remote repository")
  remoteDiag: RemoteDiagnosis | null
  remoteDiagOpen: boolean
  remoteDiagLoading: boolean
  remoteDiagTarget: string | null
  openRemoteDiagnostics: (name?: string) => Promise<void>
  closeRemoteDiagnostics: () => void
  deleteBranch: (name: string, force: boolean) => Promise<Result<void>>
  renameBranch: (oldName: string, newName: string) => Promise<void>
  merge: (branch: string) => Promise<void>
  rebase: (branch: string) => Promise<void>
  cherryPick: (hash: string) => Promise<void>
  revert: (hash: string) => Promise<void>
  reset: (hash: string, mode: ResetMode) => Promise<void>
  resolveConflict: (paths: string[], resolution: ConflictResolution) => Promise<void>
  /** Put a resolved file back into conflict (git checkout --merge). */
  unresolveConflict: (path: string) => Promise<void>
  /**
   * Files resolved by hand during the current operation, so the panel can list
   * them separately. Cleared as soon as no operation is in progress.
   */
  resolvedPaths: string[]
  continueOperation: () => Promise<void>
  abortOperation: () => Promise<void>
  // 3-way merge tool
  mergeTool: MergeFile | null
  mergeToolLoading: boolean
  openMergeTool: (path: string) => Promise<void>
  closeMergeTool: () => void
  saveMerge: (path: string, content: string, markResolved: boolean) => Promise<boolean>
  // interactive rebase
  rebasePlan: RebasePlan | null
  startInteractiveRebase: (commit: Commit) => Promise<void>
  setRebasePlanItems: (items: RebasePlanItem[]) => void
  cancelRebasePlan: () => void
  runInteractiveRebase: () => Promise<void>
  // per-file history
  fileHistory: FileHistory | null
  openFileHistory: (path: string) => Promise<void>
  closeFileHistory: () => void
  viewFileAtCommit: (hash: string, path: string) => Promise<void>
  // blame
  blame: BlameView | null
  openBlame: (path: string) => Promise<void>
  closeBlame: () => void
  /**
   * Make sure `name` (default 'origin') exists before a remote op, asking for a
   * URL when the repository has no remotes at all. False = don't run the op.
   */
  ensureRemote: (name?: string) => Promise<boolean>
  fetch: () => Promise<void>
  pull: (opts?: PullOptions) => Promise<void>
  push: (opts?: PushOptions) => Promise<void>
  setUpstream: (branch: string, upstream: string) => Promise<void>
  fastForward: (branch: string, to: string) => Promise<void>
  createWorktree: (ref: string) => Promise<void>
  createPatch: (hash: string, shortHash: string) => Promise<void>
  // Working-tree file context-menu actions
  patchFile: (path: string, staged: boolean) => Promise<void>
  ignoreFile: (pattern: string) => Promise<void>
  ignorePath: (file: FileStatus) => Promise<void>
  stashFile: (path: string) => Promise<void>
  externalDiff: (path: string, staged: boolean) => Promise<void>
  copyFilePath: (path: string) => Promise<void>
  showInFolder: (path: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  openInEditor: (path: string) => Promise<void>
  trashFile: (file: FileStatus) => Promise<void>
  // Solo focus: when set, the graph dims commits not reachable from this branch tip.
  soloBranch: string | null
  setSolo: (branch: string | null) => void
  stashSave: (opts: StashSaveOptions) => Promise<void>
  stashApply: (index: number) => Promise<void>
  stashPop: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  trustDirectory: (dir: string) => Promise<void>

  // toasts
  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void

  // in-app text prompt (replaces the unsupported window.prompt)
  promptReq: PromptRequest | null
  askInput: (opts: AskInputOptions) => Promise<string | null>
  /** Same modal in confirm mode — resolves true only if the user accepts. */
  askConfirm: (opts: Omit<AskInputOptions, 'confirm' | 'initial'>) => Promise<boolean>
  resolvePrompt: (value: string | null) => void

  // settings
  settings: AppSettings
  settingsOpen: boolean
  settingsTab: SettingsTab
  setSettingsOpen: (open: boolean, tab?: SettingsTab) => void
  updateSettings: (patch: AppSettingsPatch) => Promise<void>
  /** Patch just the AI branch of the settings (merged in main, see settings.ts). */
  updateAi: (patch: AiSettingsPatch) => Promise<void>

  // AI assistance
  /** Which providers have a key stored — never the key itself. */
  aiStatus: AiKeyStatus | null
  /** The feature currently waiting on the model (drives spinners/disabled state). */
  aiBusy: AiFeatureKey | null
  /** The explanation shown in CommitDetail, for one commit at a time. */
  aiExplain: { hash: string; text: string } | null
  /** The proposed Commit Composer plan, shown in its own dialog. */
  composerPlan: AiComposerPlan | null
  /** The generated pull-request text (and the dialog's open/base state). */
  prDraft: { open: boolean; base: string; result: AiPullRequest | null }
  loadAiStatus: () => Promise<void>
  saveAiKey: (provider: AiProvider, key: string | null) => Promise<void>
  /** One tiny real request with the current provider/key/model (Settings → AI). */
  testAi: () => Promise<Result<AiTestResult>>
  generateCommitMessage: () => Promise<AiCommitMessage | null>
  explainCommit: (hash: string) => Promise<void>
  closeAiExplain: () => void
  generateStashMessage: () => Promise<string | null>
  aiResolveConflict: (path: string) => Promise<void>
  /**
   * Same call, but hands the merged text back instead of writing it. Reports the
   * failure to the caller rather than toasting it: the merge tool is a full-screen
   * dialog, and the message belongs inside it.
   */
  aiMergePreview: (path: string) => Promise<AiMergePreview>
  composeCommits: () => Promise<void>
  closeComposer: () => void
  applyComposerPlan: (commits: AiComposerCommit[]) => Promise<void>
  openPullRequest: (base: string) => void
  closePullRequest: () => void
  generatePullRequest: (base: string) => Promise<void>

  // authentication (Settings > SSH keys / Git profile)
  ssh: SshEnvironment | null
  sshLoading: boolean
  /** Why the SSH section couldn't load (null while fine) — shown with a Retry. */
  sshError: string | null
  loadSsh: () => Promise<void>
  generateSshKey: (opts: {
    name: string
    comment: string
    type: 'ed25519' | 'rsa'
  }) => Promise<void>
  addKeyToAgent: (keyPath: string) => Promise<void>
  pinRepoKey: (keyPath: string | null) => Promise<void>
  /** Move a key pair to the OS trash, after asking. */
  deleteSshKey: (key: SshKey) => Promise<void>
  copyText: (text: string, what: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  identity: GitIdentity | null
  identityError: string | null
  loadIdentity: () => Promise<void>
  saveIdentity: (patch: Partial<GitIdentity>) => Promise<void>
}

/** Sections of the Settings dialog (also the deep-link target from toasts). */
export type SettingsTab = 'profiles' | 'general' | 'profile' | 'ssh' | 'ai' | 'appearance'

const DEFAULT_SETTINGS: AppSettings = {
  accent: 'blue',
  avatars: true,
  commitLimit: 500,
  pullMode: 'ff',
  autoFetchMinutes: 0,
  reopenLastRepo: true,
  confirmDiscard: true,
  diffFormat: 'line-by-line',
  cloneDir: '',
  ai: {
    enabled: false,
    provider: 'anthropic',
    baseUrl: '',
    features: {
      commitMessage: { model: '', instructions: '' },
      explainCommit: { model: '', instructions: '' },
      stashMessage: { model: '', instructions: '' },
      pullRequest: { model: '', instructions: '' },
      conflictResolution: { model: '', instructions: '' },
      commitComposer: { model: '', instructions: '' }
    }
  }
}

/**
 * Call a preload API defensively. `ipcRenderer.invoke` REJECTS when no handler is
 * registered, and `window.api.x` is undefined when the renderer outlives the
 * preload that defined it (an app updated under a running window). Either way an
 * unguarded `await` leaves a section stuck on "Loading…" forever, so turn both
 * into an ordinary failed Result.
 */
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: `${msg}\nIf the app was updated while running, restart it.`,
      code: 'IPC_FAILED'
    }
  }
}

/** Unwrap a Result, surfacing errors as toasts. Returns value or null. */
function unwrap<T>(get: () => RepoState, res: Result<T>, path?: string): T | null {
  if (res.ok) return res.value
  get().pushToast({ kind: 'error', message: res.error, code: res.code, path })
  return null
}

// Snapshots are slow over a WSL/UNC path, and a checkout plus its file-watcher
// events can each ask for one. These flags coalesce concurrent refreshes into a
// single in-flight run with at most one queued re-run, so requests never pile up.
let refreshing = false
let refreshQueued = false
// Bumped by every optimistic edit of the snapshot (see moveFilesLocally). A
// snapshot request that was already in flight when the edit happened describes
// the world BEFORE it, so applying it would visibly bounce the row back to the
// other list until the next round arrives. Compare this before applying one.
let localMutation = 0
// One checkout at a time — stacking them just serializes slow git ops and "sticks".
let checkingOut = false

// Background fetch (Settings > General). A single app-wide timer, re-armed when
// the interval changes. It skips while another op runs so it never competes for
// the index lock, and stays silent on failure — an unreachable remote must not
// toast every few minutes.
let autoFetchTimer: ReturnType<typeof setInterval> | null = null
function scheduleAutoFetch(get: () => RepoState): void {
  if (autoFetchTimer) clearInterval(autoFetchTimer)
  autoFetchTimer = null
  const minutes = get().settings.autoFetchMinutes
  if (!minutes) return
  autoFetchTimer = setInterval(() => {
    const s = get()
    if (!s.ref || s.busy || s.loading) return
    void window.api.git.fetch().then((res) => {
      if (res.ok) void get().refresh()
    })
  }, minutes * 60_000)
}

/**
 * Run a history-mutating op (merge/rebase/cherry-pick/revert/reset). Always
 * refreshes afterward so the new state — including any conflicts left in the
 * working tree — shows up. Conflicts get a friendly toast instead of git's raw text.
 */
async function runHistoryOp(
  get: () => RepoState,
  fn: () => Promise<Result<void>>,
  successMsg: string
): Promise<void> {
  const res = await fn()
  if (res.ok) {
    get().pushToast({ kind: 'info', message: successMsg })
  } else if (res.code === 'CONFLICT') {
    get().pushToast({
      kind: 'error',
      message: 'Conflicts — resolve the files in the working tree, then commit.',
      code: res.code
    })
  } else {
    get().pushToast({ kind: 'error', message: res.error, code: res.code })
  }
  await get().refresh()
}

/**
 * Where a clone/create will land. The renderer has no `path` module, and the
 * separator has to follow the folder the user picked — a WSL/UNC parent
 * (\\wsl.localhost\…) is backslashed, a Linux one is not.
 */
function targetPath(opts: NewRepoOptions): string {
  const parent = opts.parentDir.replace(/[\\/]+$/, '')
  return `${parent}${parent.includes('\\') ? '\\' : '/'}${opts.name.trim()}`
}

/** Last segment of a path, either separator — no `path` module in the renderer. */
function folderName(dir: string): string {
  return (
    dir
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || dir
  )
}

/** Save the open tabs into the active profile, so they come back with it. */
async function persistWorkspace(get: () => RepoState): Promise<void> {
  const { tabs, ref } = get()
  await window.api.profiles.setWorkspace({ tabs, active: ref?.path ?? null })
}

/**
 * Bring back a profile's tabs: list them all, then open the one that was in
 * front. A tab whose repository is gone is dropped and the next one tried.
 * Expects no repository to be open (`ref === null`) when called.
 */
async function restoreWorkspace(
  set: (partial: Partial<RepoState>) => void,
  get: () => RepoState,
  ws: ProfileWorkspace
): Promise<void> {
  set({ tabs: ws.tabs })
  const order = [ws.active, ...ws.tabs.map((t) => t.path)].filter(
    (p, i, all): p is string => !!p && all.indexOf(p) === i
  )
  for (const path of order) {
    await get().openRepo(path)
    if (get().ref) return
    set({ tabs: get().tabs.filter((t) => t.path !== path) })
  }
  await persistWorkspace(get)
}

/**
 * Main has just made another profile active. Everything on screen that belongs
 * to a profile — the open repository and tabs, the recent list, settings, host
 * tokens, AI keys, the SSH view — is swapped for the new profile's.
 */
async function applyProfileSwitch(
  set: (partial: Partial<RepoState>) => void,
  get: () => RepoState,
  state: ProfileState
): Promise<void> {
  // Switching from the Repositories screen (e.g. inside the clone window)
  // should leave the user there, with the new profile's tabs behind it.
  const pickerOpen = get().pickerOpen
  await window.api.repo.close()
  set({
    profiles: state.profiles,
    activeProfileId: state.activeId,
    ref: null,
    snapshot: null,
    diff: null,
    commitDiffs: null,
    selectedCommit: null,
    selectedPath: null,
    soloBranch: null,
    mode: 'working',
    tabs: [],
    hostTokens: null,
    hostRepos: null,
    hostAccount: null,
    hostError: null,
    aiStatus: null
  })
  // The profile owns the settings too, so re-read them and re-apply the theme.
  const settings = unwrap(get, await call(() => window.api.settings.get()))
  if (settings) {
    set({ settings })
    applyAccent(settings.accent)
    scheduleAutoFetch(get)
    if (settings.ai.enabled) void get().loadAiStatus()
  }
  if (get().ssh) void get().loadSsh()
  set({ recent: unwrap(get, await window.api.repo.recent()) ?? [] })
  await restoreWorkspace(set, get, state.workspace)
  if (pickerOpen) set({ pickerOpen: true })
}

/** git sorts paths bytewise; localeCompare would reorder on every reconcile. */
function byPath(a: FileStatus, b: FileStatus): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

type SetSnapshot = (partial: Pick<RepoState, 'snapshot'>) => void

/**
 * Move files between the snapshot's staged and unstaged lists immediately.
 *
 * `git add` / `git reset` return in milliseconds, but the snapshot behind them
 * (log + graph + branches + tags + stashes) takes seconds over a WSL/UNC path.
 * Waiting for it is what made staging feel broken — the row only jumped a few
 * seconds after the click. So the lists move now and the snapshot reconciles in
 * the background; the returned undo puts them back if git actually refused.
 */
function moveFilesLocally(
  set: SetSnapshot,
  get: () => RepoState,
  paths: string[],
  toStaged: boolean
): () => void {
  const before = get().snapshot
  if (!before) return () => {}
  const wanted = new Set(paths)
  const source = toStaged ? before.status.unstaged : before.status.staged
  const moving = source.filter((f) => wanted.has(f.path))
  if (!moving.length) return () => {}

  // Staging a new file turns untracked into added (and resolves a conflict);
  // unstaging one turns it back into untracked. Everything else keeps its type.
  const retype = (f: FileStatus): FileStatus => {
    if (toStaged && f.type === 'untracked') return { ...f, type: 'added' }
    if (toStaged && f.type === 'conflicted') return { ...f, type: 'modified' }
    if (!toStaged && f.type === 'added') return { ...f, type: 'untracked' }
    return f
  }

  const without = (list: FileStatus[]): FileStatus[] => list.filter((f) => !wanted.has(f.path))
  const target = toStaged ? before.status.staged : before.status.unstaged
  const merged = [...without(target), ...moving.map(retype)].sort(byPath)

  localMutation++
  set({
    snapshot: {
      ...before,
      status: {
        ...before.status,
        staged: toStaged ? merged : without(before.status.staged),
        unstaged: toStaged ? without(before.status.unstaged) : merged
      }
    }
  })
  return () => {
    localMutation++
    set({ snapshot: before })
  }
}

/**
 * If the file being staged/unstaged is the one on screen, follow it to the other
 * side — otherwise the DiffViewer keeps showing the side it just left (which is
 * now empty) until the background refresh catches up.
 */
function followSelection(get: () => RepoState, paths: string[], toStaged: boolean): void {
  const s = get()
  if (s.mode !== 'working' || !s.selectedPath) return
  if (!paths.includes(s.selectedPath) || s.selectedStaged === toStaged) return
  void s.selectWorkingFile(s.selectedPath, toStaged)
}

/** Same idea for discard: the rows disappear now, git confirms in the background. */
function dropFilesLocally(set: SetSnapshot, get: () => RepoState, paths: string[]): () => void {
  const before = get().snapshot
  if (!before) return () => {}
  const wanted = new Set(paths)
  localMutation++
  set({
    snapshot: {
      ...before,
      status: {
        ...before.status,
        unstaged: before.status.unstaged.filter((f) => !wanted.has(f.path))
      }
    }
  })
  return () => {
    localMutation++
    set({ snapshot: before })
  }
}

export const useRepoStore = create<RepoState>((set, get) => ({
  ref: null,
  snapshot: null,
  recent: [],
  tabs: [],
  pickerOpen: false,
  profiles: [],
  activeProfileId: 'default',
  hostTokens: null,
  hostRepos: null,
  hostAccount: null,
  hostLoading: false,
  hostError: null,
  booted: false,
  loading: false,
  loadingMsg: null,
  busy: null,
  busyAction: null,
  toasts: [],

  mode: 'working',
  selectedCommit: null,
  selectedPath: null,
  selectedStaged: false,
  diff: null,
  commitDiffs: null,
  rebasePlan: null,
  fileHistory: null,
  blame: null,
  soloBranch: null,
  settings: DEFAULT_SETTINGS,
  settingsOpen: false,
  settingsTab: 'general',
  aiStatus: null,
  aiBusy: null,
  aiExplain: null,
  composerPlan: null,
  prDraft: { open: false, base: '', result: null },
  remoteDiag: null,
  remoteDiagOpen: false,
  remoteDiagLoading: false,
  remoteDiagTarget: null,

  init: async () => {
    const settingsRes = await window.api.settings.get()
    const settings = unwrap(get, settingsRes)
    if (settings) {
      set({ settings })
      applyAccent(settings.accent)
      // Which providers already have a key — drives the AI buttons' enabled state.
      if (settings.ai.enabled) void get().loadAiStatus()
    }
    const res = await window.api.repo.recent()
    const recent = unwrap(get, res) ?? []
    set({ recent })
    const profileState = unwrap(get, await call(() => window.api.profiles.get()))
    if (profileState) {
      set({ profiles: profileState.profiles, activeProfileId: profileState.activeId })
    }
    // Live refresh when the repo changes on disk.
    window.api.events.onRepoChanged(() => {
      if (get().ref) void get().refresh()
    })
    window.api.events.onProgress((evt) => {
      set({
        busy: evt.done ? null : evt.message,
        busyAction: evt.done ? null : evt.action
      })
    })
    set({ booted: true })
    scheduleAutoFetch(get)
    // Pick up where the user left off — the profile's tabs, or failing that its
    // most recent repository — unless they turned that off.
    if (!get().settings.reopenLastRepo) return
    if (profileState?.workspace.tabs.length)
      await restoreWorkspace(set, get, profileState.workspace)
    else if (recent[0]) await get().openRepo(recent[0].path)
  },

  openDialog: async () => {
    const res = await window.api.repo.openDialog()
    const dir = unwrap(get, res)
    if (dir) await get().openRepo(dir)
  },

  openRepo: async (dir) => {
    set({ loading: true, loadingMsg: 'Opening repository…', pickerOpen: false })
    const res = await window.api.repo.open(dir)
    // A plain folder isn't an error worth a toast — it's an offer. GitKraken asks
    // the same question, and answering it here keeps the user inside the Open
    // flow instead of sending them to Create with the path typed out again.
    if (!res.ok && res.code === 'NOT_A_REPO') {
      set({ loading: false, loadingMsg: null })
      const accepted = await get().askConfirm({
        title: `"${folderName(dir)}" is not a git repository`,
        message: `Do you want to initialize one here?\n${dir}\n\nExisting files are left untouched — they simply show up as unstaged changes.`,
        okLabel: 'Initialize'
      })
      if (accepted) await get().initRepo(dir)
      return
    }
    const ref = unwrap(get, res, dir)
    if (!ref) {
      set({ loading: false, loadingMsg: null })
      return
    }
    // One tab per repository; re-opening an already-open one just activates it.
    const tabs = get().tabs.some((t) => t.path === ref.path)
      ? get().tabs.map((t) => (t.path === ref.path ? ref : t))
      : [...get().tabs, ref]
    set({ ref, tabs, snapshot: null })
    void persistWorkspace(get)
    const recentRes = await window.api.repo.recent()
    set({ recent: unwrap(get, recentRes) ?? get().recent })
    set({ loadingMsg: 'Reading commit history…' })
    await get().refresh()
    await get().selectWorking()
    set({ loading: false, loadingMsg: null })
  },

  openPicker: (open) => set({ pickerOpen: open }),

  activateTab: async (repoPath) => {
    if (get().ref?.path === repoPath && !get().pickerOpen) return
    // Selection/diff belong to the tab we're leaving — drop them, keep the rest.
    set({
      pickerOpen: false,
      snapshot: null,
      diff: null,
      commitDiffs: null,
      selectedCommit: null,
      selectedPath: null,
      soloBranch: null,
      mode: 'working'
    })
    await get().openRepo(repoPath)
  },

  closeTab: async (repoPath) => {
    const tabs = get().tabs.filter((t) => t.path !== repoPath)
    const wasActive = get().ref?.path === repoPath
    set({ tabs })
    if (!wasActive) {
      void persistWorkspace(get)
      return
    }
    if (tabs.length) {
      await get().activateTab(tabs[tabs.length - 1].path)
    } else {
      await get().closeRepo()
    }
  },

  removeRecent: async (dir) => {
    const res = await window.api.repo.removeRecent(dir)
    const list = unwrap(get, res)
    if (list) set({ recent: list })
  },

  closeRepo: async () => {
    await window.api.repo.close()
    const path = get().ref?.path
    set({
      ref: null,
      snapshot: null,
      diff: null,
      commitDiffs: null,
      selectedCommit: null,
      selectedPath: null,
      mode: 'working',
      tabs: get().tabs.filter((t) => t.path !== path)
    })
    void persistWorkspace(get)
  },

  // --- profiles ---
  loadProfiles: async () => {
    const res = await call(() => window.api.profiles.get())
    const state = unwrap(get, res)
    if (state) set({ profiles: state.profiles, activeProfileId: state.activeId })
  },
  saveProfile: async (patch) => {
    const state = unwrap(get, await call(() => window.api.profiles.save(patch)))
    if (state) set({ profiles: state.profiles, activeProfileId: state.activeId })
  },
  deleteProfile: async (id) => {
    const before = get().activeProfileId
    const state = unwrap(get, await call(() => window.api.profiles.remove(id)))
    if (!state) return
    // Deleting the active profile moves main onto another one — follow it.
    if (state.activeId !== before) await applyProfileSwitch(set, get, state)
    else set({ profiles: state.profiles, activeProfileId: state.activeId })
  },
  activateProfile: async (id) => {
    if (id === get().activeProfileId) return
    // Make sure the profile we're leaving remembers exactly what was open.
    await persistWorkspace(get)
    const state = unwrap(get, await call(() => window.api.profiles.activate(id)))
    if (!state) return
    await applyProfileSwitch(set, get, state)
    const name = state.profiles.find((p) => p.id === state.activeId)?.name ?? 'profile'
    get().pushToast({ kind: 'info', message: `Switched to ${name}` })
  },

  // --- hosting services ---
  loadHostTokens: async () => {
    const res = await call(() => window.api.hosts.tokenStatus())
    if (res.ok) set({ hostTokens: res.value })
  },
  setHostToken: async (kind, token) => {
    const status = unwrap(get, await call(() => window.api.hosts.setToken(kind, token)))
    if (!status) return
    set({ hostTokens: status, hostRepos: null, hostError: null })
    get().pushToast({ kind: 'info', message: token ? 'Token saved' : 'Token removed' })
  },
  listHostRepos: async (query) => {
    set({ hostLoading: true, hostError: null, hostRepos: null, hostAccount: null })
    const res = await call(() => window.api.hosts.listRepos(query))
    set({
      hostLoading: false,
      hostRepos: res.ok ? res.value.repos : null,
      hostAccount: res.ok
        ? {
            account: res.value.account,
            orgs: res.value.orgs,
            tokenKind: res.value.tokenKind,
            scopes: res.value.scopes
          }
        : null,
      // Shown inline in the dialog instead of as a toast — that's where you look.
      hostError: res.ok ? null : res.error
    })
  },
  clearHostRepos: () =>
    set({ hostRepos: null, hostAccount: null, hostError: null, hostLoading: false }),

  // --- clone / create ---
  pickFolder: async (defaultPath) => {
    const dir = unwrap(get, await call(() => window.api.dialog.pickFolder(defaultPath)))
    // Remember it for the next clone (per profile, since settings are per profile).
    if (dir && dir !== get().settings.cloneDir) void get().updateSettings({ cloneDir: dir })
    return dir
  },
  cloneRepo: async (opts) => {
    set({ loading: true, loadingMsg: `Cloning ${opts.name}…` })
    const res = await call(() => window.api.repo.clone(opts))
    set({ loading: false, loadingMsg: null })
    // Main opens the fresh clone itself, so a DUBIOUS_OWNERSHIP failure surfaces
    // here. For a repo WE just created on the user's request there is nothing to
    // decide — trust it and carry on instead of making them confirm their own
    // clone. (Opening someone else's repo still asks; see the toast action.)
    if (!res.ok && res.code === 'DUBIOUS_OWNERSHIP') {
      get().pushToast({
        kind: 'info',
        message: `Trusting the new clone (git safe.directory) — WSL paths always need this`
      })
      await get().trustDirectory(targetPath(opts))
      return true
    }
    const ref = unwrap(get, res, targetPath(opts))
    if (!ref) return false
    await get().openRepo(ref.path)
    get().pushToast({ kind: 'info', message: `Cloned ${ref.name}` })
    return true
  },
  createRepo: async (opts) => {
    set({ loading: true, loadingMsg: `Creating ${opts.name}…` })
    const res = await call(() => window.api.repo.create(opts))
    set({ loading: false, loadingMsg: null })
    if (!res.ok && res.code === 'DUBIOUS_OWNERSHIP') {
      await get().trustDirectory(targetPath(opts))
      return true
    }
    const ref = unwrap(get, res, targetPath(opts))
    if (!ref) return false
    await get().openRepo(ref.path)
    get().pushToast({ kind: 'info', message: `Created ${ref.name}` })
    return true
  },
  initRepo: async (dir) => {
    set({ loading: true, loadingMsg: `Initializing ${folderName(dir)}…` })
    const res = await call(() => window.api.repo.init(dir))
    set({ loading: false, loadingMsg: null })
    // Same reasoning as clone/create: the user just asked for this repo, so a
    // WSL ownership complaint about it is noise — trust it and open.
    if (!res.ok && res.code === 'DUBIOUS_OWNERSHIP') {
      await get().trustDirectory(dir)
      return true
    }
    const ref = unwrap(get, res, dir)
    if (!ref) return false
    await get().openRepo(ref.path)
    get().pushToast({ kind: 'info', message: `Initialized ${ref.name}` })
    return true
  },

  refresh: async () => {
    // Coalesce: if one is already running, request a single re-run and return.
    if (refreshing) {
      refreshQueued = true
      return
    }
    refreshing = true
    try {
      do {
        refreshQueued = false
        const seq = localMutation
        const res = await window.api.repo.snapshot()
        const snapshot = unwrap(get, res)
        // Something changed the lists locally while this was in flight, so it is
        // already stale — drop it rather than bounce the UI back. The mutation
        // queued its own refresh, so a correct snapshot is on its way.
        if (localMutation !== seq) {
          refreshQueued = true
          continue
        }
        if (snapshot) {
          set({ snapshot })
          // The "Resolved files" list only means something while the merge/rebase
          // is paused; once it lands (or is aborted) it has to go.
          if (!snapshot.status.operation && get().resolvedPaths.length) set({ resolvedPaths: [] })
        }
        // Re-load the currently viewed diff so it stays in sync.
        const { mode, selectedPath, selectedStaged, selectedCommit } = get()
        if (mode === 'working' && selectedPath) {
          await get().selectWorkingFile(selectedPath, selectedStaged)
        } else if (mode === 'commit' && selectedCommit) {
          await get().selectCommit(selectedCommit)
        }
      } while (refreshQueued)
    } finally {
      refreshing = false
    }
  },

  selectWorking: async () => {
    set({
      mode: 'working',
      selectedCommit: null,
      commitDiffs: null,
      diff: null,
      selectedPath: null
    })
    const snap = get().snapshot
    const first = snap?.status.unstaged[0] ?? snap?.status.staged[0]
    if (first) await get().selectWorkingFile(first.path, first.staged)
  },

  selectCommit: async (hash) => {
    set({ mode: 'commit', selectedCommit: hash, diff: null, selectedPath: null })
    const res = await window.api.git.commitDiff(hash)
    const diffs = unwrap(get, res)
    if (diffs) {
      set({ commitDiffs: diffs })
      if (diffs[0]) get().selectCommitFile(diffs[0].path)
    }
  },

  selectWorkingFile: async (path, staged) => {
    set({ selectedPath: path, selectedStaged: staged })
    const res = await window.api.git.diffFile(path, staged)
    const diff = unwrap(get, res)
    set({ diff: diff ?? null })
  },

  selectCommitFile: (path) => {
    const diff = get().commitDiffs?.find((d) => d.path === path) ?? null
    set({ selectedPath: path, diff })
  },

  stage: async (paths) => {
    const undo = moveFilesLocally(set, get, paths, true)
    const res = await window.api.git.stage(paths)
    if (unwrap(get, res) === null) undo()
    else followSelection(get, paths, true)
    // Reconcile in the background: the lists already moved, and a snapshot over a
    // WSL/UNC path takes seconds — awaiting it is what made staging feel slow.
    void get().refresh()
  },
  unstage: async (paths) => {
    const undo = moveFilesLocally(set, get, paths, false)
    const res = await window.api.git.unstage(paths)
    if (unwrap(get, res) === null) undo()
    else followSelection(get, paths, false)
    void get().refresh()
  },
  discard: async (files) => {
    const undo = dropFilesLocally(
      set,
      get,
      files.map((f) => f.path)
    )
    // Pass the reserved-name path along so the toast can offer to stage its deletion.
    const res = await window.api.git.discard(files)
    if (unwrap(get, res, files.find((f) => f.reserved)?.path) === null) undo()
    void get().refresh()
  },
  commit: async (opts) => {
    const res = await window.api.git.commit(opts)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: opts.amend ? 'Commit amended' : 'Commit created' })
      await get().refresh()
    }
  },
  checkout: async (branch) => {
    // Ignore a new checkout while one is still running — stacking them over a slow
    // UNC path just serializes and appears to hang.
    if (checkingOut) return
    checkingOut = true
    // Checking out a remote ref lands on the matching local branch — show that name.
    const name = branch.replace(/^remotes\/[^/]+\//, '').replace(/^remotes\//, '')
    set({ busy: `Checking out ${name}…`, busyAction: 'Checkout' })
    let ok = false
    try {
      const res = await window.api.git.checkout(branch)
      if (unwrap(get, res) !== null) {
        ok = true
        // Optimistic: flip the current-branch state the graph/Toolbar/Sidebar read so
        // the ✓ moves now. The full snapshot can hang/crawl over a WSL/UNC path, so we
        // do NOT block on it — reconcile in the background instead (see below).
        const snap = get().snapshot
        if (snap) {
          localMutation++
          set({
            snapshot: {
              ...snap,
              status: { ...snap.status, branch: name },
              branches: snap.branches.map((b) => ({
                ...b,
                current: !b.isRemote && b.name === name
              }))
            }
          })
        }
        get().pushToast({ kind: 'info', message: `Checked out ${name}` })
      }
    } finally {
      // Always clear the indicator once git itself returned — never wait on refresh.
      set({ busy: null, busyAction: null })
      checkingOut = false
    }
    // Background reconcile; a slow/hung snapshot can't freeze the UI or the spinner.
    if (ok) void get().refresh()
  },
  createBranch: async (name, checkout, startPoint) => {
    unwrap(get, await window.api.git.createBranch(name, checkout, startPoint))
    await get().refresh()
  },
  createTag: async (name, ref, message) => {
    const res = await window.api.git.createTag(name, ref, message)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Tagged ${name}` })
      await get().refresh()
    }
  },
  pushTag: async (name) => {
    const res = await window.api.git.pushTag(name)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Pushed tag ${name}` })
      await get().refresh()
    }
  },
  deleteTag: async (name) => {
    const res = await window.api.git.deleteTag(name)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Deleted tag ${name}` })
      await get().refresh()
    }
  },
  moveBranch: async (name, target) => {
    const res = await window.api.git.moveBranch(name, target)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Moved ${name}` })
      await get().refresh()
    }
  },
  addRemote: async (name, url) => {
    const res = await window.api.git.addRemote(name, url)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Added remote ${name}` })
      await get().refresh()
    }
  },
  setRemoteUrl: async (name, url) => {
    const res = await window.api.git.setRemoteUrl(name, url)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Updated ${name} URL` })
      await get().refresh()
    }
  },
  removeRemote: async (name) => {
    const res = await window.api.git.removeRemote(name)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Removed remote ${name}` })
      await get().refresh()
    }
  },
  openRemoteDiagnostics: async (name) => {
    set({
      remoteDiagOpen: true,
      remoteDiagLoading: true,
      remoteDiag: null,
      remoteDiagTarget: name ?? null
    })
    const res = await window.api.git.diagnoseRemote(name)
    // The dialog may have been closed while the (slow) probe ran — don't reopen it.
    if (!get().remoteDiagOpen) return
    if (!res.ok) {
      get().pushToast({ kind: 'error', message: res.error, code: res.code })
      set({ remoteDiagOpen: false, remoteDiagLoading: false })
      return
    }
    set({ remoteDiag: res.value, remoteDiagLoading: false })
  },
  closeRemoteDiagnostics: () =>
    set({
      remoteDiagOpen: false,
      remoteDiag: null,
      remoteDiagLoading: false,
      remoteDiagTarget: null
    }),
  deleteBranch: async (name, force) => {
    const res = await window.api.git.deleteBranch(name, force)
    if (res.ok) {
      get().pushToast({ kind: 'info', message: `Deleted branch ${name}` })
      await get().refresh()
    } else if (res.code !== 'NOT_MERGED') {
      // NOT_MERGED is handled by the caller (offers force delete); toast the rest.
      get().pushToast({ kind: 'error', message: res.error, code: res.code })
    }
    return res
  },
  renameBranch: async (oldName, newName) => {
    const res = await window.api.git.renameBranch(oldName, newName)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Renamed ${oldName} → ${newName}` })
      await get().refresh()
    }
  },
  merge: async (branch) =>
    runHistoryOp(get, () => window.api.git.merge(branch), `Merged ${branch}`),
  rebase: async (branch) =>
    runHistoryOp(get, () => window.api.git.rebase(branch), `Rebased onto ${branch}`),
  cherryPick: async (hash) =>
    runHistoryOp(get, () => window.api.git.cherryPick(hash), 'Cherry-picked'),
  revert: async (hash) => runHistoryOp(get, () => window.api.git.revert(hash), 'Reverted'),
  reset: async (hash, mode) =>
    runHistoryOp(get, () => window.api.git.reset(hash, mode), `Reset (${mode})`),
  resolveConflict: async (paths, resolution) => {
    const res = await call(() => window.api.git.resolveConflict(paths, resolution))
    if (unwrap(get, res) === null) return
    set({ resolvedPaths: [...new Set([...get().resolvedPaths, ...paths])] })
    await get().refresh()
  },
  resolvedPaths: [],
  unresolveConflict: async (path) => {
    const res = await call(() => window.api.git.unresolveConflict([path]))
    if (unwrap(get, res, path) === null) return
    set({ resolvedPaths: get().resolvedPaths.filter((p) => p !== path) })
    await get().refresh()
  },

  mergeTool: null,
  mergeToolLoading: false,
  openMergeTool: async (path) => {
    set({ mergeToolLoading: true, mergeTool: null })
    const res = await call(() => window.api.git.mergeFile(path))
    const file = unwrap(get, res, path)
    set({ mergeTool: file, mergeToolLoading: false })
  },
  closeMergeTool: () => set({ mergeTool: null, mergeToolLoading: false }),
  saveMerge: async (path, content, markResolved) => {
    const res = await call(() => window.api.git.saveMerge(path, content, markResolved))
    if (unwrap(get, res, path) === null) return false
    if (markResolved) {
      set({ mergeTool: null, resolvedPaths: [...new Set([...get().resolvedPaths, path])] })
      get().pushToast({ kind: 'info', message: `Resolved ${path}` })
    }
    await get().refresh()
    return true
  },
  continueOperation: async () =>
    runHistoryOp(get, () => window.api.git.continueOperation(), 'Continued'),
  abortOperation: async () => {
    const res = await window.api.git.abortOperation()
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Operation aborted' })
      await get().refresh()
    }
  },

  startInteractiveRebase: async (commit) => {
    const root = commit.parents.length === 0
    const res = await window.api.git.rebaseRange(commit.hash, root)
    const commits = unwrap(get, res)
    if (!commits) return
    if (commits.length === 0) {
      get().pushToast({ kind: 'info', message: 'No commits to rebase from here' })
      return
    }
    set({
      rebasePlan: {
        fromHash: commit.hash,
        root,
        items: commits.map((c) => ({
          hash: c.hash,
          subject: c.subject,
          action: 'pick' as RebaseAction
        }))
      }
    })
  },
  setRebasePlanItems: (items) => {
    const plan = get().rebasePlan
    if (plan) set({ rebasePlan: { ...plan, items } })
  },
  cancelRebasePlan: () => set({ rebasePlan: null }),
  openFileHistory: async (path) => {
    const res = await window.api.git.fileHistory(path)
    const commits = unwrap(get, res)
    if (!commits) return
    if (commits.length === 0) {
      get().pushToast({ kind: 'info', message: 'No history for this file' })
      return
    }
    set({ fileHistory: { path, commits } })
  },
  closeFileHistory: () => set({ fileHistory: null }),
  viewFileAtCommit: async (hash, path) => {
    set({ fileHistory: null, blame: null })
    await get().selectCommit(hash)
    get().selectCommitFile(path)
  },
  openBlame: async (path) => {
    const res = await window.api.git.blame(path)
    const lines = unwrap(get, res)
    if (!lines) return
    set({ blame: { path, lines } })
  },
  closeBlame: () => set({ blame: null }),
  runInteractiveRebase: async () => {
    const plan = get().rebasePlan
    if (!plan) return
    const items: RebaseItem[] = plan.items.map((i) => ({ hash: i.hash, action: i.action }))
    set({ rebasePlan: null })
    await runHistoryOp(
      get,
      () => window.api.git.rebaseInteractive(plan.fromHash, plan.root, items),
      'Rebase complete'
    )
  },
  ensureRemote: async (name = 'origin') => {
    const remotes = get().snapshot?.remotes ?? []
    if (remotes.length === 0) {
      // A freshly initialized repo has nowhere to push. git's own answer is
      // "'origin' does not appear to be a git repository", which tells the user
      // nothing about what to do — ask for the URL instead and wire it up.
      const url = await get().askInput({
        title: `This repository has no "${name}" remote yet`,
        message: `Paste the URL to push to — it's saved as the "${name}" remote.`,
        placeholder: 'git@github.com:user/repo.git',
        okLabel: 'Add remote'
      })
      if (!url) return false
      await get().addRemote(name, url)
    } else if (!remotes.some((r) => r.name === name)) {
      // Remotes exist under other names: silently adding another one would be a
      // surprise, so say which ones are there and let them pick in the Sidebar.
      get().pushToast({
        kind: 'error',
        message: `No remote named "${name}". This repository has: ${remotes
          .map((r) => r.name)
          .join(', ')}.`
      })
      return false
    }
    return (get().snapshot?.remotes ?? []).some((r) => r.name === name)
  },
  fetch: async () => {
    if (!(await get().ensureRemote())) return
    unwrap(get, await window.api.git.fetch())
    await get().refresh()
  },
  pull: async (opts) => {
    if (!(await get().ensureRemote())) return
    const mode = opts?.mode ?? get().settings.pullMode
    unwrap(get, await window.api.git.pull({ mode }))
    await get().refresh()
  },
  push: async (opts) => {
    if (!(await get().ensureRemote(opts?.remote ?? 'origin'))) return
    // Re-read: adding a remote just refreshed the snapshot the defaults come from.
    const snap = get().snapshot
    const branch = snap?.status.branch ?? undefined
    const hasUpstream = !!snap?.status.upstream
    const finalOpts: PushOptions = opts ?? {
      remote: 'origin',
      branch,
      setUpstream: !hasUpstream
    }
    const res = await window.api.git.push(finalOpts)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Pushed' })
      await get().refresh()
    }
  },
  setUpstream: async (branch, upstream) => {
    const res = await window.api.git.setUpstream(branch, upstream)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Upstream set to ${upstream}` })
      await get().refresh()
    }
  },
  fastForward: async (branch, to) =>
    runHistoryOp(get, () => window.api.git.fastForward(branch, to), `Fast-forwarded ${branch}`),
  createWorktree: async (ref) => {
    const dirRes = await window.api.dialog.pickFolder()
    const dir = unwrap(get, dirRes)
    if (!dir) return
    const res = await window.api.git.worktreeAdd(dir, ref)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Worktree created' })
      await get().refresh()
    }
  },
  createPatch: async (hash, shortHash) => {
    const outRes = await window.api.dialog.saveFile(`${shortHash}.patch`)
    const out = unwrap(get, outRes)
    if (!out) return
    const res = await window.api.git.createPatch(hash, out)
    if (unwrap(get, res) !== null) get().pushToast({ kind: 'info', message: 'Patch saved' })
  },
  patchFile: async (path, staged) => {
    const base = path.split(/[\\/]/).pop() || 'changes'
    const outRes = await window.api.dialog.saveFile(`${base}.patch`)
    const out = unwrap(get, outRes)
    if (!out) return
    const res = await window.api.git.filePatch(path, staged, out)
    if (unwrap(get, res) !== null) get().pushToast({ kind: 'info', message: 'Patch saved' })
  },
  ignoreFile: async (pattern) => {
    const res = await window.api.git.ignore(pattern)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: `Ignoring ${pattern}` })
      await get().refresh()
    }
  },
  ignorePath: async (file) => {
    // .gitignore only hides UNtracked files, so a tracked file must also be
    // dropped from the index for git to stop showing it.
    const tracked = file.type !== 'untracked'
    const res = await window.api.git.ignorePath(file.path, tracked)
    if (unwrap(get, res) !== null) {
      get().pushToast({
        kind: 'info',
        message: tracked ? `Ignoring & untracking ${file.path}` : `Ignoring ${file.path}`
      })
      await get().refresh()
    }
  },
  stashFile: async (path) => {
    const res = await window.api.git.stashFile(path)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'File stashed' })
      await get().refresh()
    }
  },
  externalDiff: async (path, staged) => {
    unwrap(get, await window.api.git.externalDiff(path, staged))
  },
  copyFilePath: async (path) => {
    const res = await window.api.shell.resolvePath(path)
    const abs = unwrap(get, res)
    if (abs === null) return
    await navigator.clipboard.writeText(abs)
    get().pushToast({ kind: 'info', message: 'Copied file path' })
  },
  showInFolder: async (path) => {
    unwrap(get, await window.api.shell.showInFolder(path))
  },
  openFile: async (path) => {
    unwrap(get, await window.api.shell.openPath(path))
  },
  openInEditor: async (path) => {
    unwrap(get, await window.api.shell.openInEditor(path))
  },
  trashFile: async (file) => {
    const res = await window.api.shell.trashFile(file.path)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'File moved to trash' })
      await get().refresh()
    }
  },
  setSolo: (branch) => set({ soloBranch: branch }),
  stashSave: async (opts) => {
    const res = await window.api.git.stashSave(opts)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Changes stashed' })
      await get().refresh()
    }
  },
  stashApply: async (index) => {
    const res = await window.api.git.stashApply(index)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Stash applied' })
      await get().refresh()
    }
  },
  stashPop: async (index) => {
    const res = await window.api.git.stashPop(index)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Stash popped' })
      await get().refresh()
    }
  },
  stashDrop: async (index) => {
    const res = await window.api.git.stashDrop(index)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Stash dropped' })
      await get().refresh()
    }
  },
  trustDirectory: async (dir) => {
    const res = await window.api.repo.trustDirectory(dir)
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Directory trusted — retrying' })
      await get().openRepo(dir)
    }
  },

  pushToast: (t) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set({ toasts: [...get().toasts, { ...t, id }] })
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 8000 : 3000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  // `tab` deep-links a section (e.g. from the auth toast). The dialog loads
  // whatever that section needs, so nothing is fetched here.
  setSettingsOpen: (open, tab) => set({ settingsOpen: open, ...(tab ? { settingsTab: tab } : {}) }),
  updateSettings: async (patch) => {
    const prev = get().settings
    const res = await window.api.settings.set(patch)
    const next = unwrap(get, res)
    if (!next) return
    set({ settings: next })
    applyAccent(next.accent)
    if (next.autoFetchMinutes !== prev.autoFetchMinutes) scheduleAutoFetch(get)
    // Re-load the graph when the commit limit changes.
    if (next.commitLimit !== prev.commitLimit && get().ref) await get().refresh()
  },
  updateAi: async (patch) => {
    await get().updateSettings({ ai: patch })
  },

  loadAiStatus: async () => {
    const res = await call(() => window.api.ai.status())
    if (res.ok) set({ aiStatus: res.value })
  },
  // No toast: the AI settings panel shows the outcome inline, next to the button.
  testAi: () => call(() => window.api.ai.test()),
  saveAiKey: async (provider, key) => {
    const res = await call(() => window.api.ai.setKey(provider, key))
    const status = unwrap(get, res)
    if (!status) return
    set({ aiStatus: status })
    get().pushToast({
      kind: 'info',
      message: key ? 'API key saved' : 'API key removed'
    })
  },
  generateCommitMessage: async () => {
    if (get().aiBusy) return null
    set({ aiBusy: 'commitMessage' })
    try {
      const res = await call(() => window.api.ai.commitMessage())
      return unwrap(get, res)
    } finally {
      set({ aiBusy: null })
    }
  },
  explainCommit: async (hash) => {
    if (get().aiBusy) return
    set({ aiBusy: 'explainCommit', aiExplain: null })
    try {
      const res = await call(() => window.api.ai.explainCommit(hash))
      const text = unwrap(get, res)
      // The selection may have moved on while the model was thinking.
      if (text && get().selectedCommit === hash) set({ aiExplain: { hash, text } })
    } finally {
      set({ aiBusy: null })
    }
  },
  closeAiExplain: () => set({ aiExplain: null }),
  generateStashMessage: async () => {
    if (get().aiBusy) return null
    set({ aiBusy: 'stashMessage' })
    try {
      return unwrap(get, await call(() => window.api.ai.stashMessage()))
    } finally {
      set({ aiBusy: null })
    }
  },
  aiResolveConflict: async (path) => {
    if (get().aiBusy) return
    set({ aiBusy: 'conflictResolution' })
    try {
      const res = await call(() => window.api.ai.resolveConflict(path))
      const done = unwrap(get, res, path)
      if (!done) return
      // The file is rewritten but left unstaged on purpose — the user reviews it.
      get().pushToast({ kind: 'info', message: `${done.path}: ${done.note}` })
      await get().refresh()
      await get().selectWorkingFile(path, false)
    } finally {
      set({ aiBusy: null })
    }
  },
  aiMergePreview: async (path) => {
    if (get().aiBusy) return { ok: false, error: 'Another AI request is still running.' }
    set({ aiBusy: 'conflictResolution' })
    try {
      const res = await call(() => window.api.ai.resolveConflict(path, true))
      if (!res.ok) return { ok: false, error: res.error }
      if (!res.value.content) {
        // An older main process ignoring the `preview` flag: it wrote the file
        // and answered without the text. Say so instead of failing silently.
        return {
          ok: false,
          error:
            'The merged text did not come back — restart the app so it picks up the new main process.'
        }
      }
      return {
        ok: true,
        content: res.value.content,
        note: res.value.note,
        confidence: res.value.confidence ?? null
      }
    } finally {
      set({ aiBusy: null })
    }
  },
  composeCommits: async () => {
    if (get().aiBusy) return
    set({ aiBusy: 'commitComposer' })
    try {
      const plan = unwrap(get, await call(() => window.api.ai.composeCommits()))
      if (plan) set({ composerPlan: plan })
    } finally {
      set({ aiBusy: null })
    }
  },
  closeComposer: () => set({ composerPlan: null }),
  applyComposerPlan: async (commits) => {
    const groups = commits.map((c) => ({
      message: c.description ? `${c.summary}\n\n${c.description}` : c.summary,
      files: c.files
    }))
    const made = unwrap(get, await call(() => window.api.ai.commitGroups(groups)))
    if (made === null) {
      // Leave the plan open so the user can retry after fixing whatever failed.
      await get().refresh()
      return
    }
    set({ composerPlan: null })
    get().pushToast({ kind: 'info', message: `Created ${made} commit${made === 1 ? '' : 's'}` })
    await get().refresh()
  },
  openPullRequest: (base) => set({ prDraft: { open: true, base, result: null } }),
  closePullRequest: () => set({ prDraft: { open: false, base: '', result: null } }),
  generatePullRequest: async (base) => {
    if (get().aiBusy) return
    set({ aiBusy: 'pullRequest', prDraft: { ...get().prDraft, base, result: null } })
    try {
      const res = unwrap(get, await call(() => window.api.ai.pullRequest(base)))
      if (res && get().prDraft.open) set({ prDraft: { open: true, base, result: res } })
    } finally {
      set({ aiBusy: null })
    }
  },

  ssh: null,
  sshLoading: false,
  sshError: null,
  identity: null,
  identityError: null,
  loadSsh: async () => {
    set({ sshLoading: true, sshError: null })
    const res = await call(() => window.api.ssh.environment())
    set({
      ssh: res.ok ? res.value : null,
      sshError: res.ok ? null : res.error,
      sshLoading: false
    })
  },
  generateSshKey: async (opts) => {
    const res = await call(() => window.api.ssh.generateKey(opts))
    const key = unwrap(get, res)
    if (!key) return
    await get().loadSsh()
    get().pushToast({
      kind: 'info',
      message: `Created ${key.name} — copy the public key and add it to your git host.`
    })
  },
  addKeyToAgent: async (keyPath) => {
    const res = await call(() => window.api.ssh.addToAgent(keyPath))
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Key loaded into ssh-agent' })
      await get().loadSsh()
    }
  },
  pinRepoKey: async (keyPath) => {
    const res = await call(() => window.api.ssh.useKeyForRepo(keyPath))
    if (unwrap(get, res) !== null) {
      get().pushToast({
        kind: 'info',
        message: keyPath
          ? 'This repository now authenticates with that key'
          : 'Repository key cleared — ssh picks the key again'
      })
      await get().loadSsh()
    }
  },
  deleteSshKey: async (key) => {
    const users = get()
      .profiles.filter((p) => p.sshKeyPath === key.path)
      .map((p) => `"${p.name}"`)
    const accepted = await get().askConfirm({
      title: `Delete SSH key "${key.name}"?`,
      message:
        `${key.path}${key.publicKey ? ' and its .pub' : ''} will be moved to the trash.` +
        (users.length
          ? `\n\nThe ${users.join(', ')} profile(s) use this key and will fall back to ssh's default key.`
          : '') +
        (key.usedByRepo ? '\n\nThis repository is pinned to it — the pin is removed.' : '') +
        '\n\nRemember to remove the public key from your git host too.',
      okLabel: 'Delete'
    })
    if (!accepted) return
    const res = await call(() => window.api.ssh.deleteKey(key.path))
    if (unwrap(get, res) === null) return
    get().pushToast({ kind: 'info', message: `${key.name} moved to the trash` })
    await Promise.all([get().loadSsh(), get().loadProfiles()])
  },
  copyText: async (text, what) => {
    await navigator.clipboard.writeText(text)
    get().pushToast({ kind: 'info', message: `Copied ${what}` })
  },
  openExternal: async (url) => {
    unwrap(get, await call(() => window.api.shell.openExternal(url)))
  },
  loadIdentity: async () => {
    const res = await call(() => window.api.identity.get())
    set({ identity: res.ok ? res.value : null, identityError: res.ok ? null : res.error })
  },
  saveIdentity: async (patch) => {
    const res = await call(() => window.api.identity.set(patch))
    if (unwrap(get, res) !== null) {
      get().pushToast({ kind: 'info', message: 'Git identity saved' })
      await get().loadIdentity()
      if (get().ref) await get().refresh()
    }
  },

  promptReq: null,
  askInput: (opts) =>
    new Promise<string | null>((resolve) => {
      // If a prompt is already open, cancel it first so we never orphan a resolver.
      const existing = get().promptReq
      if (existing) existing.resolve(null)
      set({ promptReq: { ...opts, resolve } })
    }),
  askConfirm: async (opts) => (await get().askInput({ ...opts, confirm: true })) !== null,
  resolvePrompt: (value) => {
    const req = get().promptReq
    if (req) {
      set({ promptReq: null })
      req.resolve(value)
    }
  }
}))
