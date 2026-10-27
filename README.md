<p align="center">
  <img src="images/logo.png" alt="Coal Clone" width="220">
</p>

<h1 align="center">Coal Clone</h1>

<p align="center">
  A fast, dark, GitKraken-style Git client for <b>Windows</b> and <b>macOS</b>.<br>
  See your whole history at a glance, and stage, commit, branch and merge without touching the terminal.
</p>

<p align="center">
  <a href="../../releases"><b>⬇ Download the latest version</b></a>
</p>

---

![Coal Clone main window: commit graph, branches, staging panel](images/main-window.png)

## What it does

**See your history**
- A colour-coded **commit graph** with branches, tags and stashes right on the lanes. It stays
  smooth even on long histories.
- **Search** commits by message, author, hash or branch name.
- **Diffs** in unified or side-by-side view, plus **blame** and **file history** for any file.

**Work with your changes**
- **Stage, unstage and discard** whole files, shown as a flat list or a folder tree.
- **Commit**, amend the last commit, and **sign** commits.
- **Undo / Redo** for the app's own actions, such as checkout, commit, stash or branch changes.

**Branches and remotes**
- Create, rename, delete and check out branches. **Drag a branch** onto any commit to move it.
- **Pull** (fast-forward, fast-forward only or rebase), **push** and **fetch**, with tag push and
  delete.
- **Merge, rebase, cherry-pick, revert and reset** from a right-click menu.
- **Interactive rebase**: reorder, squash, fixup or drop commits in a simple editor.
- **Stash** your changes, including untracked files, and pop them back later.

**When things conflict**
- A **3-way merge tool** with your version, their version and the result side by side.
  Pick lines from either side, then save and stage the file in one click.

**Your setup**
- **Profiles**: keep work and personal separate. Each profile has its own SSH key, git identity,
  settings, recent repositories and open tabs, and switching profiles swaps all of them.
- **Tabs** for several repositories at once.
- **Built-in SSH key management**: generate a key, add it to the agent, or pin a key to one
  repository.
- **Clone** straight from GitHub, GitLab and other hosts.
- **Open a terminal** in the repository with one click.

## Settings

Everything is in one place and saved automatically to the active profile.

![General settings: auto-fetch, pull behaviour, history size, startup and safety](images/settings-general.png)

### Optional AI assistance

Turn it on, pick a provider, paste your own API key, and Coal Clone can:

- write a **commit message** from your staged changes,
- **explain** what a commit does,
- name a **stash**,
- draft a **pull request** description,
- suggest a **merge** for a conflicted file,
- split a large change into several commits (**commit composer**).

![AI settings: provider, encrypted API key, model and custom instructions](images/settings-ai.png)

Your API key is stored encrypted by your operating system. Requests go straight from the app to
the provider you choose and never pass through anyone else's server. With AI switched off,
nothing is sent anywhere.

## Download & install

Get the files from the [**latest release**](../../releases). No installer is needed.

### Windows

Download **`Coal Clone-<version>-portable.exe`** and run it. That one file is the whole app, so
you can put it anywhere, even on a USB stick.

- The app is not code-signed yet, so your **browser may block the download** as "dangerous" and
  Windows may show *"Windows protected your PC"*. This is expected for an unsigned app, not a real
  virus warning.
  - **Browser:** in the downloads list, click the blocked file's **⋯ → Keep** (Chrome/Edge) to
    let it finish.
  - **First run:** if SmartScreen appears, click **More info → Run anyway**.
- The first start takes a few seconds while the app unpacks itself.

### macOS

Pick the file for your Mac, unpack it, and open **`Coal Clone.app`**. You can drag it into
*Applications* first.

- **`Coal Clone-<version>-mac-arm64.zip`** — Apple Silicon Macs (M1 and newer).
- **`Coal Clone-<version>-mac-x64.zip`** — Intel Macs.

The app is not signed with an Apple Developer ID yet, so macOS blocks the first launch.
**Right-click the app → Open → Open.** After that it starts normally.

### Requirements

Coal Clone uses the **git installed on your computer**, so `git` must be available
([download git](https://git-scm.com/downloads)).

## Good to know

- **Preview builds expire.** This version stops working on **December 31, 2026**. After that it
  only shows a message asking you to download the new version, which will be on the
  [Releases](../../releases) page.
- Settings and profiles are stored in your user folder (`%APPDATA%\Coal Clone` on Windows), so
  they survive updates.
