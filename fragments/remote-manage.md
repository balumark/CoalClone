---
name: remote-manage
description: Remote add / edit-URL / remove wiring, managed from the Sidebar Remotes section.
metadata:
  type: decision
---

Milestone 4 remote management (add / edit URL / remove).

- **gitService** ([[git-service]]): `addRemote(name, url)` (`git remote add`),
  `setRemoteUrl(name, url)` (`git remote set-url`), `removeRemote(name)` (`git remote remove`).
  Channels `GitAddRemote` / `GitSetRemoteUrl` / `GitRemoveRemote`; store actions unwrap + refresh
  + info toast. (Read side `remotes()` / snapshot already existed.)
- **UI** — Sidebar "Remotes" section: a **+** header action adds a remote (chained `askInput`
  prompts — name, then URL, since [[input-prompt]]'s askInput is single-field). Each remote row
  has hover **✎** (edit URL, prefilled) and **⨯** (remove, `window.confirm`).
- Tag create already exists ([[history-ops]] context menu); **tag push and remote rename are not
  done yet**, nor is per-branch push-to-a-chosen-remote.
- Test: `describe('gitService remotes')` add → set-url → remove round-trip.

Related: [[git-service]], [[branch-manage]], [[milestone-roadmap]].
