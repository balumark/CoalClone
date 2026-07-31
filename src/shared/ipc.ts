// IPC channel-name constants. Both preload and main import these so channel
// strings are never duplicated as magic strings.

export const IPC = {
  // Repo management
  RepoOpenDialog: 'repo:open-dialog',
  RepoOpen: 'repo:open',
  RepoRecent: 'repo:recent',
  RepoRemoveRecent: 'repo:remove-recent',
  RepoSnapshot: 'repo:snapshot',
  RepoClose: 'repo:close',
  RepoClone: 'repo:clone',
  RepoCreate: 'repo:create',
  RepoInit: 'repo:init',

  // Hosting services (repo listing needs an API token; the SSH key only clones)
  HostsTokenStatus: 'hosts:token-status',
  HostsSetToken: 'hosts:set-token',
  HostsListRepos: 'hosts:list-repos',

  // Profiles (each owns an SSH key, a git identity and its own settings)
  ProfilesGet: 'profiles:get',
  ProfilesSave: 'profiles:save',
  ProfilesDelete: 'profiles:delete',
  ProfilesActivate: 'profiles:activate',

  // Read
  GitStatus: 'git:status',
  GitLog: 'git:log',
  GitDiffFile: 'git:diff-file',
  GitCommitDiff: 'git:commit-diff',
  GitFileHistory: 'git:file-history',
  GitBlame: 'git:blame',
  GitBranches: 'git:branches',
  GitRemotes: 'git:remotes',
  GitTags: 'git:tags',
  GitStashes: 'git:stashes',
  GitSignature: 'git:signature',
  GitDiagnoseRemote: 'git:diagnose-remote',

  // Write / actions
  GitStage: 'git:stage',
  GitUnstage: 'git:unstage',
  GitDiscard: 'git:discard',
  GitCommit: 'git:commit',
  GitCheckout: 'git:checkout',
  GitCreateBranch: 'git:create-branch',
  GitDeleteBranch: 'git:delete-branch',
  GitRenameBranch: 'git:rename-branch',
  GitCreateTag: 'git:create-tag',
  GitPushTag: 'git:push-tag',
  GitDeleteTag: 'git:delete-tag',
  GitMoveBranch: 'git:move-branch',
  GitAddRemote: 'git:add-remote',
  GitSetRemoteUrl: 'git:set-remote-url',
  GitRemoveRemote: 'git:remove-remote',
  GitMerge: 'git:merge',
  GitRebase: 'git:rebase',
  GitCherryPick: 'git:cherry-pick',
  GitRevert: 'git:revert',
  GitReset: 'git:reset',
  GitResolveConflict: 'git:resolve-conflict',
  GitUnresolveConflict: 'git:unresolve-conflict',
  GitMergeFile: 'git:merge-file',
  GitSaveMerge: 'git:save-merge',
  GitOpContinue: 'git:op-continue',
  GitOpAbort: 'git:op-abort',
  GitRebaseRange: 'git:rebase-range',
  GitRebaseInteractive: 'git:rebase-interactive',
  GitSetUpstream: 'git:set-upstream',
  GitFastForward: 'git:fast-forward',
  GitWorktreeAdd: 'git:worktree-add',
  GitCreatePatch: 'git:create-patch',
  GitFilePatch: 'git:file-patch',
  GitIgnore: 'git:ignore',
  GitIgnorePath: 'git:ignore-path',
  GitStashFile: 'git:stash-file',
  GitExternalDiff: 'git:external-diff',
  GitFetch: 'git:fetch',
  GitPull: 'git:pull',
  GitPush: 'git:push',
  GitStashSave: 'git:stash-save',
  GitStashApply: 'git:stash-apply',
  GitStashPop: 'git:stash-pop',
  GitStashDrop: 'git:stash-drop',

  // Recovery helper (WSL/Windows "dubious ownership")
  GitTrustDirectory: 'git:trust-directory',

  // Authentication: SSH keys + the git identity behind commits
  SshEnvironment: 'ssh:environment',
  SshGenerateKey: 'ssh:generate-key',
  SshAddToAgent: 'ssh:add-to-agent',
  SshUseKeyForRepo: 'ssh:use-key-for-repo',
  GitIdentityGet: 'git:identity-get',
  GitIdentitySet: 'git:identity-set',

  // Native dialogs (folder for worktree, save-path for patch)
  DialogPickFolder: 'dialog:pick-folder',
  DialogSaveFile: 'dialog:save-file',

  // Shell / OS integrations (right-click actions on working-tree files)
  ShellResolvePath: 'shell:resolve-path',
  ShellShowInFolder: 'shell:show-in-folder',
  ShellOpenPath: 'shell:open-path',
  ShellOpenInEditor: 'shell:open-in-editor',
  ShellTrashFile: 'shell:trash-file',
  ShellOpenExternal: 'shell:open-external',

  // Author avatars (Gravatar, fetched in main to bypass the renderer CSP)
  AvatarGet: 'avatar:get',

  // Settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // AI assistance (key handling + the generators)
  AiStatus: 'ai:status',
  AiSetKey: 'ai:set-key',
  AiCommitMessage: 'ai:commit-message',
  AiExplainCommit: 'ai:explain-commit',
  AiStashMessage: 'ai:stash-message',
  AiPullRequest: 'ai:pull-request',
  AiResolveConflict: 'ai:resolve-conflict',
  AiComposeCommits: 'ai:compose-commits',
  GitCommitGroups: 'git:commit-groups',

  // Main -> renderer events
  EvtRepoChanged: 'evt:repo-changed',
  EvtProgress: 'evt:progress'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface ProgressEvent {
  action: string
  message: string
  done: boolean
}
