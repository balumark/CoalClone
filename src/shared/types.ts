// Shared types used across main, preload, and renderer.
// This is the single source of truth for the IPC data contract.

export interface RepoRef {
  path: string
  name: string
}

export interface CommitRef {
  hash: string
  shortHash: string
  parents: string[]
}

export interface Commit extends CommitRef {
  subject: string
  body: string
  authorName: string
  authorEmail: string
  authorDate: string // ISO string
  refs: string[] // e.g. ["HEAD -> main", "origin/main", "tag: v1.0"]
}

/** One row of the rendered commit graph, aligned 1:1 with the commit list. */
export interface GraphRow {
  hash: string
  /** Column (lane) this commit's node sits in. */
  lane: number
  /** Color index for this commit's lane. */
  color: number
  /** Vertical pass-through lanes at this row: { lane, color } for edges that skip this commit. */
  passLanes: GraphLane[]
  /** Edges leaving this node downward toward each parent: target lane + color. */
  parentEdges: GraphEdge[]
  /** Total number of lanes occupied at this row (for width calc). */
  width: number
}

export interface GraphLane {
  lane: number
  color: number
}

export interface GraphEdge {
  fromLane: number
  toLane: number
  color: number
  parentHash: string
}

export type FileChangeType =
  'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'unknown'

export interface FileStatus {
  path: string
  /** Original path for renames/copies. */
  origPath?: string
  type: FileChangeType
  staged: boolean
  /**
   * The name is a reserved Windows device name (NUL, CON, COM1…) and we're on
   * Windows, so the file can never exist in this working tree — it shows as a
   * deletion that only a commit can clear.
   */
  reserved?: boolean
}

/** A multi-step git operation left in progress (usually by a conflict). */
export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

/** How to resolve a conflicted file: take one side, or accept a manual edit. */
export type ConflictResolution = 'ours' | 'theirs' | 'mark'

// --- 3-way merge tool --------------------------------------------------------

/**
 * What a run of lines means in a 3-way merge:
 * - `common`: neither side touched it
 * - `ours` / `theirs`: exactly one side changed it, so it auto-merges to that side
 * - `conflict`: both sides changed it differently — the user has to decide
 */
export type MergeSegmentKind = 'common' | 'ours' | 'theirs' | 'conflict'

/** One run of lines, lined up across the base, ours and theirs versions. */
export interface MergeSegment {
  kind: MergeSegmentKind
  base: string[]
  ours: string[]
  theirs: string[]
  /** 0-based line offset of this run in each of the three versions. */
  baseStart: number
  oursStart: number
  theirsStart: number
}

/** Who one side of the merge is — the header above each pane. */
export interface MergeSide {
  /** Branch or ref name, when git could name the commit. */
  label: string
  /** Abbreviated commit hash. */
  commit: string
}

/** Everything the merge tool needs for one conflicted file. */
export interface MergeFile {
  path: string
  /** Stage 2 — the branch you are on (during a rebase: the side being replayed onto). */
  ours: MergeSide
  /** Stage 3 — the incoming commit. */
  theirs: MergeSide
  segments: MergeSegment[]
  /** How many segments need a decision. */
  conflicts: number
  /** No stage 1: an add/add conflict, so the whole file is one conflict. */
  noBase: boolean
  /** One side is binary — the tool can only offer whole-file ours/theirs. */
  binary: boolean
  /** Line endings + final newline of the ours side; the save reuses them. */
  crlf: boolean
  trailingNewline: boolean
}

export interface StatusResult {
  staged: FileStatus[]
  unstaged: FileStatus[]
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  isClean: boolean
  /** Non-null while a merge/rebase/cherry-pick/revert is paused (e.g. on conflict). */
  operation: GitOperation | null
  /** True when a signing key (user.signingkey) is configured, so commits can be signed. */
  signingConfigured: boolean
}

export interface Branch {
  name: string
  current: boolean
  isRemote: boolean
  upstream: string | null
  ahead: number
  behind: number
  commit: string
}

export interface Remote {
  name: string
  fetchUrl: string
  pushUrl: string
}

/** Transport a remote URL uses, parsed from its fetch URL. */
export type RemoteProtocol = 'ssh' | 'https' | 'git' | 'local' | 'other'

