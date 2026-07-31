import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import type { MergeFile, MergeSegment } from '@shared/types'

// Three-way merge editor: ours (A) and theirs (B) side by side on top, the
// merged Output below. Every segment occupies the SAME vertical space in both
// top panes — the shorter side is padded — so the two scroll in lockstep and a
// conflict always lines up across the panes.
//
// The model comes from main (gitService.mergeFile -> merge3); this component
// only owns which lines of each conflict the user picked.

/** Fixed row height, so scrolling to a segment is arithmetic, not measurement. */
const ROW = 18
/** Height of the per-conflict toolbar strip, rendered in both panes to keep them aligned. */
const STRIP = 24

interface Pick {
  ours: boolean[]
  theirs: boolean[]
  /** The user has made a call on this conflict (taking neither side is a call). */
  decided: boolean
}

type Picks = Record<number, Pick>

function emptyPicks(segments: MergeSegment[]): Picks {
  const picks: Picks = {}
  segments.forEach((s, i) => {
    if (s.kind !== 'conflict') return
    picks[i] = {
      ours: new Array(s.ours.length).fill(false),
      theirs: new Array(s.theirs.length).fill(false),
      decided: false
    }
  })
  return picks
}

interface OutRow {
  text: string
  origin: LineOrigin
  /** Segment this line came from; -1 for a manually written line. */
  seg: number
}

/** Gutter marker + color for a line's origin. */
const ORIGIN_MARK: Record<LineOrigin, { glyph: string; className: string }> = {
  ours: { glyph: 'A', className: 'text-accent' },
  theirs: { glyph: 'B', className: 'text-good' },
  new: { glyph: '✦', className: 'text-warn' },
  both: { glyph: '·', className: 'text-transparent' }
}

/** The merged file as it currently stands, one row per output line. */
function buildOutput(segments: MergeSegment[], picks: Picks): OutRow[] {
  const rows: OutRow[] = []
  segments.forEach((s, i) => {
    if (s.kind === 'common') {
      for (const text of s.ours) rows.push({ text, origin: 'both', seg: i })
    } else if (s.kind === 'ours') {
      for (const text of s.ours) rows.push({ text, origin: 'ours', seg: i })
    } else if (s.kind === 'theirs') {
      for (const text of s.theirs) rows.push({ text, origin: 'theirs', seg: i })
    } else {
      const p = picks[i]
      s.ours.forEach((text, k) => p?.ours[k] && rows.push({ text, origin: 'ours', seg: i }))
      s.theirs.forEach((text, k) => p?.theirs[k] && rows.push({ text, origin: 'theirs', seg: i }))
    }
  })
  return rows
}

/** How many rows a segment takes up in the top panes (the taller side wins). */
function segmentRows(s: MergeSegment): number {
  return Math.max(s.ours.length, s.theirs.length)
}

type LineOrigin = 'both' | 'ours' | 'theirs' | 'new'

/**
 * Where each line of a hand-edited / AI-generated output came from, matched
 * verbatim against the two sides. `new` means it is in neither — text the model
 * (or the user) wrote itself, which is exactly what wants reviewing.
 *
 * An auto-merged segment only contributes its *winning* side: its loser is the
 * pre-change base, which no correct merge would emit.
 */
function traceOrigins(
  file: MergeFile,
  text: string
): { rows: OutRow[]; counts: Record<LineOrigin, number> } {
  const ours = new Set<string>()
  const theirs = new Set<string>()
  const common = new Set<string>()
  for (const s of file.segments) {
    if (s.kind === 'common') for (const l of s.ours) common.add(l)
    if (s.kind === 'ours' || s.kind === 'conflict') for (const l of s.ours) ours.add(l)
    if (s.kind === 'theirs' || s.kind === 'conflict') for (const l of s.theirs) theirs.add(l)
  }
  const counts: Record<LineOrigin, number> = { both: 0, ours: 0, theirs: 0, new: 0 }
  const rows = text.split(/\r?\n/).map((line): OutRow => {
    let origin: LineOrigin
    if (!line.trim() || common.has(line)) origin = 'both'
    else if (ours.has(line) && theirs.has(line)) origin = 'both'
    else if (ours.has(line)) origin = 'ours'
    else if (theirs.has(line)) origin = 'theirs'
    else origin = 'new'
    counts[origin]++
    return { text: line, origin, seg: -1 }
  })
  return { rows, counts }
}

function CheckIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden>
      <path d="M13.7 3.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L6 9.6l6.3-6.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  )
}

function Spinner({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 50 50" aria-hidden>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="6"
        className="stroke-base-600"
        opacity="0.4"
      />
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="80 200"
        className="stroke-accent"
      />
    </svg>
  )
}

/** One of the two top panes. `side` decides which half of each segment it shows. */
function SidePane({
  id,
  side,
  file,
  picks,
  activeSeg,
  onToggleLine,
  onTakeAll,
  scrollRef,
  onScroll
}: {
  id: string
  side: 'ours' | 'theirs'
  file: MergeFile
  picks: Picks
  activeSeg: number | null
  onToggleLine: (seg: number, side: 'ours' | 'theirs', line: number) => void
  onTakeAll: (seg: number, side: 'ours' | 'theirs', on: boolean) => void
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}): JSX.Element {
  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto font-mono text-[12px]">
      <div className="min-w-max">
        {file.segments.map((s, i) => {
          const lines = side === 'ours' ? s.ours : s.theirs
          const start = side === 'ours' ? s.oursStart : s.theirsStart
          const rows = segmentRows(s)
          const pad = rows - lines.length
          const pick = picks[i]
          const sel = side === 'ours' ? pick?.ours : pick?.theirs
          const allOn = !!sel && sel.length > 0 && sel.every(Boolean)
          const conflict = s.kind === 'conflict'
          const won = s.kind === side // auto-merged from this side
          const active = activeSeg === i
          return (
            <div
              key={i}
              id={`${id}-${i}`}
              className={
                conflict
                  ? `border-l-2 ${active ? 'border-accent bg-accent/[0.07]' : 'border-warn bg-warn/[0.06]'}`
                  : won
                    ? 'border-l-2 border-good/70 bg-good/[0.05]'
                    : 'border-l-2 border-transparent'
              }
            >
              {conflict && (
                <div
                  style={{ height: STRIP }}
                  className="flex items-center gap-2 px-2 text-[10px] text-txt-muted bg-base-700/60 border-y border-edge/70 sticky left-0"
                >
                  <button
                    onClick={() => onTakeAll(i, side, !allOn)}
                    disabled={lines.length === 0}
                    className={`w-3.5 h-3.5 shrink-0 rounded-[3px] border flex items-center justify-center disabled:opacity-30 ${
                      allOn
                        ? 'bg-good border-good text-base-900'
                        : 'border-txt-muted/60 hover:border-txt'
                    }`}
                    title={
                      lines.length === 0
                        ? 'This side has no lines here — settle it from the Output panel'
                        : allOn
                          ? 'Drop this whole side'
                          : 'Take this whole side'
                    }
                  >
                    {allOn && <CheckIcon />}
                  </button>
                  <span className="uppercase tracking-wide">
                    {side === 'ours' ? 'A' : 'B'} ·{' '}
                    {lines.length === 0 ? (
                      <span className="text-warn">nothing on this side</span>
                    ) : (
                      `${lines.length} line${lines.length === 1 ? '' : 's'}`
                    )}
                  </span>
                </div>
              )}
              {lines.map((text, k) => {
                const checked = !!sel?.[k]
                return (
                  <div
                    key={k}
                    style={{ height: ROW, lineHeight: `${ROW}px` }}
                    className={`flex items-stretch ${
                      conflict && checked ? 'bg-good/[0.12]' : 'hover:bg-base-700/40'
                    }`}
                  >
                    {conflict ? (
                      <button
                        onClick={() => onToggleLine(i, side, k)}
                        className="w-6 shrink-0 flex items-center justify-center border-r border-edge/40 group/pick"
                        title={
                          checked
                            ? 'Remove this line from the output'
                            : 'Add this line to the output'
                        }
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center ${
                            checked
                              ? 'bg-good border-good text-base-900'
                              : 'border-txt-muted/70 bg-base-900/40 group-hover/pick:border-good'
                          }`}
                        >
                          {checked && <CheckIcon />}
                        </span>
                      </button>
                    ) : (
                      <span className="w-6 shrink-0 border-r border-edge/40" />
                    )}
                    <span className="w-[52px] shrink-0 px-2 text-right text-txt-muted/50 select-none">
                      {start + k + 1}
                    </span>
                    <pre className="flex-1 px-2 whitespace-pre text-txt select-text">{text}</pre>
                  </div>
                )
              })}
              {pad > 0 && (
                <div
                  style={{ height: pad * ROW }}
                  className="bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgba(255,255,255,0.03)_5px,rgba(255,255,255,0.03)_10px)]"
                />
              )}
            </div>
          )
        })}
        <div style={{ height: 200 }} />
      </div>
    </div>
  )
}

export default function MergeToolDialog(): JSX.Element | null {
  const file = useRepoStore((s) => s.mergeTool)
  const loading = useRepoStore((s) => s.mergeToolLoading)
  const close = useRepoStore((s) => s.closeMergeTool)
  const saveMerge = useRepoStore((s) => s.saveMerge)
  const resolveConflict = useRepoStore((s) => s.resolveConflict)
  const ai = useRepoStore((s) => s.settings.ai)
  const aiStatus = useRepoStore((s) => s.aiStatus)
  const aiBusy = useRepoStore((s) => s.aiBusy)
  const aiMergePreview = useRepoStore((s) => s.aiMergePreview)
  const openInEditor = useRepoStore((s) => s.openInEditor)
  const openSettings = useRepoStore((s) => s.setSettingsOpen)

  const [picks, setPicks] = useState<Picks>({})
  /** Hand-edited (or AI-generated) output, which overrides every pick. */
  const [manual, setManual] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  const [saving, setSaving] = useState(false)

  const aRef = useRef<HTMLDivElement>(null)
  const bRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const path = file?.path ?? ''
  useEffect(() => {
    if (!file) return
    setPicks(emptyPicks(file.segments))
    setManual(null)
    setEditing(false)
    setAiNote(null)
    setAiConfidence(null)
    setAiError(null)
    setAt(0)
  }, [file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !editing) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, editing])

  const conflictIdx = useMemo(
    () =>
      file
        ? file.segments.map((s, i) => (s.kind === 'conflict' ? i : -1)).filter((i) => i >= 0)
        : [],
    [file]
  )
  const output = useMemo(() => (file ? buildOutput(file.segments, picks) : []), [file, picks])
  const manualTrace = useMemo(
    () =>
      file && manual !== null
        ? traceOrigins(file, manual)
        : { rows: [], counts: { both: 0, ours: 0, theirs: 0, new: 0 } },
    [file, manual]
  )
  const decided = conflictIdx.filter((i) => picks[i]?.decided).length
  const allDecided = manual !== null || decided === conflictIdx.length

  const syncScroll = useCallback((from: 'a' | 'b') => {
    if (syncing.current) return
    const src = from === 'a' ? aRef.current : bRef.current
    const dst = from === 'a' ? bRef.current : aRef.current
    if (!src || !dst) return
    syncing.current = true
    dst.scrollTop = src.scrollTop
    // requestAnimationFrame, not a timeout: the mirrored scroll event fires on
    // the next frame, and clearing the guard before it would ping-pong.
    requestAnimationFrame(() => (syncing.current = false))
  }, [])

  const goTo = useCallback(
    (n: number) => {
      if (!conflictIdx.length) return
      const idx = (n + conflictIdx.length) % conflictIdx.length
      setAt(idx)
      const seg = conflictIdx[idx]
      document.getElementById(`mt-a-${seg}`)?.scrollIntoView({ block: 'center' })
      document.getElementById(`mt-out-${seg}`)?.scrollIntoView({ block: 'center' })
    },
    [conflictIdx]
  )

  /**
   * Any line pick takes the output back from manual/AI mode — otherwise ticking a
   * box would silently do nothing, which reads as a broken checkbox.
   */
  const dropManual = useCallback(() => {
    setManual(null)
    setAiNote(null)
    setAiConfidence(null)
    setEditing(false)
  }, [])

  const toggleLine = useCallback(
    (seg: number, side: 'ours' | 'theirs', line: number) => {
      dropManual()
      setPicks((prev) => {
        const p = prev[seg]
        if (!p) return prev
        const next = [...p[side]]
        next[line] = !next[line]
        return { ...prev, [seg]: { ...p, [side]: next, decided: true } }
      })
    },
    [dropManual]
  )

  const takeAll = useCallback(
    (seg: number, side: 'ours' | 'theirs', on: boolean) => {
      dropManual()
      setPicks((prev) => {
        const p = prev[seg]
        if (!p) return prev
        return { ...prev, [seg]: { ...p, [side]: p[side].map(() => on), decided: true } }
      })
    },
    [dropManual]
  )

  /**
   * Settle one conflict in a single click. `none` is a real answer — it is how a
   * delete wins, and it is the only way to decide a side that has no lines at all.
   */
  const decide = useCallback(
    (seg: number, mode: 'ours' | 'theirs' | 'both' | 'none') => {
      dropManual()
      setPicks((prev) => {
        const p = prev[seg]
        if (!p) return prev
        return {
          ...prev,
          [seg]: {
            ours: p.ours.map(() => mode === 'ours' || mode === 'both'),
            theirs: p.theirs.map(() => mode === 'theirs' || mode === 'both'),
            decided: true
          }
        }
      })
    },
    [dropManual]
  )

  const takeEverySide = useCallback((side: 'ours' | 'theirs') => {
    setManual(null)
    setPicks((prev) => {
      const next: Picks = {}
      for (const [k, p] of Object.entries(prev)) {
        next[Number(k)] = {
          ours: p.ours.map(() => side === 'ours'),
          theirs: p.theirs.map(() => side === 'theirs'),
          decided: true
        }
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    if (!file) return
    setPicks(emptyPicks(file.segments))
    setManual(null)
    setEditing(false)
    setAiNote(null)
    setAiConfidence(null)
  }, [file])

  // No stored key is a setup problem, not a failure: send them to the settings
  // tab instead of firing a request that can only come back as an error.
  const aiReady = ai.enabled && (aiStatus?.saved[ai.provider] ?? false)
  const runAi = useCallback(async () => {
    if (!aiReady) {
      openSettings(true, 'ai')
      return
    }
    setAiError(null)
    const res = await aiMergePreview(path)
    if (!res.ok) {
      setAiError(res.error)
      return
    }
    setManual(res.content)
    setAiNote(res.note)
    setAiConfidence(res.confidence)
    setEditing(false)
  }, [aiMergePreview, aiReady, openSettings, path])

  const save = useCallback(async () => {
    // A binary file has no line output; writing it would truncate the file.
    if (!file || file.binary) return
    const eol = file.crlf ? '\r\n' : '\n'
    let text: string
    if (manual !== null) {
      text = file.crlf ? manual.replace(/\r?\n/g, '\r\n') : manual
    } else {
      const lines = output.map((r) => r.text)
      text = lines.join(eol) + (file.trailingNewline && lines.length ? eol : '')
    }
    setSaving(true)
    try {
      await saveMerge(file.path, text, true)
    } finally {
      setSaving(false)
    }
  }, [file, manual, output, saveMerge])

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
        <div className="flex items-center gap-2 rounded-lg border border-edge bg-base-800 px-4 py-3 text-[12px] text-txt-muted">
          <Spinner /> Reading the conflict…
        </div>
      </div>
    )
  }
  if (!file) return null

  const sideLabel = (s: MergeFile['ours'], letter: string): JSX.Element => (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-4 h-4 shrink-0 rounded bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">
        {letter}
      </span>
      <span className="text-[12px] text-txt-bright shrink-0">Commit {s.commit || '—'}</span>
      {s.label && <span className="text-[12px] text-accent italic truncate">on {s.label}</span>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3">
      <div className="w-full h-full flex flex-col rounded-lg border border-edge bg-base-800 shadow-xl overflow-hidden">
        {/* Header: what is being merged + the whole-file actions */}
        <div className="px-3 py-2 border-b border-edge flex items-center gap-3">
          <span className="text-bad text-[13px]" aria-hidden>
            ⚠
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-mono text-txt-bright truncate">{file.path}</div>
            <div className="text-[11px] text-txt-muted">
              {file.binary
                ? 'Binary file — pick a whole side'
                : conflictIdx.length === 0
                  ? 'No conflicting hunks — everything merged cleanly'
                  : `${decided} of ${conflictIdx.length} conflict${conflictIdx.length === 1 ? '' : 's'} resolved`}
              {file.noBase && ' · no common ancestor (added on both sides)'}
            </div>
          </div>
          {ai.enabled && !file.binary && (
            <button
              onClick={() => void runAi()}
              disabled={aiBusy !== null}
              className="px-2 py-1 rounded text-[11px] border border-accent/50 text-accent hover:bg-accent/10 inline-flex items-center gap-1 disabled:opacity-40"
              title="Let the model merge both sides; the result lands in Output for review"
            >
              {aiBusy === 'conflictResolution' ? <Spinner size={11} /> : '✦'} Auto-resolve with AI
            </button>
          )}
          {!file.binary && (
            <button
              onClick={() => void openInEditor(file.path)}
              className="px-2 py-1 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
              title="Open the marked-up file in your editor"
            >
              Open in editor
            </button>
          )}
          {/* Reset and Save only mean something for a line merge: a binary file
              has no output to write, and saving one would truncate it. */}
          {!file.binary && (
            <>
              <button
                onClick={reset}
                className="px-2 py-1 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
              >
                Reset
              </button>
              <button
                onClick={() => void save()}
                disabled={!allDecided || saving}
                title={
                  allDecided
                    ? 'Write the output and mark the file resolved'
                    : 'Every conflict needs a decision first'
                }
                className="px-3 py-1 rounded text-[11px] bg-accent text-base-900 font-medium hover:bg-accent-hover disabled:opacity-40 inline-flex items-center gap-1"
              >
                {saving && <Spinner size={11} />} Save
              </button>
            </>
          )}
          <button
            onClick={close}
            className="px-2 py-1 rounded text-[11px] text-txt-muted hover:bg-base-700"
          >
            Close
          </button>
        </div>

        {/* An AI failure has to show up here: a toast alone is easy to miss over a
            full-screen dialog, and the button then looks like it does nothing. */}
        {aiError && (
          <div className="px-3 py-1.5 border-b border-bad/40 bg-bad/10 text-[11px] text-bad flex items-start gap-2">
            <span className="shrink-0">Auto-resolve failed —</span>
            <span className="min-w-0 flex-1">{aiError}</span>
            <button
              onClick={() => setAiError(null)}
              className="shrink-0 px-1.5 rounded border border-bad/40 hover:bg-bad/15"
            >
              Dismiss
            </button>
          </div>
        )}

        {file.binary ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[12px] text-txt-muted">
            <div>This file is binary — there is nothing to merge line by line.</div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  void resolveConflict([file.path], 'ours')
                  close()
                }}
                className="px-3 py-1 rounded border border-edge hover:bg-base-700"
              >
                Take ours ({file.ours.label || file.ours.commit})
              </button>
              <button
                onClick={() => {
                  void resolveConflict([file.path], 'theirs')
                  close()
                }}
                className="px-3 py-1 rounded border border-edge hover:bg-base-700"
              >
                Take theirs ({file.theirs.label || file.theirs.commit})
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top: the two sides, aligned segment for segment */}
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 min-w-0 flex flex-col border-r border-edge">
                <div className="px-3 py-1.5 border-b border-edge flex items-center gap-2 bg-base-800">
                  {sideLabel(file.ours, 'A')}
                  <button
                    onClick={() => takeEverySide('ours')}
                    className="ml-auto px-1.5 py-0.5 rounded text-[10px] border border-edge text-txt-muted hover:bg-base-700 shrink-0"
                    title="Resolve every conflict by taking this side"
                  >
                    Take all
                  </button>
                </div>
                <SidePane
                  id="mt-a"
                  side="ours"
                  file={file}
                  picks={picks}
                  activeSeg={conflictIdx[at] ?? null}
                  onToggleLine={toggleLine}
                  onTakeAll={takeAll}
                  scrollRef={aRef}
                  onScroll={() => syncScroll('a')}
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="px-3 py-1.5 border-b border-edge flex items-center gap-2 bg-base-800">
                  {sideLabel(file.theirs, 'B')}
                  <button
                    onClick={() => takeEverySide('theirs')}
                    className="ml-auto px-1.5 py-0.5 rounded text-[10px] border border-edge text-txt-muted hover:bg-base-700 shrink-0"
                    title="Resolve every conflict by taking this side"
                  >
                    Take all
                  </button>
                </div>
                <SidePane
                  id="mt-b"
                  side="theirs"
                  file={file}
                  picks={picks}
                  activeSeg={conflictIdx[at] ?? null}
                  onToggleLine={toggleLine}
                  onTakeAll={takeAll}
                  scrollRef={bRef}
                  onScroll={() => syncScroll('b')}
                />
              </div>
            </div>

            {/* Bottom: the merged result */}
            <div className="h-[38%] min-h-[140px] flex flex-col border-t border-edge bg-base-900">
              <div className="px-3 py-1.5 border-b border-edge flex items-center gap-3 bg-base-800">
                <span className="text-[12px] text-txt-bright">Output</span>
                {conflictIdx.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-txt-muted">
                    <span>
                      conflict {at + 1} of {conflictIdx.length}
                    </span>
                    <button
                      onClick={() => goTo(at - 1)}
                      className="px-1 rounded border border-edge hover:bg-base-700"
                      title="Previous conflict"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => goTo(at + 1)}
                      className="px-1 rounded border border-edge hover:bg-base-700"
                      title="Next conflict"
                    >
                      ↓
                    </button>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {manual !== null && (
                    <span className="text-[10px] text-warn">
                      manual output — ticking a line switches back to picks
                    </span>
                  )}
                  {editing ? (
                    <button
                      onClick={() => setEditing(false)}
                      className="px-2 py-0.5 rounded text-[11px] border border-accent/50 text-accent hover:bg-accent/10"
                    >
                      Done editing
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const eol = file.crlf ? '\r\n' : '\n'
                        if (manual === null) setManual(output.map((r) => r.text).join(eol))
                        setEditing(true)
                      }}
                      className="px-2 py-0.5 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
                    >
                      Edit
                    </button>
                  )}
                  {manual !== null && (
                    <button
                      onClick={() => {
                        setManual(null)
                        setEditing(false)
                        setAiNote(null)
                        setAiConfidence(null)
                      }}
                      className="px-2 py-0.5 rounded text-[11px] border border-edge text-txt-muted hover:bg-base-700"
                    >
                      Discard edits
                    </button>
                  )}
                </div>
              </div>

              {aiNote && (
                <div className="px-3 py-1.5 border-b border-edge text-[11px] text-txt-muted bg-accent/[0.06] flex items-start gap-2">
                  <span className="text-accent shrink-0">AI merge summary</span>
                  {aiConfidence !== null && (
                    <span
                      className={`shrink-0 px-1.5 rounded font-medium ${
                        aiConfidence >= 80
                          ? 'bg-good/20 text-good'
                          : aiConfidence >= 50
                            ? 'bg-warn/20 text-warn'
                            : 'bg-bad/20 text-bad'
                      }`}
                      title="How sure the model is that this is the resolution the authors intended"
                    >
                      {aiConfidence}% confident
                    </span>
                  )}
                  <span className="min-w-0">{aiNote}</span>
                </div>
              )}

              {/* Where the output came from, line for line — the whole point of
                  showing an AI merge rather than just writing it to disk. */}
              {manual !== null && !editing && (
                <div className="px-3 py-1 border-b border-edge text-[10px] text-txt-muted flex items-center gap-3">
                  <span className="text-accent">A {manualTrace.counts.ours} lines</span>
                  <span className="text-good">B {manualTrace.counts.theirs} lines</span>
                  <span>unchanged {manualTrace.counts.both}</span>
                  <span className={manualTrace.counts.new ? 'text-warn' : ''}>
                    ✦ written by hand/model {manualTrace.counts.new}
                  </span>
                </div>
              )}

              {editing ? (
                <textarea
                  value={manual ?? ''}
                  onChange={(e) => setManual(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full resize-none bg-base-900 px-3 py-1 font-mono text-[12px] leading-[18px] text-txt outline-none"
                />
              ) : manual !== null ? (
                <div className="flex-1 overflow-auto font-mono text-[12px]">
                  {manualTrace.rows.map((r, i) => (
                    <div
                      key={i}
                      style={{ height: ROW, lineHeight: `${ROW}px` }}
                      className={`flex ${r.origin === 'new' ? 'bg-warn/[0.08]' : r.origin === 'both' ? '' : 'bg-good/[0.07]'}`}
                    >
                      <span
                        className={`w-6 shrink-0 text-center text-[10px] border-r border-edge/40 ${ORIGIN_MARK[r.origin].className}`}
                        title={
                          r.origin === 'new'
                            ? 'This line is in neither side — it was written, not picked'
                            : undefined
                        }
                      >
                        {ORIGIN_MARK[r.origin].glyph}
                      </span>
                      <span className="w-[52px] shrink-0 px-2 text-right text-txt-muted/50 select-none">
                        {i + 1}
                      </span>
                      <pre className="flex-1 px-2 whitespace-pre text-txt select-text">
                        {r.text}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <OutputPane
                  file={file}
                  picks={picks}
                  output={output}
                  activeSeg={conflictIdx[at] ?? null}
                  onDecide={decide}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The Output pane in pick mode: the merged lines with an A/B origin marker, plus
 * a placeholder wherever a conflict still has no decision.
 */
function OutputPane({
  file,
  picks,
  output,
  activeSeg,
  onDecide
}: {
  file: MergeFile
  picks: Picks
  output: OutRow[]
  activeSeg: number | null
  onDecide: (seg: number, mode: 'ours' | 'theirs' | 'both' | 'none') => void
}): JSX.Element {
  // Group by segment so an undecided conflict can show its own placeholder and
  // "conflict N" navigation has something to scroll to.
  const bySeg = new Map<number, OutRow[]>()
  for (const r of output) {
    const list = bySeg.get(r.seg)
    if (list) list.push(r)
    else bySeg.set(r.seg, [r])
  }
  let line = 0
  return (
    <div className="flex-1 overflow-auto font-mono text-[12px]">
      <div className="min-w-max">
        {file.segments.map((s, i) => {
          const rows = bySeg.get(i) ?? []
          const conflict = s.kind === 'conflict'
          const pending = conflict && !picks[i]?.decided
          return (
            <div
              key={i}
              id={`mt-out-${i}`}
              className={
                conflict
                  ? `border-l-2 ${activeSeg === i ? 'border-accent bg-accent/[0.07]' : 'border-warn bg-warn/[0.05]'}`
                  : 'border-l-2 border-transparent'
              }
            >
              {/* One-click answers live here rather than in the side panes: a
                  side with no lines (a delete) has no checkbox to tick, so this
                  is the only place every conflict can actually be settled. */}
              {pending && (
                <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-warn">
                  <span>⚠ unresolved — tick lines in A / B, or take</span>
                  {[
                    ['ours', 'A'],
                    ['theirs', 'B'],
                    ['both', 'A + B'],
                    ['none', 'neither']
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => onDecide(i, mode as 'ours' | 'theirs' | 'both' | 'none')}
                      className="px-1.5 rounded border border-warn/50 text-warn hover:bg-warn/15"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {rows.map((r, k) => {
                line++
                return (
                  <div
                    key={k}
                    style={{ height: ROW, lineHeight: `${ROW}px` }}
                    className={`flex ${r.origin === 'both' ? '' : 'bg-good/[0.07]'}`}
                  >
                    <span
                      className={`w-6 shrink-0 text-center text-[10px] border-r border-edge/40 ${ORIGIN_MARK[r.origin].className}`}
                    >
                      {ORIGIN_MARK[r.origin].glyph}
                    </span>
                    <span className="w-[52px] shrink-0 px-2 text-right text-txt-muted/50 select-none">
                      {line}
                    </span>
                    <pre className="flex-1 px-2 whitespace-pre text-txt select-text">{r.text}</pre>
                  </div>
                )
              })}
            </div>
          )
        })}
        <div style={{ height: 120 }} />
      </div>
    </div>
  )
}
