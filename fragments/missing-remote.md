---
name: missing-remote
description: Fetch/pull/push ask for the origin URL when the repo has no remote (store ensureRemote) and git's own "does not appear to be a git repository" maps to NO_REMOTE.
metadata:
  type: architecture
---

A freshly initialized repo (see [[init-non-repo]]) has no remote, so Push dies with git's
`fatal: 'origin' does not appear to be a git repository` — a message that says nothing about
the fix. Two things handle it:

1. **`ensureRemote(name = 'origin')` in the store** runs *before* every `fetch` / `pull` /
   `push`. Returns false = don't run the op.
   - No remotes at all → `askInput` for the URL (`git@github.com:user/repo.git`), then
     `addRemote(name, url)` (which refreshes the snapshot) and the op continues. `push`
     re-reads the snapshot afterwards, so the new remote gets `--set-upstream`.
   - Remotes exist but not under that name → error toast listing the real names. Adding a
     second remote silently would be a surprise.
   - The background auto-fetch timer calls `window.api.git.fetch()` directly, *not* the
     store action, so it can never pop a dialog.
2. **`NO_REMOTE`** in `toGitError`: `'<name>' does not appear to be a git repository` is a
   missing remote NAME, and is matched *before* the `NOT_A_REPO` and `REMOTE_ACCESS`
   heuristics — that text otherwise gets swallowed by "could not read from remote
   repository" and offers connection diagnostics for a remote that was never configured.
   The toast offers "Add the remote URL…" → `ensureRemote()`.
