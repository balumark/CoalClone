---
name: diff2html-theming
description: How the diff colors are controlled and why the line-number column is forced to static.
metadata:
  type: convention
---

The DiffViewer renders `diff2html` HTML; all its styling lives in
`src/renderer/styles/index.css` (after the `@import` of the diff2html bundle).

- **Colors:** diff2html's own dark theme is gated behind `@media (prefers-color-scheme: dark)` /
  `.d2h-dark-color-scheme`. When the OS is in **light** mode that media query doesn't match and
  bright light-theme colors leak into our dark UI (neon green/pink word highlights `#97f295` /
  `#ffb6ba`). Fix: on `.d2h-wrapper` we define **both** the light-named (`--d2h-*`) and
  dark-named (`--d2h-dark-*`) custom properties to one soft palette, so the diff looks identical
  regardless of OS theme. Palette is intentionally muted: whole-line washes ~0.07–0.08 alpha,
  inline word highlights ~0.22, borders transparent. The hunk-header (`@@ … @@`) row is
  `.d2h-info` — its light-theme bg is near-white (`#f8fafd`), so we also set
  `--d2h-info-bg-color`/`--d2h-info-border-color` (both variants) to a faint blue tint. To
  retune, edit those vars — don't add per-rule overrides.
- **Line-number drift on scroll:** diff2html pins the number column with `position: absolute`
  (width 7.5em) and reserves space via `padding: 0 8em` on `.d2h-code-line`. That absolute
  column visibly misaligns while scrolling. We override `.d2h-code-linenumber` /
  `.d2h-code-side-linenumber` to `position: static` **and `display: table-cell`** (diff2html also
  makes it `inline-block`; leaving that while un-pinning collapses the row into a wide empty gap),
  and reset the code cell to `display: table-cell; padding: 0 0.5em; width: auto`. Numbers become
  a normal table column locked to their rows. Trade-off: numbers are no longer sticky during
  horizontal scroll (they scroll with the code), which is predictable and was preferred.

Related: [[architecture-overview]] (renderer), [[tech-stack]] (diff2html).
