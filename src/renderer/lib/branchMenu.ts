import type { MenuItem } from '@renderer/components/ContextMenu/ContextMenu'
import type { Branch } from '@shared/types'
import { useRepoStore } from '@renderer/store/useRepoStore'

// Shared builders for the branch/commit right-click menus so the Sidebar and the
// graph offer the same rich, GitKraken-style action set. Everything is read from
// the store via getState(), so callers just hand in the branch/commit.

/** Normalize any git remote URL to an https browse base, or null if unrecognized. */
export function remoteHttpBase(url: string): string | null {
  const u = url.trim().replace(/\.git$/, '')
  const scp = u.match(/^git@([^:]+):(.+)$/) // git@github.com:owner/repo
  if (scp) return `https://${scp[1]}/${scp[2]}`
  const ssh = u.match(/^ssh:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/) // ssh://git@host/owner/repo
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  if (/^https?:\/\//.test(u)) return u.replace(/^http:\/\//, 'https://')
  return null
}

function copy(text: string, what: string): void {
  const { pushToast } = useRepoStore.getState()
  void navigator.clipboard.writeText(text)
  pushToast({ kind: 'info', message: `Copied ${what}` })
}

/** The repo's primary remote browse base (from the first remote), if resolvable. */
function webBase(): string | null {
  const remotes = useRepoStore.getState().snapshot?.remotes ?? []
  return remotes.length ? remoteHttpBase(remotes[0].fetchUrl) : null
}

/** Delete a branch, offering a force-delete if git reports it isn't fully merged. */
async function deleteBranchFlow(b: Branch): Promise<void> {
  const s = useRepoStore.getState()
  const res = await s.deleteBranch(b.name, false)
  if (!res.ok && res.code === 'NOT_MERGED') {
    if (window.confirm(`Branch "${b.name}" is not fully merged. Delete anyway?`))
      await s.deleteBranch(b.name, true)
  }
}

/**
 * What a PR from `b` most likely targets: its upstream's trunk, else a local
 * main/master, else the first other branch. The dialog lets you change it.
 */
function defaultBase(b: Branch): string {
  const names = (useRepoStore.getState().snapshot?.branches ?? []).map((x) =>
    x.isRemote ? x.name.replace(/^remotes\//, '') : x.name
  )
  const short = b.name.replace(/^remotes\//, '')
  const preferred = ['origin/main', 'origin/master', 'main', 'master', 'develop']
  return (
    preferred.find((n) => names.includes(n) && n !== short) ??
    names.find((n) => n !== short) ??
    'main'
  )
}

/** Reset-here submenu (soft/mixed/hard) targeting a commit. */
export function resetSubmenu(hash: string, current: string): MenuItem {
  const s = useRepoStore.getState()
  return {
    label: `Reset ${current} here`,
    submenu: [
      { label: 'Soft — keep changes staged', onClick: () => void s.reset(hash, 'soft') },
      { label: 'Mixed — keep changes unstaged', onClick: () => void s.reset(hash, 'mixed') },
      {
        label: 'Hard — discard changes',
        danger: true,
        onClick: () => {
          if (window.confirm('Reset --hard? This permanently discards working-tree changes.'))
            void s.reset(hash, 'hard')
        }
      }
    ]
  }
}

/** Copy-name / copy-link items for a commit (with optional branch ref for a branch link). */
export function copyItems(hash: string, branchForUrl?: string): MenuItem[] {
  const base = webBase()
  const items: MenuItem[] = [{ label: 'Copy commit SHA', onClick: () => copy(hash, 'SHA') }]
  if (base) items.push({ label: 'Copy link to commit', onClick: () => copy(`${base}/commit/${hash}`, 'link') })
  if (base && branchForUrl)
    items.push({ label: 'Copy link to branch', onClick: () => copy(`${base}/tree/${branchForUrl}`, 'link') })
  return items
}

/** The full branch action menu (used by the Sidebar and by graph branch labels). */
export function buildBranchMenu(b: Branch): MenuItem[] {
  const s = useRepoStore.getState()
  const snap = s.snapshot
  const current = snap?.status.branch ?? null
  const short = b.name.replace(/^remotes\//, '')
  const webBranch = b.isRemote ? short.replace(/^[^/]+\//, '') : short
  const items: MenuItem[] = []

  // --- checkout / sync ---
  if (!b.current) items.push({ label: 'Check out', onClick: () => void s.checkout(b.name) })
  if (b.current) items.push({ label: 'Pull', onClick: () => void s.pull() })
  if (!b.isRemote) {
    items.push({
      label: 'Push',
      onClick: () => void s.push({ remote: 'origin', branch: b.name, setUpstream: !b.upstream })
    })
    items.push({
      label: 'Set upstream…',
      onClick: async () => {
        const up = await s.askInput({
          title: `Set upstream for ${short}`,
          placeholder: 'origin/main',
          initial: b.upstream ?? ''
        })
        if (up) void s.setUpstream(b.name, up)
      }
    })
  }
  if (b.upstream && b.behind > 0) {
    items.push({
      label: `Fast-forward "${short}" to ${b.upstream}`,
      onClick: () => void s.fastForward(b.name, b.upstream as string)
    })
  }

  // --- merge / rebase relative to the checked-out branch ---
  if (!b.current && current) {
    items.push({ separator: true })
    items.push({ label: `Merge "${short}" into ${current}`, onClick: () => void s.merge(b.name) })
    items.push({
      label: `Rebase ${current} onto "${short}"`,
      onClick: () => {
        if (window.confirm(`Rebase ${current} onto "${short}"? This rewrites ${current}'s history.`))
          void s.rebase(b.name)
      }
    })
  }

  // --- AI: pull-request draft for this branch (needs a base to compare against) ---
  if (s.settings.ai.enabled && !b.isRemote) {
    items.push({ separator: true })
    items.push({
      label: 'Write pull request description…',
      onClick: () => s.openPullRequest(defaultBase(b))
    })
  }

  // --- create from the branch tip ---
  items.push({ separator: true })
  items.push({
    label: 'Create branch here…',
    onClick: async () => {
      const name = await s.askInput({ title: 'New branch name', placeholder: 'feature/…' })
      if (name) void s.createBranch(name, true, b.commit)
    }
  })
  items.push({ label: 'Create worktree from here…', onClick: () => void s.createWorktree(b.name) })
  items.push({
    label: 'Create tag here…',
    onClick: async () => {
      const name = await s.askInput({ title: 'Tag name', placeholder: 'v1.0.0' })
      if (name) void s.createTag(name, b.commit)
    }
  })

  // --- history ops on the tip commit ---
  items.push({ separator: true })
  items.push({ label: 'Cherry-pick tip commit', onClick: () => void s.cherryPick(b.commit) })
  items.push({ label: 'Revert tip commit', onClick: () => void s.revert(b.commit) })
  if (current) items.push(resetSubmenu(b.commit, current))
  items.push({
    label: 'Create patch from tip…',
    onClick: () => void s.createPatch(b.commit, b.commit.slice(0, 7))
  })

  // --- rename / delete (local only) ---
  if (!b.isRemote) {
    items.push({ separator: true })
    items.push({
      label: 'Rename…',
      onClick: async () => {
        const name = await s.askInput({ title: 'Rename branch', initial: b.name })
        if (name && name !== b.name) void s.renameBranch(b.name, name)
      }
    })
    if (!b.current)
      items.push({ label: 'Delete', danger: true, onClick: () => void deleteBranchFlow(b) })
  }

  // --- copy ---
  items.push({ separator: true })
  items.push({ label: 'Copy branch name', onClick: () => copy(short, 'branch name') })
  items.push(...copyItems(b.commit, webBranch))

  // --- solo focus ---
  items.push({ separator: true })
  const soloed = s.soloBranch === b.name
  items.push({
    label: soloed ? 'Exit Solo' : 'Solo',
    onClick: () => s.setSolo(soloed ? null : b.name)
  })

  return items
}