/**
 * Outcome of testing whether the current repo's remote can actually be reached
 * (i.e. whether fetch/pull will work), coarse enough to drive a specific fix hint:
 * - `ok`: `git ls-remote` succeeded — fetch/pull will work.
 * - `no-access`: authenticated, but the account can't see the repo (private repo
 *   with no permission, or an org SSO key that isn't authorized). GitHub reports
 *   this as "Repository not found".
 * - `auth-failed`: the server rejected every credential (SSH "Permission denied").
 * - `host-unreachable`: DNS/network/host-key failure — never got to auth.
 * - `https-auth`: an HTTPS remote that needs a username + token (no credentials).
 * - `unknown`: the failure didn't match any known signature.
 */
export type RemoteReachability =
  'ok' | 'no-access' | 'auth-failed' | 'host-unreachable' | 'https-auth' | 'unknown'

/** One SSH identity file in ~/.ssh, probed against the remote's host. */
export interface SshKeyProbe {
  /** Private-key file name (e.g. `id_ed25519`), not the full path. */
  name: string
  /** Whether a matching `.pub` file exists next to it. */
  hasPublic: boolean
  /** What `ssh -i <key> -T <user>@<host>` did with this key. */
  status: 'authenticated' | 'denied' | 'error'
  /** The server's greeting/error line (e.g. "Hi balumark! You've successfully…"). */
  message: string
  /** Account the host greeted this key as, when it names one (GitHub/GitLab/Bitbucket). */
  identity?: string
}

/** Full diagnosis of a remote's reachability, for the Remote Diagnostics dialog. */
export interface RemoteDiagnosis {
  /** Remote name that was tested (e.g. `origin`). */
  remote: string
  /** Its fetch URL. */
  url: string
  protocol: RemoteProtocol
  /** Host parsed from the URL (e.g. `github.com`), or null for local/unparseable. */
  host: string | null
  /** SSH user parsed from the URL (usually `git`), when applicable. */
  user: string | null
  reachability: RemoteReachability
  /** The tail of git's own stderr, shown verbatim for context. */
  detail: string
  /** SSH keys found and probed (empty for non-SSH remotes). */
  sshKeys: SshKeyProbe[]
  /** Ordered, plain-language remediation steps for this outcome. */
  hints: string[]
}

export interface Tag {
  name: string
  commit: string
}

export interface Stash {
  index: number
  message: string
  branch: string
  /** The stash's own commit hash. */
  hash: string
  /** The base commit the stash was created on top of (its first parent). */
  parentHash: string
}

export type SubmoduleState = 'ok' | 'modified' | 'uninitialized' | 'conflict'

export interface Submodule {
  path: string
  hash: string
  shortHash: string
  state: SubmoduleState
  /** Described ref (branch/tag/describe), when available. */
  ref?: string
}

export interface DiffLine {
  type: 'context' | 'add' | 'del' | 'header' | 'hunk'
  content: string
  oldLine: number | null
  newLine: number | null
}

export interface DiffFile {
  path: string
  origPath?: string
  binary: boolean
  /** Raw unified diff text (fed to diff2html in the renderer). */
  raw: string
  additions: number
  deletions: number
}

/** One line of `git blame` output: the line and the commit that last touched it. */
export interface BlameLine {
  line: number
  content: string
  hash: string
  shortHash: string
  author: string
  authorTime: string // ISO string ('' for not-yet-committed lines)
  summary: string
}

/** Aggregated snapshot the renderer stores after opening/refreshing a repo. */
export interface RepoSnapshot {
  ref: RepoRef
  status: StatusResult
  commits: Commit[]
  graph: GraphRow[]
  branches: Branch[]
  remotes: Remote[]
  tags: Tag[]
  stashes: Stash[]
  submodules: Submodule[]
}

/** Persisted user preferences (userData/settings.json). */
export interface AppSettings {
  /** Accent color preset key (see renderer lib/accents.ts). */
  accent: string
  /** Fetch Gravatar author avatars (off = identicon only, no network). */
  avatars: boolean
  /** How many commits to load into the graph. */
  commitLimit: number
  /** Default action for the Pull button (see PullMode). */
  pullMode: PullMode
  /** Background `fetch --all --prune` interval in minutes; 0 disables it. */
  autoFetchMinutes: number
  /** Re-open the most recent repository on launch. */
  reopenLastRepo: boolean
  /** Ask before discarding working-tree changes. */
  confirmDiscard: boolean
  /** Diff layout remembered across sessions. */
  diffFormat: 'side-by-side' | 'line-by-line'
  /** Folder the last clone/create was pointed at; prefills the next one. */
  cloneDir: string
  /** GitKraken-style AI assistance (the API key itself lives outside this file). */
  ai: AiSettings
}

// --- AI assistance -----------------------------------------------------------

/** Which service the AI calls go to. `custom` = any OpenAI-compatible base URL. */
export type AiProvider = 'anthropic' | 'openai' | 'google' | 'custom'

