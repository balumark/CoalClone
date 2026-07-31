// Small formatting helpers used across renderer components.

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.floor((Date.now() - then) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/** Full date + time for the commit detail, e.g. "07/07/2026 @ 11:40 AM". */
export function fullDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} @ ${time}`
}

// Progress wording. Main reports the bare action name ('Push'); the UI says what
// is happening ('Pushing…'). Only the ops worth naming are listed — anything
// else falls back to whatever message main sent.
const RUNNING_LABELS: Record<string, string> = {
  Fetch: 'Fetching…',
  Pull: 'Pulling…',
  Push: 'Pushing…',
  Stage: 'Staging…',
  Unstage: 'Unstaging…',
  Discard: 'Discarding…',
  Commit: 'Committing…',
  Stash: 'Stashing…',
  'Creating commits': 'Creating commits…'
}

/** True for the operations that talk to a remote (and so can take a while). */
export function isRemoteAction(action: string | null): boolean {
  return action === 'Fetch' || action === 'Pull' || action === 'Push'
}

/** Operations that rewrite the index or working tree, i.e. the Commit panel's own. */
const WORKING_ACTIONS = ['Stage', 'Unstage', 'Discard', 'Commit', 'Stash', 'Creating commits']

export function isWorkingAction(action: string | null): boolean {
  return !!action && WORKING_ACTIONS.includes(action)
}

export function runningLabel(action: string | null, fallback: string): string {
  return (action && RUNNING_LABELS[action]) || fallback
}

/** Turn a raw ref like "HEAD -> main" or "tag: v1" into a display label + kind. */
export interface RefBadge {
  label: string
  kind: 'head' | 'local' | 'remote' | 'tag'
}

export function parseRef(ref: string, remotes?: Set<string>): RefBadge {
  if (ref.startsWith('tag: ')) return { label: ref.slice(5), kind: 'tag' }
  if (ref.startsWith('HEAD -> ')) return { label: ref.slice(8), kind: 'head' }
  if (ref === 'HEAD') return { label: 'HEAD', kind: 'head' }
  const slash = ref.indexOf('/')
  if (slash > 0) {
    // A slashed ref is remote only when its first segment is an actual remote name.
    // Without the remote list we fall back to the old "any slash = remote" guess,
    // but a slashed LOCAL branch (feature/x) must not be mistaken for a remote.
    const first = ref.slice(0, slash)
    if (remotes ? remotes.has(first) : true) return { label: ref, kind: 'remote' }
  }
  return { label: ref, kind: 'local' }
}
