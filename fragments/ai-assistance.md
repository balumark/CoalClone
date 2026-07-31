---
name: ai-assistance
description: GitKraken-style AI settings (enable/provider/API key + per-feature model & instructions) and the two features they drive.
metadata:
  type: architecture
---

Optional AI assistance, modelled on GitKraken's "GitKraken AI" preferences pane but cut down
to what we actually need: **enable, provider, provider API key**, then per feature *what model*
and *what custom instructions*.

**Settings shape** (`AiSettings` in `types.ts`, nested under `AppSettings.ai`):
`{ enabled, provider: 'anthropic'|'openai'|'google'|'custom', baseUrl, features: Record<AiFeatureKey, {model, instructions}> }`.
`AiFeatureKey` is `commitMessage | explainCommit`; an empty `model` falls back to the provider
default in `aiService.DEFAULT_MODEL`. `baseUrl` only matters for `custom` (any OpenAI-compatible
endpoint — Azure gateway, Ollama, LM Studio).

- **`ai` is the only nested settings branch**, so `main/settings.ts` merges it *two levels deep*
  (`mergeAi`) — a shallow spread would wipe sibling features when the UI patches just one. The
  patch type is `AppSettingsPatch`/`AiSettingsPatch`, not `Partial<AppSettings>`.
- **The API key is never in `settings.json` and never crosses IPC back.** It's encrypted with
  Electron `safeStorage` (OS keychain) into `userData/ai-credentials.json`, one entry per
  provider, read only inside `aiService` right before a request. Without a keychain we *refuse*
  to store rather than fall back to plaintext — `AiKeyStatus.encryptionAvailable` tells the UI.
  The renderer only ever sees `AiKeyStatus` (which providers have a key).

**`src/main/ai/aiService.ts` is the only place AI is called**, the same rule as `gitService` for
git. Anthropic goes through the official `@anthropic-ai/sdk` (checked for `stop_reason: 'refusal'`,
typed error classes); OpenAI/custom and Google use plain `fetch` against their own shapes.
No `thinking`/`output_config`/`max_tokens` tuning is sent, because the model id is user-editable
and those parameters 400 on some models. Diffs are clipped at 60k chars.

**The six features** (GitKraken parity), each with its own prompt, model and instructions. Main
builds every prompt from git itself, so no diff ever travels to the renderer:

| Feature | Source | Where in the UI |
|---|---|---|
| `commitMessage` | `stagedPatch()` + branch + last 10 subjects (style) | "Generate message" over the commit box; subject/blank/body is split into the two fields |
| `explainCommit` | `commitPatch(hash)` | "Explain commit" in `CommitDetail`, dropped when the selection moves |
| `stashMessage` | `workingPatch()` | ✨ next to Stash; fills the summary box, which *is* the stash label |
| `pullRequest` | `branchPatch(base)` (log + `base...HEAD`) | Branch context menu → `PullRequestDialog` (base picker, copy buttons) |
| `conflictResolution` | the conflicted file verbatim | "AI" button on a conflict row |
| `commitComposer` | `workingPatch()` + dirty file list | "Compose commits" → `ComposerDialog` |

Two of them need care:

- **Conflict resolution writes the merged file but deliberately does NOT stage it** — the user
  reviews the diff and clicks Resolved. The reply is rejected outright if any `<<<<<<<`/`=======`/
  `>>>>>>>` survives, so a half-merged file is never written. The model answers with a
  `CONFIDENCE:`/`REASON:` header above a `===MERGED FILE===` delimiter, so the UI can show how
  sure it is; a reply without the delimiter is taken as the bare file and reports no confidence
  rather than a made-up one. The merge tool calls the same feature with `preview: true` and gets
  the text back instead — see [[merge-tool]].
- **Commit Composer** asks for JSON, then *validates it against reality* in main: unknown paths are
  dropped, duplicates go to the first group only, and anything the model forgot is reported as
  `leftover` rather than silently lost. Applying the plan runs `gitService.commitGroups()`, which
  `git reset`s the index between groups — so a hand-made staging setup is regrouped (the dialog
  says so). PR and composer prompts are JSON; `parseJson` takes the outermost `{…}` because models
  wrap JSON in fences no matter how firmly you ask.

UI: Settings → **AI** (`AiSection.tsx`) lists all six blocks. Every AI button is hidden unless
`ai.enabled`, shows a spinner while `aiBusy` matches its feature (the commit box gets a full
overlay), and deep-links to the settings tab when no key is stored yet. AI error codes
(`AI_NO_KEY`, `AI_BAD_KEY`, `AI_DISABLED`, `AI_NO_MODEL`, `AI_NO_BASE_URL`) get an "Open AI
settings" toast action.

Related: [[settings]], [[ipc-contract]], [[git-service]], [[architecture-overview]].
