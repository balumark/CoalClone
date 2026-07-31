---
name: input-prompt
description: Electron has no window.prompt; use the store's askInput() + PromptDialog for any text input.
metadata:
  type: convention
---

**Never call `window.prompt()` in the renderer** — Electron throws
`"prompt() is and will not be supported"`, so the handler dies silently and the button "does
nothing" (this hit new-branch, rename, create-branch/tag). `window.confirm()` and
`window.alert()` DO work (native dialogs), so those are fine.

For any single-line text input use the store's promise-based prompt:

```ts
const name = await askInput({ title: 'New branch name', placeholder: 'feature/…', okLabel: 'Create' })
if (name) { /* already trimmed; null means cancelled */ }
```

Wiring: `useRepoStore` holds `promptReq` + `askInput(opts): Promise<string|null>` + `resolvePrompt`.
`askInput` stashes a resolver in state; `components/PromptDialog` (mounted once at the top of
`App.tsx`) renders the modal, submits on Enter/OK (resolves the trimmed value, empty disabled),
and cancels on Escape / backdrop / Cancel (resolves null). Opening a new prompt while one is open
cancels the previous one so no resolver is orphaned. Menu/handler callers that use it become
`async` — wrap their JSX `onClick` in `() => void fn()` to satisfy the no-misused-promises lint.

The same modal runs in **confirm mode** via `askConfirm({ title, message, okLabel })`
(`Promise<boolean>`): no input field, just the message and Cancel/OK. Preferred over
`window.confirm()` when the action deserves a custom OK label or in-app styling — see
[[init-non-repo]].

Related: [[history-ops]], [[branch-manage]], [[architecture-overview]].
