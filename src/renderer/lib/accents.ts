// Accent color presets. The accent token is `rgb(var(--accent) / <alpha-value>)`
// (tailwind.config.js), so setting these CSS vars retints every accent-* class
// (including /alpha variants) app-wide, no rebuild needed.

export interface Accent {
  key: string
  label: string
  rgb: string // "r g b"
  hover: string
}

export const ACCENTS: Accent[] = [
  { key: 'blue', label: 'Blue', rgb: '76 141 255', hover: '61 123 239' },
  { key: 'violet', label: 'Violet', rgb: '139 92 246', hover: '124 77 230' },
  { key: 'green', label: 'Green', rgb: '63 185 80', hover: '46 160 67' },
  { key: 'amber', label: 'Amber', rgb: '210 153 34', hover: '190 137 30' },
  { key: 'rose', label: 'Rose', rgb: '244 81 73', hover: '225 66 58' }
]

export function applyAccent(key: string): void {
  const a = ACCENTS.find((x) => x.key === key) ?? ACCENTS[0]
  const root = document.documentElement
  root.style.setProperty('--accent', a.rgb)
  root.style.setProperty('--accent-hover', a.hover)
}
