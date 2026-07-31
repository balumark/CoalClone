---
name: platform
description: Cross-platform rules (Windows/macOS/Linux) plus the WSL+Windows mixed-repo setup.
metadata:
  type: convention
---

Coal Clone must run on **Windows, macOS and Linux** from one codebase. Rules:

- **Paths**: always use Node `path` (`path.join`, `path.normalize`, `path.basename`) — never
  hardcode `\` or `/`. Repo paths are normalized in `gitService.openRepo` via `--show-toplevel`.
- **Line endings**: diff parsing tolerates CRLF/LF; don't assume `\n`-only.
- **Icons**: use inline SVG (see `renderer/components/icons/RefIcons.tsx` — local branches =
  computer/desktop, remote = cloud, tag), NOT unicode/emoji glyphs. Many symbol glyphs (e.g. the git-branch mark)
  render as tofu on Windows; SVG is identical everywhere and follows `currentColor`/`1em`.
- **git on PATH**: simple-git shells out to system git; a missing/failed git surfaces as a
  `Result` error toast rather than a crash.
- **Packaging** (`electron-builder`, config in `package.json`, `productName: "Coal Clone"`):
  Windows → NSIS `.exe`, macOS → `.dmg`, Linux → `AppImage` + `.deb`. Scripts:
  `package:win|mac|linux`. Output under `release/<version>/`.
  **Verified (this box):** `package:win` builds `release/<v>/win-unpacked/Coal Clone.exe` (a
  runnable portable app) successfully. **Gotcha:** the **NSIS installer** step fails on Windows
  when **Developer Mode is OFF** — electron-builder extracts its `winCodeSign` cache, which
  contains macOS signing dylibs stored as **symlinks**, and creating symlinks needs
  `SeCreateSymbolicLinkPrivilege` ("Cannot create symbolic link … nincs meg a szükséges joga").
  Fix: enable **Windows Developer Mode** (Settings → Privacy & security → For developers) or run
  the terminal **as Administrator** once, then re-run `package:win`. The win-unpacked build works
  regardless — no installer needed to test.
  **No-admin workaround (used here, works):** pre-extract the winCodeSign archive to its final
  cache dir excluding the symlink folders, then re-run `package:win` (electron-builder finds the
  dir and skips the failing extraction):
  `"$SZ" x <Cache>/winCodeSign/<hash>.7z -o<Cache>/winCodeSign/winCodeSign-2.6.0 -x'!darwin' -x'!linux' -y`
  (`$SZ` = `node_modules/7zip-bin/win/x64/7za.exe`, `<Cache>` =
  `%LOCALAPPDATA%/electron-builder/Cache`). The `darwin`/`linux` dirs (macOS/Linux signing tools,
  the ones with symlinks) aren't needed for a Windows build. Result:
  `release/<version>/Coal Clone Setup <version>.exe` (~80 MB NSIS installer, unsigned).
  **App identity:** `productName: "Coal Clone"` + `appId: "com.coal-clone.app"` in package.json;
  the appId is also `APP_ID` in `@shared/appInfo` (used by `app.setAppUserModelId`) — keep the two
  in sync. Changing appId moves the userData folder (settings/recent reset).
  **Process names in Task Manager (open issue):** the MAIN process shows "Coal Clone" (via
  `app.setName(APP_NAME)`), but the child processes (renderer/GPU/utility) still show **"Electron"**
  even in the packaged win-unpacked app. The exe's version resource is: ProductName `Coal Clone`,
  **FileDescription = the package.json `description`** (user shortened it to "Coal Clone - the
  interactive git interface"), CompanyName `GitHub, Inc.` (Electron default). Requires a repackage
  to take effect, and it's unconfirmed whether Task Manager reads FileDescription for the helpers
  or a Chromium-internal "Electron" name — still to verify against the live processes
  (`Get-Process | ? Path -like '*Coal Clone*'` → `.MainModule.FileVersionInfo.FileDescription`).
  **App icon/logo:** the source logo is `build/icon.png` (1024×1024) — electron-builder generates
  the platform icons from it (`build.icon` + per-target `icon` in package.json; `buildResources`
  is `build`). The same image is `src/renderer/assets/logo.png`, imported by the Welcome screen
  (`import logoUrl from '../../assets/logo.png'`; needs `src/renderer/env.d.ts` with
  `/// <reference types="vite/client" />` for the `*.png` module type). Dev window/taskbar icon is
  set on the `BrowserWindow` via `path.join(process.cwd(), 'build/icon.png')`; packaged builds use
  the exe-embedded icon. To change the logo: replace both PNGs and repackage.

**Dev location (CANONICAL): `C:\Users\balum\Documents\code\coal-clone` — a native Windows path.**
The project was moved here from the original WSL path (`\\wsl.localhost\Ubuntu\home\balu\code\
coal-clone`) precisely to avoid UNC friction. On a normal drive path everything just works:
`npm install`, `npm run dev`, `npm run build`, `npm test` from PowerShell/Terminal — no tricks.
Verified: install (no postinstall error), typecheck clean, 10/10 tests, build OK.