/** The things the AI can do; each one has its own model + custom instructions. */
export type AiFeatureKey =
  | 'commitMessage'
  | 'explainCommit'
  | 'stashMessage'
  | 'pullRequest'
  | 'conflictResolution'
  | 'commitComposer'

export interface AiFeatureConfig {
  /** Model id; empty falls back to the provider's default. */
  model: string
  /** Free-text steering appended to the system prompt ("Custom Instructions"). */
  instructions: string
}

export interface AiSettings {
  /** Master switch — everything AI-related is hidden/disabled when false. */
  enabled: boolean
  provider: AiProvider
  /** Base URL for `custom` (OpenAI-compatible), e.g. http://localhost:11434/v1. */
  baseUrl: string
  features: Record<AiFeatureKey, AiFeatureConfig>
}

/** A partial AI update — any subset, down to a single feature's model. */
export interface AiSettingsPatch extends Partial<Omit<AiSettings, 'features'>> {
  features?: Partial<Record<AiFeatureKey, Partial<AiFeatureConfig>>>
}

/** What `settings.set` accepts: shallow everywhere except the nested `ai` branch. */
export type AppSettingsPatch = Partial<Omit<AppSettings, 'ai'>> & { ai?: AiSettingsPatch }

/** Which providers currently have a key stored (never the key itself). */
export interface AiKeyStatus {
  saved: Record<AiProvider, boolean>
  /** False when the OS keychain is unavailable — keys can't be stored safely. */
  encryptionAvailable: boolean
}

/** Outcome of Settings → AI "Test connection" (a failure comes back as a Result error). */
export interface AiTestResult {
  provider: AiProvider
  model: string
  /** Round-trip time of the test request. */
  ms: number
  /** What the model answered, trimmed — proof it really generated something. */
  reply: string
}

/** A generated commit message, split the way the Commit panel shows it. */
export interface AiCommitMessage {
  summary: string
  description: string
}

/** A generated pull-request title + body, ready to paste into the forge. */
export interface AiPullRequest {
  title: string
  description: string
  /** What the branch was compared against, echoed back for the dialog header. */
  base: string
  /** How many commits the branch is ahead of the base. */
  commits: number
}

/** One proposed commit in a Commit Composer plan. */
export interface AiComposerCommit {
  summary: string
  description: string
  /** Repo-relative paths that go into this commit (a subset of the dirty files). */
  files: string[]
}

export interface AiComposerPlan {
  commits: AiComposerCommit[]
  /** Dirty files the model left out of every group — never silently dropped. */
  leftover: string[]
}

/** Outcome of an AI conflict resolution: the file is rewritten, not staged. */
export interface AiConflictResolution {
  path: string
  /** The model's own account of how it reconciled the two sides. */
  note: string
  /** How sure the model is (0-100), or null when it did not say. */
  confidence?: number | null
  /**
   * The merged text, returned instead of being written when the merge tool asks
   * for a preview — it loads the result into the Output pane for review.
   */
  content?: string
}

// --- Profiles ----------------------------------------------------------------

/**
 * A named working identity. Each profile carries its own SSH key, git identity
 * and the whole `AppSettings` block, so switching profile switches everything
 * the app does on your behalf.
 */
export interface Profile {
  id: string
  name: string
  /** Private key used for clone/fetch/push while this profile is active. */
  sshKeyPath: string | null
  /** Stamped as the repo-local identity on repos cloned/created under it. */
  gitName: string
  gitEmail: string
}

/**
 * The repositories a profile works with: its open tabs (in order) and which of
 * them was in front. Restored on launch and whenever the profile is activated.
 */
export interface ProfileWorkspace {
  tabs: RepoRef[]
  active: string | null
}

export interface ProfileState {
  profiles: Profile[]
  activeId: string
  /** The ACTIVE profile's open tabs — the other profiles' stay in main. */
  workspace: ProfileWorkspace
}

// --- Hosting services --------------------------------------------------------

/** The hosting services the clone window can list repositories from. */
export type HostKind =
  'github' | 'github-enterprise' | 'gitlab' | 'gitlab-self' | 'bitbucket' | 'bitbucket-dc' | 'azure'

/** Which host to talk to; `server`/`org` only matter for the self-managed ones. */
export interface HostQuery {
  kind: HostKind
  /** Host name for the self-managed variants (git.company.com). */
  server?: string
  /** Azure DevOps organization — its API is org-scoped. */
  org?: string
}

