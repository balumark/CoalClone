---
name: pull-options
description: The Pull split-button dropdown — fetch-all + selectable/persisted pull mode (ff / ff-only / rebase).
metadata:
  type: decision
---

GitKraken-style Pull split button in the `Toolbar` (`PullButton`). The main half runs the
saved default pull mode; the caret opens a menu with **Fetch All** (one-off `fetch()`) plus three
radio options that both pick and persist the default:

- `ff` → plain `git pull --ff` (merge, fast-forward when possible) — default
- `ff-only` → `git pull --ff-only`
- `rebase` → `git pull --rebase`

Wiring (full IPC round-trip, see [[ipc-contract]]): `PullMode`/`PullOptions` in `types.ts`;
`AppSettings.pullMode` persists the choice ([[settings]], default `'ff'` in main `settings.ts`
and store `DEFAULT_SETTINGS`); `gitService.pull(opts?)` maps mode → flags; `IPC.GitPull` handler
and `window.api.git.pull(opts?)` forward `PullOptions`; store `pull(opts?)` falls back to
`settings.pullMode` when no mode is passed and picking a radio calls `updateSettings({ pullMode })`
then `pull({ mode })`. The behind-count badge moved onto the main half of the split button.

**Remote-op progress:** git gives no usable percentage for fetch/pull/push, so the UI only says
"still working" — but says it loudly. The store keeps `busyAction` (the raw action name from
`ProgressEvent.action`: `Fetch` / `Pull` / `Push` / `Checkout` / …) next to the existing `busy`
message, so a button can light up for **its own** operation instead of all three greying out
together: the running button turns accent, swaps its badge for a spinner and reads "Pushing…"
(wording lives in `lib/format.ts` `runningLabel`, not in main). On top of that an indeterminate
bar (`.kc-indeterminate` in `index.css`) runs along the toolbar's bottom edge and inside the
center-top pill whenever `isRemoteAction(busyAction)`.

The same treatment covers the index/working-tree ops (`isWorkingAction`: Stage / Unstage /
Discard / Commit / Stash / Creating commits) inside `CommitPanel` — its header swaps the change
count for "Staging…" + spinner and grows the same bar, "Stage all"/"Unstage all"/Commit show
their own spinner, and the per-file row buttons go disabled so a second op can't be queued on
top of the first.

Related: [[settings]], [[git-service]], [[ipc-contract]].