Historical gotcha (only relevant if you ever run the **Windows** toolchain from the WSL/UNC path
again): npm scripts + Electron's postinstall spawn `cmd.exe`, which rejects a UNC cwd
(`UNC paths are not supported`). Workaround was to wrap npm in `cmd /c "pushd <unc> && npm ... & popd"`
(pushd maps a temp drive letter). Not needed from the Windows path. The old WSL copy may still
exist but is not canonical; if using WSL instead, reinstall there (Linux Electron + WSLg) and note
its global `~/.gitconfig` had an invalid empty `gpg.format` that broke all git commands until fixed.

**Phantom file-mode changes (WSL/UNC, fixed):** on a WSL repo reached over the Windows UNC share
the executable bit doesn't round-trip, so `git status` reports many files (all `.sh`/scripts) as
**modified with no content diff** — the diff viewer shows "File without changes" and the UNSTAGED
list fills with junk. `status()` now hides these: it calls `contentChangedPaths()`
(`git diff --numstat`; a tracked file with `0\t0` changed only its mode) and drops any `wd === 'M'`
entry not in that set. Binary files (`-\t-`) are always kept; if numstat fails the helper returns
`null` and nothing is hidden. A deliberate chmod on Linux/macOS is also hidden — an accepted
trade-off for this Windows-first app.

**Mixed WSL + Windows repos (user's setup)**: the user opens repos both natively (`C:\...`)
and in WSL (`\\wsl.localhost\...`) from one Windows app. Windows git reaches WSL repos over the
UNC share. Opening a WSL repo can trigger git's **"dubious ownership"** error — `gitService`
tags it `DUBIOUS_OWNERSHIP` and `Toasts.tsx` offers a one-click "Trust this directory & retry"
that runs `git config --global --add safe.directory <path>` (`gitService.trustDirectory`).

**safe.directory value format (critical gotcha, fixed M2):** git matches `safe.directory`
against its INTERNAL path spelling, which uses **forward slashes**. A UNC/WSL path
`\\wsl.localhost\Ubuntu\home\balu\code\oktatas` is seen by git as
`//wsl.localhost/Ubuntu/home/balu/code/oktatas`, and **Git-for-Windows additionally requires the
`%(prefix)/` form** — i.e. the working entry is `%(prefix)///wsl.localhost/Ubuntu/home/balu/code/
oktatas` (exactly what git's own error hint prints). The original `trustDirectory` added
`path.normalize(dir)` (a **back**slash string) which never matched, so the "Trust" button
silently did nothing and the repo stayed unopenable. Fix: `trustDirectory` now adds every
spelling — normalized, forward-slash, and (for `//` UNC) the `%(prefix)/` form. Verify with
`git config --global --get-all safe.directory`; working WSL repos show the `%(prefix)/` entries.

**Watcher polling locks .git → checkout/commit hang (critical gotcha):** on Windows the
chokidar **polling** holds read handles on `.git/index` & `HEAD`; when git tries to atomically
replace those files during a mutation (checkout/commit/merge), the open handle blocks the rename,
so the op **crawls or hangs** (GitKraken stays fast because it doesn't poll `.git` like this). Fix:
`RepoWatcher.pause()/resume()` (ref-counted, closes/reopens the watcher) wrap EVERY mutation via the
`action()` helper in `ipc/index.ts`, releasing the handles while git runs. Belt-and-braces: the
shared `simpleGit` instance is created with `{ timeout: { block: 20000 } }` so a genuinely hung git
call (UNC stall) is killed instead of wedging the command queue forever. The renderer also coalesces
refreshes (module-level `refreshing`/`refreshQueued` in the store) and serializes checkouts
(`checkingOut`) so slow snapshots don't pile up. Checkout updates the UI **optimistically**
(status.branch + branches.current) and reconciles the full snapshot in the background — it never
blocks on the slow refresh.

**File watcher over UNC/WSL (critical gotcha, fixed M2):** `RepoWatcher` (chokidar) originally
watched the **whole working tree**. On a real repo with `vendor/`/`node_modules/` over the
`\\wsl.localhost\` share this melts down: chokidar's per-file `fs.watch` throws `EISDIR` on the
UNC share, emitted as thousands of **UnhandledPromiseRejectionWarning**s. Fix: watch **only
`.git`** (its index/refs/HEAD/logs cover every git-state transition), force `usePolling: true`
(avoids `fs.watch` entirely → no EISDIR), ignore `.git/objects|lfs`/`*.lock`, and attach an
`error` handler so nothing escapes as an unhandled rejection. Trade-off: a purely-working-tree
edit made outside the app isn't auto-detected (the store refreshes after its own mutations).
Related: [[git-service]], [[tech-stack]], [[esm-preload-path]].
