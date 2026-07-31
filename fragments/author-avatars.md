---
name: author-avatars
description: Commit author avatars via Gravatar fetched in main (CSP bypass), with identicon fallback.
metadata:
  type: decision
---

Commit author (and co-author) avatars in `CommitDetail` come from **Gravatar**, but the
renderer's CSP (`img-src 'self' data:`, no external network) blocks fetching gravatar.com
directly. Pattern: **fetch external resources in the MAIN process and hand the renderer a
`data:` URI**, which the CSP allows.

- `src/main/avatar.ts` → `getAvatar(email)`: md5 the lowercased email, GET
  `https://www.gravatar.com/avatar/<hash>?d=404&s=80` (`d=404` → HTTP 404 when the address has
  no avatar). 200 → `data:<type>;base64,…`; 404 → null. Positive + 404 results are cached in a
  Map; transient/offline errors are NOT cached so a later select retries. 4s AbortController.
  This is an **outward network call** (email hash leaves the machine) — the standard git-GUI
  behaviour, added because the user asked to see real avatars.
- Channel `AvatarGet` → preload `window.api.avatar.get(email): Result<string|null>`.
- Renderer `components/Identicon/Avatar.tsx` shows the `<img>` when a URI comes back, else falls
  back to `Identicon.tsx` (deterministic offline identicon from the same seed). Module-level
  cache by email so switching commits doesn't refetch/flicker. Avatar failures never toast
  (component reads the Result directly, no `unwrap`).

Reusable takeaway: anything the renderer needs from the network/external hosts must be proxied
through main (IPC → data URI / plain data), because of the strict CSP. Related:
[[architecture-overview]], [[commit-detail]] (if added).
