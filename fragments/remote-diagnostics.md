---
name: remote-diagnostics
description: "Test connection" remote-reachability diagnostic — why fetch/pull fails, with SSH-key identity probes.
metadata:
  type: decision
---

Answers "Could not read from remote repository" with a specific cause + fix instead of
git's generic message.

- **gitService** ([[git-service]]): `diagnoseRemote(name?)` returns a `RemoteDiagnosis`.
  Picks the remote (arg → `origin` → first), parses its URL (`parseRemoteUrl`: ssh/https/
  git/local + host + user), runs a read-only `git ls-remote` and classifies the result
  (`classifyReachability`): `ok` / `no-access` (GitHub "Repository not found" = authed but
  no perms/SSO) / `auth-failed` (Permission denied) / `host-unreachable` (DNS/net) /
  `https-auth` / `unknown`. For SSH remotes it probes each `~/.ssh` key with
  `ssh -i <key> -T <user>@<host>` and parses the greeting (`parseSshIdentity`) to show which
  key authenticates **as whom** (GitHub/GitLab/Bitbucket). All probes run via `runProbe`
  (child_process spawn) with `GIT_TERMINAL_PROMPT=0` + `GIT_SSH_COMMAND` (`BatchMode=yes`,
  `ConnectTimeout=10`, `StrictHostKeyChecking=accept-new`) and a kill-timeout — safe to kill
  because ls-remote/ssh -T are read-only (unlike the mutating ops that run without a timeout).
  The three pure helpers are exported for unit tests (`test/remoteDiagnostics.test.ts`).
- **Channel** `GitDiagnoseRemote` (read-style handler, not `action()`); `window.api.git.diagnoseRemote`.
- **UI**: `RemoteDiagnosticsDialog` (mounted in App). Store: `remoteDiag*` state +
  `openRemoteDiagnostics(name?)` / `closeRemoteDiagnostics`. Triggers: Sidebar Remotes row
  hover **Test** button, and a **Diagnose connection** action on any toast whose error carries
  code `REMOTE_ACCESS` (tagged in `toGitError`, so a failed fetch/pull/push offers it).
- **Windows/WSL gotcha**: the app runs the **OS** git/ssh, so for a WSL repo opened at a
  `\\wsl.localhost\...` path it uses Windows `~/.ssh`, NOT WSL's — a `no-access` from WSL can
  read as `auth-failed` from the app when Windows has no key. A hint calls this out.

Related: [[remote-manage]], [[git-service]], [[platform]], [[ipc-contract]].
