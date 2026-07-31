---
name: commit-signing
description: Signing new commits (-S) and showing signature verification status.
metadata:
  type: decision
---

Final Milestone 3 feature: GPG/SSH commit signing + verification display.

- **Sign new commits**: `CommitOptions.sign` → `gitService.commit` adds `-S`. The CommitPanel
  shows a **"Sign"** checkbox only when a key is configured (`StatusResult.signingConfigured`,
  computed in `status()` via `git config --get user.signingkey`), and it defaults **on** when
  configured (an effect syncs `sign` to `signingConfigured`). If signing fails (bad/no key), the
  normal error toast surfaces it.
- **Verification display**: `gitService.signatureInfo(hash)` runs
  `git show --no-patch --format=%G?<SEP>%GS <hash>` and maps git's `%G?` code via `mapSignature`:
  `G`/`U` → **good**, `B`/`R`/`X`/`Y` → **invalid**, `E` → **unverified** (can't check), else
  **none**. Fetched **on demand** per selected commit (NOT in the bulk `log()` — verifying 500
  commits would be slow). `CommitDetail` fetches it in an effect keyed on `selectedCommit` and
  shows a lock badge (LockIcon): Verified (green) / Bad signature (red) / Unverified (muted),
  signer name in the title. No badge for unsigned commits.
- Channel `GitSignature` → `window.api.git.signature`.
- Test: `describe('gitService signatures')` asserts an unsigned test commit → `none` and
  `signingConfigured === false` (real signing needs a key, untestable in the throwaway repo).

Related: [[history-ops]], [[git-service]], [[milestone-roadmap]].
