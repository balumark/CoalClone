---
name: tags-and-dnd
description: Tag push/delete (Sidebar) and graph drag-and-drop to move a branch to a commit.
metadata:
  type: decision
---

Closes M4 (tag push/delete) and the deferred M2 item (graph drag-and-drop).

**Tag push/delete** ([[git-service]]): `pushTag(name, remote='origin')` (`git push <remote>
<name>`), `deleteTag(name)` (`git tag -d`, local only — remote-tag delete not built). Channels
`GitPushTag`/`GitDeleteTag`; store `pushTag`/`deleteTag` (unwrap+refresh+toast). Sidebar Tags rows
get hover **Push** (to origin) + **⨯** (delete, confirm). Tag *create* was already in the graph
commit menu ([[history-ops]]).

**Graph drag-and-drop** — drag a **local (non-current) branch badge** onto a commit row to
force-move it there:
- `gitService.moveBranch(name, target)` = `git branch -f <name> <target>` (git refuses this for
  the *current* branch — so only non-current `kind: 'local'` badges are draggable; move the
  current branch via reset from the context menu instead). Channel `GitMoveBranch`; store
  `moveBranch`.
- Wiring in `CommitGraph`: `RefBadges` marks `kind === 'local'` spans `draggable` and stashes the
  branch name in `dataTransfer['application/kc-branch']`; the main graph commit-row buttons
  `preventDefault` on dragover (of that type) and on drop call `moveBranch(branch, hash)` after a
  `window.confirm`. Only the graph rows are drop targets (not the search results list).
- Tests: create→delete tag; force-move a non-current branch to `HEAD~1`.

Related: [[remote-manage]], [[history-ops]], [[commit-search]], [[milestone-roadmap]].
