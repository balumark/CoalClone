import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import Avatar from '@renderer/components/Identicon/Avatar'
import { LockIcon } from '@renderer/components/icons/RefIcons'
import { fullDateTime } from '@renderer/lib/format'
import type { SignatureInfo } from '@shared/types'

// Shows metadata + changed-file list for the selected commit. Clicking a file
// loads its diff into the DiffViewer.

const typeGlyph: Record<string, string> = {
  add: 'A',
  del: 'D',
  mod: 'M'
}

interface Person {
  name: string
  email: string
}

/** Pull "Co-authored-by: Name <email>" trailers out of a commit body. */
function parseCoAuthors(body: string): Person[] {
  const out: Person[] = []
  const re = /^\s*Co-authored-by:\s*(.+?)\s*<([^>]+)>/gim
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.push({ name: m[1], email: m[2] })
  return out
}

export default function CommitDetail(): JSX.Element {
  const snapshot = useRepoStore((s) => s.snapshot)
  const selectedCommit = useRepoStore((s) => s.selectedCommit)
  const commitDiffs = useRepoStore((s) => s.commitDiffs)
  const selectedPath = useRepoStore((s) => s.selectedPath)
  const selectCommitFile = useRepoStore((s) => s.selectCommitFile)
  const selectWorking = useRepoStore((s) => s.selectWorking)
  const ai = useRepoStore((s) => s.settings.ai)
  const aiStatus = useRepoStore((s) => s.aiStatus)
  const aiBusy = useRepoStore((s) => s.aiBusy)
  const aiExplain = useRepoStore((s) => s.aiExplain)
  const explainCommit = useRepoStore((s) => s.explainCommit)
  const closeAiExplain = useRepoStore((s) => s.closeAiExplain)
  const openSettings = useRepoStore((s) => s.setSettingsOpen)

  const status = snapshot?.status
  const workingCount = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0)

  const [signature, setSignature] = useState<SignatureInfo | null>(null)
  useEffect(() => {
    setSignature(null)
    // An explanation belongs to one commit — drop it when the selection moves.
    closeAiExplain()
    if (!selectedCommit) return
    let alive = true
    void window.api.git.signature(selectedCommit).then((res) => {
      if (alive && res.ok) setSignature(res.value)
    })
    return () => {
      alive = false
    }
  }, [selectedCommit, closeAiExplain])

  const commit = snapshot?.commits.find((c) => c.hash === selectedCommit)
  if (!commit) {
    return (
      <div className="flex items-center justify-center h-full text-txt-muted text-sm">
        Select a commit.
      </div>
    )
  }

  const aiReady = ai.enabled && (aiStatus?.saved[ai.provider] ?? false)
  const explaining = aiBusy === 'explainCommit'
  const explanation = aiExplain?.hash === commit.hash ? aiExplain.text : null

  const coAuthors = parseCoAuthors(commit.body)
  const bodyClean = commit.body.replace(/^\s*Co-authored-by:.*$/gim, '').trim()

  return (
    <div className="flex flex-col h-full">
      {workingCount > 0 && (
        <div className="flex items-center gap-2 px-3 h-9 shrink-0 bg-accent/10 border-b border-accent/25">
          <span className="text-[12px] text-txt truncate">
            {workingCount} file change{workingCount === 1 ? '' : 's'} in working directory
          </span>
          <button
            onClick={() => void selectWorking()}
            title="Back to uncommitted changes"
            className="ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded bg-accent text-white hover:bg-accent-hover"
          >
            View Change
          </button>
        </div>
      )}
      <div className="p-3 border-b border-edge shrink-0 select-text">
        <div className="flex items-start gap-3">
          <Avatar email={commit.authorEmail} name={commit.authorName} size={34} />
          <div className="min-w-0 flex-1">
            <div
              className="text-txt-bright font-medium truncate"
              title={`${commit.authorName} <${commit.authorEmail}>`}
            >
              {commit.authorName}
            </div>
            <div className="text-[11px] text-txt-muted">authored {fullDateTime(commit.authorDate)}</div>
            {signature &&
              signature.kind !== 'none' &&
              (() => {
                const label =
                  signature.kind === 'good'
                    ? 'Verified'
                    : signature.kind === 'invalid'
                      ? 'Bad signature'
                      : 'Unverified'
                const cls =
                  signature.kind === 'good'
                    ? 'text-good'
                    : signature.kind === 'invalid'
                      ? 'text-bad'
                      : 'text-txt-muted'
                return (
                  <div
                    className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${cls}`}
                    title={signature.signer ? `${label} — ${signature.signer}` : label}
                  >
                    <LockIcon /> {label}
                  </div>
                )
              })()}
          </div>
          <div className="shrink-0 text-right text-[11px] text-txt-muted">
            <div>
              <span className="font-mono text-txt">{commit.shortHash}</span>
            </div>
            {commit.parents.length > 0 && (
              <div className="mt-0.5">
                parent{commit.parents.length > 1 ? 's' : ''}:
                {commit.parents.map((p) => (
                  <span key={p} className="font-mono ml-1">
                    {p.slice(0, 7)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-txt-bright font-medium mt-3">{commit.subject}</div>
        {bodyClean && (
          <pre className="text-[12px] text-txt whitespace-pre-wrap font-sans mt-1">{bodyClean}</pre>
        )}

        {coAuthors.length > 0 && (
          <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-txt-muted">
            <span>Co-authors:</span>
            {coAuthors.map((ca) => (
              <span
                key={ca.email}
                className="inline-flex items-center gap-1.5"
                title={`${ca.name} <${ca.email}>`}
              >
                <Avatar email={ca.email} name={ca.name} size={16} />
                {ca.name}
              </span>
            ))}
          </div>
        )}

        {commit.parents.length > 1 && (
          <div className="text-[11px] text-warn mt-2">
            Merge commit ({commit.parents.length} parents)
          </div>
        )}

        {/* AI: summarise what this commit actually did (Settings → AI). */}
        {ai.enabled && (
          <div className="mt-3">
            <button
              onClick={() => (aiReady ? void explainCommit(commit.hash) : openSettings(true, 'ai'))}
              disabled={explaining}
              title={
                aiReady
                  ? 'Ask the AI to explain this commit'
                  : 'Add a provider API key in Settings → AI first'
              }
              className="text-[11px] px-2 py-0.5 rounded border border-edge text-txt-muted hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {explaining ? 'Explaining…' : 'Explain commit'}
            </button>
            {explanation && (
              <div className="mt-2 rounded border border-edge bg-base-900 p-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-txt-muted">
                    AI explanation
                  </span>
                  <button
                    onClick={closeAiExplain}
                    title="Dismiss"
                    className="text-txt-muted hover:text-txt text-[12px] leading-none"
                  >
                    ⨯
                  </button>
                </div>
                <pre className="mt-1 text-[12px] text-txt whitespace-pre-wrap font-sans">
                  {explanation}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-txt-muted">
          Changed files {commitDiffs ? `(${commitDiffs.length})` : ''}
        </div>
        {commitDiffs?.map((d) => {
          const glyph = d.deletions && !d.additions ? typeGlyph.del : d.additions && !d.deletions ? typeGlyph.add : typeGlyph.mod
          const glyphColor =
            glyph === 'A' ? 'text-good' : glyph === 'D' ? 'text-bad' : 'text-warn'
          return (
            <button
              key={d.path}
              onClick={() => selectCommitFile(d.path)}
              className={`flex items-center w-full text-left px-3 py-1 gap-2 ${
                selectedPath === d.path ? 'bg-accent/15' : 'hover:bg-base-700'
              }`}
            >
              <span className={`font-mono text-[11px] w-3 ${glyphColor}`}>{glyph}</span>
              <span className="truncate font-mono text-[12px] flex-1">{d.path}</span>
              <span className="text-[10px] text-good">+{d.additions}</span>
              <span className="text-[10px] text-bad">-{d.deletions}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
