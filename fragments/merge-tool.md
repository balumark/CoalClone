---
name: merge-tool
description: The 3-way merge editor (A / B / Output panes) — where its model comes from and how a resolution is saved.
metadata:
  type: architecture
---

GitKraken's merge tool, the missing half of [[conflict-resolution]]: instead of only picking a
whole side, the user resolves a conflicted file hunk by hunk in a full-screen editor.

**The model is built in main, not the renderer.** `gitService.mergeFile(path)` reads the three
index stages git leaves behind (`git ls-files -u` to see which exist, then `git show :1:`/`:2:`/
`:3:`) and hands them to `src/main/git/merge3.ts`, which returns a `MergeFile` (`types.ts`).

- **`merge3.ts` is pure and dependency-free**, the same rule as `graph.ts`, and unit-tested in
  `test/merge3.test.ts`. It is the classic diff3: diff base→ours and base→theirs into line ranges
  over the *base*, then walk those ranges grouping any that overlap **or merely touch**. A group
  only one side touched auto-merges (`kind: 'ours' | 'theirs'`); a group both sides changed
  differently is a `conflict`. Two edits on adjacent base lines therefore collapse into one
  conflict — that is git's own behaviour, not a bug.
- The diff is an LCS table with the common prefix/suffix trimmed first, and a `LCS_CELL_BUDGET`
  escape hatch: past it the whole differing middle becomes one region rather than stalling main.
- Every segment carries `oursStart`/`theirsStart`/`baseStart`, so the panes show **real file line
  numbers**. Those offsets are tracked incrementally during the walk, never derived from a base
  index — a pure insertion is a zero-width base range, so an index alone cannot say whether it
  sits before or after it.
- Pane headers come from `describeRef`: `HEAD` for A, and `MERGE_HEAD`/`REBASE_HEAD`/
  `CHERRY_PICK_HEAD`/`REVERT_HEAD` for B, depending on `detectOperation()`.
- No stage 1 (`noBase`) = an add/add conflict, so the whole file is one conflict. A `\0` anywhere
  means `binary`, and the dialog degrades to whole-file Ours/Theirs.

**`MergeToolDialog.tsx`** renders A (ours) and B (theirs) on top and the merged Output below.
Each segment occupies the **same vertical space in both top panes** — the shorter side is padded
with a hatched filler — so a conflict lines up across them and their scroll positions can simply
be mirrored. Fixed `ROW`/`STRIP` heights keep that alignment arithmetic.

- The dialog owns only *which lines the user picked*; the output is derived from picks on every
  render. A conflict counts as decided once the user touches it — picking neither side is a
  legitimate decision, so it is `decided`, not "has lines".
- **Every conflict also has one-click answers (`A` / `B` / `A + B` / `neither`) in the Output
  pane's unresolved row.** They are there and not in the side panes because a side with *no
  lines* — a delete, i.e. every modify/delete conflict — has no checkbox to tick, so the panes
  alone are a dead end. Its strip checkbox is disabled and labelled "nothing on this side".
- **A line pick always drops manual/AI mode.** Letting `manual` win silently made a ticked box
  do nothing, which reads as a broken checkbox.
- **Edit / AI put the output into `manual` mode**, a whole-file string that overrides every pick
  (the header says so, with a "Discard edits" way back). `ai.resolveConflict(path, preview)` is
  the same IPC as the conflict-row AI button, with `preview: true` returning the merged text
  instead of writing it. The button is hidden for a binary file and deep-links to Settings → AI
  when no key is stored, rather than firing a request that can only fail.
- **An AI merge has to be auditable, so the Output shows where every line came from.**
  `traceOrigins()` matches each output line verbatim against the two sides and marks it in the
  gutter: `A` (ours), `B` (theirs), blank (unchanged), and **`✦` = in neither side**, i.e. text
  the model wrote rather than picked — highlighted, counted in the header strip, and the thing
  actually worth reviewing. An auto-merged segment only contributes its *winning* side to the
  match sets; its loser is the pre-change base, which no correct merge would emit.
- **The confidence and reasoning come from the model, not from us.** `resolveConflictFile` asks
  for `CONFIDENCE: <0-100>` / `REASON: …` / `===MERGED FILE===` / the file, because embedding a
  whole source file in JSON is far more fragile than a delimiter. A missing delimiter means "the
  whole reply is the file" and reports *no* confidence rather than inventing one. (This replaced
  a hardcoded "Both sides merged — review the diff" note that looked like model output but was a
  constant.)
- **The AI is fed `gitService.conflictDocument(path)`, not the working file.** It rebuilds the
  file from the index stages in diff3 marker style (`<<<<<<< ours` / `||||||| base` / `=======` /
  `>>>>>>> theirs`), because a **modify/delete conflict leaves no markers in the working tree at
  all** — reading the file there made the AI fail with `AI_NO_CONFLICT` on exactly those files.
  The conflict-row button still prefers the working copy (it may have been hand-edited) and falls
  back to the document when it finds no markers.
- **Binary files never take the save path**: `output` would be empty, so saving would truncate
  the file. Save/Reset/Edit are hidden and `save()` bails out early; only whole-file Ours/Theirs
  is offered.
- **Save** writes the file *and* stages it (`gitService.saveMerge` → `writeWorkingFile` + `git
  add`), enabled only once every conflict is decided. Line endings and the final newline are
  restored from the ours stage (`crlf` / `trailingNewline`).

**CommitPanel** now mirrors GitKraken's list: *Conflicted files (N)* with a **Mark all resolved**
button and a per-row **Merge** button (double-clicking the row does the same), plus *Resolved
files (M)* — `store.resolvedPaths`, tracked in the renderer for the length of the operation and
cleared as soon as `status.operation` goes null. Each resolved row has **Undo**, which is
`git checkout --merge -- <path>` (`gitService.unresolveConflict`): it rebuilds the index stages so
the merge tool can reopen the file.

Two gotchas found while building this:

- `toGitError` re-classifies by message, so throwing our own `GitError('… has no conflict left to
  resolve', 'NOT_CONFLICTED')` inside a `try` came back out as `CONFLICT`. It now passes existing
  `GitError`s through untouched.
- **Toasts were at `z-50` while every dialog is `z-60`–`z-70`**, so an error raised from inside a
  dialog rendered *behind* it and was never seen — the action just looked like it did nothing.
  Toasts are now `z-[90]`. `aiMergePreview` additionally returns its failure to the caller
  instead of toasting, so the merge tool shows it in a strip under its own header.

Related: [[conflict-resolution]], [[git-service]], [[ipc-contract]], [[ai-assistance]],
[[history-ops]].
