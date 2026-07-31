// Deterministic GitHub-style identicon rendered as inline SVG. Used as a commit
// author/co-author avatar — the app is offline/CSP-locked so we can't fetch
// Gravatar; instead we derive a stable 5×5 mirrored pattern + hue from the seed
// (author email). Same seed → same avatar everywhere.

function hashStr(s: string): number {
  let h = 0x811c9dc5 // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export default function Identicon({
  seed,
  size = 32,
  className = ''
}: {
  seed: string
  size?: number
  className?: string
}): JSX.Element {
  const h = hashStr((seed || '?').trim().toLowerCase())
  const color = `hsl(${(h >>> 16) % 360}, 52%, 60%)`
  const cell = size / 5
  const rects: JSX.Element[] = []
  // Columns 0..2 drive the pattern; 3,4 mirror 1,0 for left/right symmetry.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      if (((h >> (r * 3 + c)) & 1) === 1) {
        const cols = c === 2 ? [2] : [c, 4 - c]
        for (const cc of cols) {
          rects.push(
            <rect
              key={`${r}-${cc}`}
              x={cc * cell}
              y={r * cell}
              width={cell + 0.5}
              height={cell + 0.5}
              fill={color}
            />
          )
        }
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded shrink-0 ${className}`}
      style={{ background: 'rgba(148,163,184,0.08)' }}
      aria-hidden
    >
      {rects}
    </svg>
  )
}
