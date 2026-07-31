/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // GitKraken-style dark theme tokens (see fragments/platform.md & CLAUDE.md)
        base: {
          900: '#12141a',
          800: '#191c23',
          700: '#20242d',
          600: '#2a2f3a',
          500: '#363c49'
        },
        edge: '#2e333d',
        txt: {
          DEFAULT: '#c8cdd6',
          muted: '#8b93a1',
          bright: '#eef1f5'
        },
        // accent is themeable at runtime via CSS vars (see lib/accents.ts + settings)
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)'
        },
        good: '#3fb950',
        warn: '#d29922',
        bad: '#f85149'
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
}
