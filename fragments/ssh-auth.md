---
name: ssh-auth
description: In-app SSH authentication — key list/generate/agent, pinning a key to a repo via core.sshCommand, and the git identity editor.
metadata:
  type: architecture
---

The Remote Diagnostics dialog ([[remote-diagnostics]]) could only *explain* "Permission denied
(publickey)". **Settings → SSH & auth** is where it can now be fixed, without leaving the app.

**Main process — `src/main/git/sshService.ts`** (the only non-`gitService` module that shells out,
because `ssh-keygen`/`ssh-add` aren't git; anything touching git config goes through
`gitService.getConfig/setConfig`):

- `sshEnvironment()` → `SshEnvironment { dir, keys, agentRunning, agentMessage, repoSshCommand }`.
  Keys are the ~/.ssh files with a `.pub` sibling plus the default names; each is fingerprinted with
  `ssh-keygen -l -f`. **Always fingerprint the `.pub` when it exists** — running it against an
  encrypted private key can block on a passphrase prompt we can't answer.
- Agent state comes from `ssh-add -l`. Its exit **1 + "The agent has no identities"** means the
  agent IS running — only a connection error means it isn't (Windows hint: start the `ssh-agent`
  service). `inAgent` is fingerprint matching, not path matching.
- `generateKey()` = `ssh-keygen -t ed25519|rsa -N ''` into ~/.ssh (no passphrase, so git never
  stops to prompt); refuses to overwrite an existing file and validates the name.
- `useKeyForRepo(path)` writes **`core.sshCommand = ssh -i "<path>" -o IdentitiesOnly=yes`** into
  the repo's local config — the "authenticate THIS repo" switch. `IdentitiesOnly=yes` matters: it
  stops ssh from offering every other key first (which is what triggers "too many authentication
  failures" and picks the wrong identity). `keyFromSshCommand()` parses it back for the
  "used by this repo" badge (unit-tested in `test/sshService.test.ts`).

**simple-git blocks this write (gotcha).** Its `blockUnsafeOperationsPlugin` rejects config writes
to a block-list of keys — `core.sshCommand`, `core.editor`, `core.pager`, `credential.helper`,
`gpg.program`, `alias.*`, … — with *"Configuring core.sshCommand is not permitted without enabling
allowUnsafeSshCommand"*. Reads (`config --get`) are fine; only writes trip it. So the write lives in
`gitService.setRepoSshCommand()`, which builds a **throwaway** `simpleGit(repo, { unsafe: {
allowUnsafeSshCommand: true } })` — same pattern as `allowUnsafeEditor` in `rebaseInteractive` —
leaving the shared singleton strict. `git config --unset` exits **5** when the key isn't set; that
is a no-op, not an error. Covered by `test/repoSshCommand.test.ts`.

**Diagnosis nuance:** a key can report `authenticated` in the probe list while `ls-remote` still
fails with "Permission denied (publickey)" — that means ssh never offered *that* key for the remote,
not that the key is bad. `buildDiagnosisHints` detects it and points at "Use for this repo" instead
of the misleading "rejected every SSH key on this machine".

**git identity** lives in `gitService.identity()/setIdentity()` over `getConfig/setConfig`:
global `user.name`/`user.email`, repo-local overrides (empty string = unset the override →
inherit global), `user.signingkey`, and `commit.gpgsign` for [[commit-signing]].

**Renderer**: store actions `loadSsh / generateSshKey / addKeyToAgent / pinRepoKey / copyText /
openExternal / loadIdentity / saveIdentity`. Note the store action is **`pinRepoKey`**, not
`useKeyForRepo` — an action named `use*` trips eslint's `rules-of-hooks` when read out of the
store. External links go through `shell:open-external`, which only accepts `https://`.

The WSL caveat still applies and is stated in the UI: this app runs the **OS** git/ssh, so a repo
you normally use inside WSL authenticates with Windows' `C:\Users\<you>\.ssh`, not WSL's.
Related: [[remote-diagnostics]], [[settings]], [[platform]], [[ipc-contract]].
