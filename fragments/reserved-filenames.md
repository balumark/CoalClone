---
name: reserved-filenames
description: Windows device names (NUL, CON, COM1…) committed from Linux become permanent phantom deletions; how the app detects and explains them.
metadata:
  type: gotcha
---

A file whose basename is a **Windows reserved device name** — `CON PRN AUX NUL COM1-9 LPT1-9`,
with or without an extension — can be committed from Linux/macOS but **can never exist in a
Windows working tree**. Opening the name hits the device, so git "writes" the file successfully
and then fails to stat it:

```
error: unable to stat just-written file NUL: No such file or directory
```

Consequences on Windows (including WSL repos opened over `\\wsl.localhost\`, since the *host*
process is Windows):

- `git status` reports it as **deleted** forever — a phantom the user can't get rid of by discarding.
- `git checkout -- NUL` (Discard) fails with the message above.
- `git stash push` **creates the stash and then fails** to reset the index → a stash entry plus an
  unchanged working tree. This is the nastiest one.
- `git pull --rebase` refuses with "cannot pull with rebase: You have unstaged changes".
- `git add -- NUL` **works** — staging the deletion is fine. Committing that deletion (or renaming
  the file from Linux) is the only real fix.

**Handling in the app** (`gitService`):

- `isReservedWindowsPath()` (exported, unit-tested in `test/reservedNames.test.ts`) matches any
  path segment against the device names.
- `status()` sets `FileStatus.reserved` on affected entries (Windows only); `CommitPanel`'s
  `FileRow` renders a ⚠ with an explanatory tooltip.
- `toGitError()` maps `unable to stat just-written file X` → code **`RESERVED_NAME`** with a
  human explanation; `Toasts.tsx` offers a **"Stage its deletion"** button for that code (it reads
  the path from the toast `path` field or out of the message).
- `discard()` skips reserved paths (so the rest of the selection still gets discarded) and then
  throws `RESERVED_NAME`; `stashSave()` refuses **before** running to avoid the half-made stash;
  `pull()` re-maps git's "unstaged changes" error to `RESERVED_NAME` when
  `reservedPhantomDeletions()` (`git ls-files --deleted` filtered) finds one.

Seen in the wild: `personalbest-filament`, branch `feature/video-library`, commit `da95eaa`
committed a 191-byte file literally named `NUL` (a `> NUL` redirect run inside git-bash).
Related: [[platform]], [[git-service]], [[file-context-menu]].
