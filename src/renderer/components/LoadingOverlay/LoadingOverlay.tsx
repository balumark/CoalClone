import { useEffect, useState } from 'react'
import { APP_NAME } from '@shared/appInfo'

// Full-screen polished loading/init splash. Shown while the app boots and while a
// repository is opening (with a phase message: "Opening repository…", etc).

// Playful quips rotated under the real status line so a slow load feels alive.
const QUIPS = [
  'Olvasom, mindjárt…',
  'Pörgetem a commitokat…',
  'Pfúú, hát ez nehéz…',
  'Csak még egy kicsi…',
  'Nézegetem a branch-eket…',
  'Számolom a fákat az erdőben…',
  'Közben főzök egy kávét…',
  'Hú, de sok commit van itt…',
  'Rendezgetem a lane-eket…',
  'Ez tovább tart, mint hittem…',
  'Ígérem, nem aludtam el…',
  'Már majdnem megvan…',
  'Csak nem akadtam el?',
  'Húzom-vonom a grafikont…',
  'Egy pillanat türelmet…',
  'Guberálok a git history-ban…',
  'Fényezem a pixeleket…',
  'Mindjárt, mindjárt…',
  'Jó lesz ez, ne aggódj…',
  'Na, most már tényleg kész…'
]

// Rotates a random-starting quip every ~2.5s while the overlay is mounted.
function useRotatingQuip(): string {
  const [i, setI] = useState(() => Math.floor(Math.random() * QUIPS.length))
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % QUIPS.length), 2500)
    return () => clearInterval(id)
  }, [])
  return QUIPS[i]
}

function Spinner(): JSX.Element {
  return (
    <svg className="animate-spin" width="38" height="38" viewBox="0 0 50 50" aria-hidden>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="4"
        className="stroke-base-600"
        opacity="0.3"
      />
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="80 200"
        className="stroke-accent"
      />
    </svg>
  )
}

export default function LoadingOverlay({ message }: { message: string }): JSX.Element {
  const quip = useRotatingQuip()
  return (
    <div className="kc-fade fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-base-900/95 backdrop-blur-sm">
      <div className="text-center">
        <div className="text-2xl font-semibold text-txt-bright tracking-tight">{APP_NAME}</div>
        <div className="mt-1 h-px w-24 mx-auto bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      </div>
      <Spinner />
      <div className="flex flex-col items-center gap-1 h-9">
        <div className="text-[12px] text-txt-muted">{message}</div>
        <div key={quip} className="kc-fade text-[11px] text-txt-muted/60 italic">
          {quip}
        </div>
      </div>
    </div>
  )
}
