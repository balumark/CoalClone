---
name: dark-native-widgets
description: nativeTheme.themeSource = 'dark' in main (CSS color-scheme can't reach select popups); prefer a ContextMenu dropdown over <select> in the chrome.
metadata:
  type: convention
---

`color-scheme: dark` in `styles/index.css` only covers what Chromium paints **inside** the
page. `<select>` popups and native dialogs are drawn outside it and follow the OS theme, so
on a light-themed Windows they flash up white in the middle of the dark UI. Fix, set once in
`main/index.ts` on `app.whenReady()`:

```ts
nativeTheme.themeSource = 'dark'
```

The app is dark-only, so this is unconditional — don't make it a setting.

For app **chrome** (tab bar, toolbar) prefer the existing `ContextMenu` component over a
`<select>`: it takes `{x, y, items}` from the trigger's `getBoundingClientRect()` (clamp x
inside `window.innerWidth`), closes on outside click/Escape, and can carry a separator plus
a "Manage…" row. The tab-bar profile picker works this way. Inside forms and dialogs a
plain `<select>` is still fine — with `themeSource` set, its popup is dark.
