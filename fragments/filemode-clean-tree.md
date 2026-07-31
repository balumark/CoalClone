---
name: filemode-clean-tree
description: Every git call runs with -c core.fileMode=false so exec-bit flips on WSL/Windows don't block pull/rebase/checkout.
metadata:
  type: decision
---

On WSL/Windows the executable bit flaps, so git reports files as `M` with no
content diff. `status()` already hid these phantom mode-only entries from the UI
(via `contentChangedPaths`), but that only fixes the *list* — `git pull --rebase`
/ `rebase` / `checkout` run their own `require_clean_work_tree` check and would
still refuse with **"cannot pull with rebase: You have unstaged changes"** while
the app showed 0 changes.

Fix: the working-tree `simpleGit` instances are created with
`GIT_OPTIONS = { config: ['core.fileMode=false'] }` (a module const in
`gitService.ts`), which simple-git's command-config-prefixing plugin turns into
`-c core.fileMode=false` on **every** git command. So the whole app — status and
mutations alike — ignores mode changes consistently. Non-persistent (no repo
`.git/config` write). Applied in `openRepo()` and the interactive-rebase instance.

Tradeoff: a genuine `chmod +x` won't be seen as a change (already true for the
status list). Acceptable given the app's WSL/Windows stance. See [[platform]].
