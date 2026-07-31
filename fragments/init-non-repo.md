---
name: init-non-repo
description: Opening a folder that isn't a repo offers "Initialize" (repo:init) instead of a dead-end error; askConfirm reuses PromptDialog.
metadata:
  type: architecture
---

Opening a plain folder is treated as an **offer, not an error** (GitKraken does the same).

Flow: `openRepo(dir)` in the store inspects the failed `Result` *before* `unwrap` — on
code `NOT_A_REPO` it skips the toast, asks `askConfirm({ okLabel: 'Initialize' })`, and on
accept calls `initRepo(dir)` → `window.api.repo.init` → `IPC.RepoInit`.

- `gitService.initRepo(dir)` is the single place `git init --initial-branch=main` happens;
  `createRepo(parent, name)` now just delegates to it with the joined path. It refuses an
  existing repo (`EXISTS`) and never touches the working tree — pre-existing files simply
  show up as untracked.
- The `repo:init` handler mirrors `repo:create`: profile identity, recent list, watcher.
- `openRepo` in gitService checks the directory exists first and throws `NO_DIR`. That
  distinction is load-bearing: without it simple-git's opaque "directory does not exist"
  message could reach the init offer and *recreate* a folder the user deleted.
- The renderer store handles `DUBIOUS_OWNERSHIP` from init the way it does for
  clone/create — trust silently, since the user just asked for this repo (see
  [[platform]]).

**Confirm dialogs**: `askConfirm()` reuses `promptReq` / `PromptDialog` in `confirm` mode —
no text field, optional `message` line, OK resolves a fixed non-null value. `window.confirm`
does work in Electron, but it's an OS-chrome box with fixed button labels; this keeps a
custom OK label ("Initialize") and the app's dark styling. See [[input-prompt]].