/** One repository as the host reports it. */
export interface RemoteRepo {
  /** Owner / organization / workspace / project — the grouping header. */
  owner: string
  name: string
  sshUrl: string
  private: boolean
}

/**
 * A repo listing plus who the token turned out to be. The account/orgs are only
 * filled in when the list comes back empty — that is when you need to know
 * whether the token simply belongs to the wrong account.
 */
export interface RemoteRepoList {
  repos: RemoteRepo[]
  /** Login the token authenticates as, when the host could tell us. */
  account: string | null
  /** Organizations that login belongs to. */
  orgs: string[]
  /**
   * Which kind of credential this turned out to be. GitHub only reveals the
   * `x-oauth-scopes` header for classic tokens, so its absence identifies a
   * fine-grained one — and that distinction decides what the user must fix.
   */
  tokenKind: 'classic' | 'fine-grained' | null
  /** Scopes of a classic token (empty means it was created without any). */
  scopes: string[]
}

/** Which hosts the active profile has a token for (never the token itself). */
export interface HostTokenStatus {
  saved: HostKind[]
  /** False when the OS keychain is unavailable — tokens can't be stored safely. */
  encryptionAvailable: boolean
}

/** Clone/create parameters — the repo lands in `<parentDir>/<name>`. */
export interface NewRepoOptions {
  /** Remote URL; empty when creating a fresh repository. */
  url?: string
  parentDir: string
  name: string
}

// --- SSH / authentication ----------------------------------------------------

/** A private key found in ~/.ssh, plus how it's wired up right now. */
export interface SshKey {
  /** File name of the private key (e.g. `id_ed25519`). */
  name: string
  path: string
  /** Full `ssh-ed25519 AAAA… comment` line, when a .pub sibling exists. */
  publicKey: string | null
  /** `SHA256:…` fingerprint from ssh-keygen -l. */
  fingerprint: string | null
  /** ED25519 / RSA / ECDSA, when known. */
  type: string | null
  comment: string | null
  /** Loaded in the running ssh-agent (matched by fingerprint). */
  inAgent: boolean
  /** The open repo pins this key via core.sshCommand. */
  usedByRepo: boolean
}

/** Everything the Settings > SSH section needs in one round-trip. */
export interface SshEnvironment {
  /** The ~/.ssh directory this app (the OS git/ssh) actually reads. */
  dir: string
  keys: SshKey[]
  /** ssh-agent reachable and answering `ssh-add -l`. */
  agentRunning: boolean
  /** Why the agent isn't usable, when it isn't. */
  agentMessage: string | null
  /** core.sshCommand of the open repo, when set. */
  repoSshCommand: string | null
}

/** git identity as the Settings > Git profile section edits it. */
export interface GitIdentity {
  globalName: string | null
  globalEmail: string | null
  /** Repo-level overrides — null means "inherit the global value". */
  repoName: string | null
  repoEmail: string | null
  signingKey: string | null
  /** commit.gpgsign — sign every commit by default. */
  signByDefault: boolean
}

/** Generic result wrapper so IPC never throws across the boundary. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: string }

export interface CommitOptions {
  message: string
  amend?: boolean
  /** Sign the commit with the configured GPG/SSH key (git commit -S). */
  sign?: boolean
}

/** Verification state of a commit's signature (from git's %G? code). */
export type SignatureKind = 'good' | 'invalid' | 'unverified' | 'none'

export interface SignatureInfo {
  kind: SignatureKind
  /** Signer identity (%GS), when known. */
  signer: string
}

export interface PushOptions {
  remote?: string
  branch?: string
  setUpstream?: boolean
  force?: boolean
}

/**
 * How `git pull` integrates fetched commits:
 * - `ff`: merge, fast-forwarding when possible (plain `git pull`)
 * - `ff-only`: only fast-forward, fail if a merge would be needed (`--ff-only`)
 * - `rebase`: replay local commits on top of the upstream (`--rebase`)
 */
export type PullMode = 'ff' | 'ff-only' | 'rebase'

export interface PullOptions {
  mode?: PullMode
}

export interface StashSaveOptions {
  message?: string
  /** Include untracked files in the stash (git stash push -u). */
  includeUntracked?: boolean
}

/** git reset variants: keep changes staged (soft), unstaged (mixed), or discard (hard). */
export type ResetMode = 'soft' | 'mixed' | 'hard'

/** Interactive-rebase actions we support (reword is excluded — HEAD reword = amend). */
export type RebaseAction = 'pick' | 'squash' | 'fixup' | 'drop'

export interface RebaseItem {
  hash: string
  action: RebaseAction
}
