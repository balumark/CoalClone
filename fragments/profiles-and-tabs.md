---
name: profiles-and-tabs
description: Repository tabs + the Repositories (new tab) screen, and profiles that own the SSH key, commit identity and settings.
metadata:
  type: architecture
---

Two GitKraken-shaped features that lean on each other: **tabs** for having several repositories
open, and **profiles** for switching who you are while doing it.

## Tabs

`TabBar` renders `store.tabs` (a `RepoRef[]`) plus a `+` that flips `pickerOpen`, which makes
`App` render the Repositories screen *over* the repo view while the tabs stay put.

**Only the active repository is really open.** Main still holds one `gitService` and one watcher,
so `activateTab` clears the per-tab state (selection, diff, solo) and re-runs `openRepo`. That
keeps the 60+ IPC handlers repo-implicit — making main hold several repos at once would mean
threading a repo id through every one of them. The visible cost is that a tab switch reloads the
snapshot (the tab shows a spinner while `loading`); closing the last tab closes the repo.

## The Repositories screen

`Welcome.tsx` serves double duty: the empty-state welcome *and* the new-tab screen (it only shows
the logo when `tabs.length === 0`). Open / Clone / Create across the top, a client-side filter
over the recent list, and a right rail showing the active profile.

`Create` uses the small `NewRepoDialog`; `Clone` gets the GitKraken-shaped `CloneDialog` — hosting
services down the left, form on the right. Both land in `<parentDir>/<name>`, and main refuses a
target that already exists rather than cloning into it. **`gitService.log()` returning `[]` on a
repo with no commits is load-bearing here** — without it a freshly created repo would open
straight into a snapshot error.

### Listing repositories is an API job, not an SSH one

`ssh git@github.com` only greets you — **no host exposes a repository list over SSH**, so the
"Search Remotes" picker needs a personal access token. `main/hosts.ts` owns that: tokens are
stored **per profile** (`userData/host-tokens.json`, safeStorage-encrypted, same pattern as the AI
key) and each host gets its own listing call — GitHub `/user/repos`, GitLab `/api/v4/projects`,
Bitbucket Cloud `/2.0/repositories`, Bitbucket DC `/rest/api/1.0/repos`, Azure DevOps
`/_apis/git/repositories` (Basic auth with an empty user, and org-scoped). Paging stops at 5×100.

**`/user/repos` means "repositories of the authenticated USER".** An organization's repos never
come back from it — not even for a fine-grained token whose *resource owner* is that organization,
which is the trap everyone falls into. So the dialog has an Organization field, and a non-empty
`HostQuery.org` switches GitHub to `/orgs/{org}/repos` (falling back to `/users/{name}/repos`) and
GitLab to `/groups/{path}/projects?include_subgroups=true`. Beware of "helpful" diagnostics here
too: `/user/orgs` returns nothing unless the token carries the organization-members permission, so
an empty result says nothing about actual memberships and must not be reported as if it did.

The division of labour is the point: **the token only lists, the profile's SSH key still clones.**
Without a token every source still works — type owner/repo and the dialog builds the same SSH URL
(Azure's `git@ssh.dev.azure.com:v3/org/project/repo` included).

## Profiles

`userData/profiles.json` (`main/profiles.ts`) holds `{activeId, profiles: [{id, name, sshKeyPath,
gitName, gitEmail, settings, recent, workspace}]}`. A pre-profiles `settings.json` is migrated into a "Default"
profile on first read.

- **Projects are per profile, GitKraken-style.** `recent` (the Repositories list — `repoManager`
  just delegates to `getActiveRecent/setActiveRecent`) and `workspace` (`{tabs, active}`, the open
  tabs) live in the profile. The renderer owns the tabs and pushes them with
  `profiles:set-workspace` after every open/close (`persistWorkspace`); `ProfileState.workspace`
  carries the active profile's back. Launch (`reopenLastRepo`) and every switch call
  `restoreWorkspace`, which drops tabs whose repository no longer opens.
  The old app-wide `recent-repos.json` is copied into each profile lacking a `recent` field.
- **A switch is a full swap** (`applyProfileSwitch` in the store, also used when deleting the
  active profile): persist the old workspace *before* `profiles:activate` (afterwards it would land
  in the new profile), close the repo, clear tabs/host tokens/AI status, re-read settings, recent
  and the SSH view, then restore the new profile's tabs. `pickerOpen` survives so switching inside
  the clone window keeps you there.
- **AI keys are per profile too**: `ai-credentials.json` is `{profileId: {provider: blob}}`; the
  old flat `{provider: blob}` file is detected by its provider keys and copied to every profile.

- **`settings.ts` now reads/writes the ACTIVE profile's settings** and keeps owning the defaults
  and the merge, so every existing `getSettings()`/`saveSettings()` caller follows the profile
  switch for free. The dependency runs settings.ts → profiles.ts, never back — profiles.ts stores
  raw partials precisely to avoid that cycle.
- **The SSH key rides in `GIT_SSH_COMMAND`** on the git instance (`gitService.build()`), not in
  repo config, so it follows the profile instead of sticking to a repository. A repo-local
  `core.sshCommand` (Settings → SSH & auth) still wins — that switch is the per-repo override.
  `applyActiveProfile()` is called at boot and after every profile save/delete/activate.
  **`.env()` replaces the child environment**, it doesn't extend it, so `inheritedEnv()` spreads
  `process.env` (PATH, SSH_AUTH_SOCK, credential-helper settings…) before adding ours.

**Every simple-git `unsafe` flag is on** (`ALLOW_UNSAFE` in gitService, applied via `GIT_OPTIONS`).
Its blocklist covers both `-c` switches (`core.sshCommand`, `core.editor`, `gpg.program`…) and
inherited environment variables (`EDITOR`, `GIT_ASKPASS`, `GIT_EXTERNAL_DIFF`, `PAGER`, `PREFIX`…),
and it rejects the **entire call**, so a single stray variable on the host — VS Code injects
`GIT_ASKPASS` into everything it launches, MSYS sets `PREFIX` — broke every git operation as soon
as a profile pinned a key and the calls started going through `.env()`. Filtering the environment
was whack-a-mole (three variables surfaced in a row); the guard is meant for servers running git
against untrusted input, whereas here the commands come from the user's own machine and git
config. Don't reintroduce per-call `unsafe: {…}` overrides — `GIT_OPTIONS` already carries them.
A regression test commits with `EDITOR`, `GIT_ASKPASS` and `GIT_EXTERNAL_DIFF` set.
- **The commit identity is written `--local`, and only on repos we made ourselves** (clone/create).
  Silently rewriting the identity of a repo the user merely opened would be a nasty surprise.

Switching profile therefore swaps the SSH key, the identity used for new repos, the whole
settings block (accent, pull mode, AI config…), the host tokens, the AI keys, the recent list and
the open tabs in one move.

Related: [[settings]], [[ssh-auth]], [[git-service]], [[ipc-contract]], [[ai-assistance]].
