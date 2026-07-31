// Tiny inline SVG icons used to mark local vs remote branches (and tags) in the
// sidebar and the graph ref badges. Inline SVG (not unicode/emoji) so they render
// identically on Windows/macOS/Linux. Size follows font-size (1em); color follows
// currentColor, so callers set size/color with text-* utility classes.

export function ComputerIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon device-desktop — signals "local, on this machine"
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" className={className} fill="currentColor" aria-hidden>
      <path d="M14.25 1c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 14.25 12h-3.727c.099 1.041.52 1.872 1.29 2.282A.75.75 0 0 1 11.5 15.5h-7a.75.75 0 0 1-.313-1.428c.77-.41 1.191-1.24 1.29-2.282H1.75A1.75 1.75 0 0 1 0 10.25v-7.5C0 1.784.784 1 1.75 1Zm0 1.5H1.75a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}

export function BranchIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon git-branch
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" className={className} fill="currentColor" aria-hidden>
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  )
}

export function RemoteIcon({ className = '' }: { className?: string }): JSX.Element {
  // a simple cloud — signals "lives on a remote"
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" className={className} fill="currentColor" aria-hidden>
      <path d="M4.6 13C2.6 13 1 11.4 1 9.4c0-1.8 1.35-3.3 3.13-3.53C4.85 4.15 6.5 3 8.4 3c2.05 0 3.78 1.5 4.05 3.5H12.7c1.27 0 2.3 1.05 2.3 2.35C15 11.35 13.7 13 11.9 13H4.6Z" />
    </svg>
  )
}

export function LockIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon shield-lock — commit-signature indicator
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0c.208 0 .414.043.6.126l5.919 2.556A1.5 1.5 0 0 1 15.5 4.061v3.836c0 4.19-2.55 6.86-7.05 8.98a1.05 1.05 0 0 1-.9 0C3.05 14.757.5 12.087.5 7.897V4.061A1.5 1.5 0 0 1 1.48 2.682L7.4.126A1.52 1.52 0 0 1 8 0Zm-1 8.75V10a1 1 0 1 0 2 0V8.75a1.5 1.5 0 1 0-2 0Z" />
    </svg>
  )
}

export function TagIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon tag
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" className={className} fill="currentColor" aria-hidden>
      <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm3.75-3.025a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  )
}
