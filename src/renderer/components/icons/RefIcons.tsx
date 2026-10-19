// Tiny inline SVG icons used to mark local vs remote branches (and tags) in the
// sidebar and the graph ref badges. Inline SVG (not unicode/emoji) so they render
// identically on Windows/macOS/Linux. Size follows font-size (1em); color follows
// currentColor, so callers set size/color with text-* utility classes.

export function ComputerIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon device-desktop — signals "local, on this machine"
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M14.25 1c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 14.25 12h-3.727c.099 1.041.52 1.872 1.29 2.282A.75.75 0 0 1 11.5 15.5h-7a.75.75 0 0 1-.313-1.428c.77-.41 1.191-1.24 1.29-2.282H1.75A1.75 1.75 0 0 1 0 10.25v-7.5C0 1.784.784 1 1.75 1Zm0 1.5H1.75a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}

export function BranchIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon git-branch
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  )
}

export function RemoteIcon({ className = '' }: { className?: string }): JSX.Element {
  // a simple cloud — signals "lives on a remote"
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M4.6 13C2.6 13 1 11.4 1 9.4c0-1.8 1.35-3.3 3.13-3.53C4.85 4.15 6.5 3 8.4 3c2.05 0 3.78 1.5 4.05 3.5H12.7c1.27 0 2.3 1.05 2.3 2.35C15 11.35 13.7 13 11.9 13H4.6Z" />
    </svg>
  )
}

export function LockIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon shield-lock — commit-signature indicator
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0c.208 0 .414.043.6.126l5.919 2.556A1.5 1.5 0 0 1 15.5 4.061v3.836c0 4.19-2.55 6.86-7.05 8.98a1.05 1.05 0 0 1-.9 0C3.05 14.757.5 12.087.5 7.897V4.061A1.5 1.5 0 0 1 1.48 2.682L7.4.126A1.52 1.52 0 0 1 8 0Zm-1 8.75V10a1 1 0 1 0 2 0V8.75a1.5 1.5 0 1 0-2 0Z" />
    </svg>
  )
}

export function TagIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon tag
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm3.75-3.025a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  )
}

export function FolderIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon file-directory
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75ZM1.5 2.75a.25.25 0 0 1 .25-.25H5a.25.25 0 0 1 .2.1l.9 1.2c.33.44.85.7 1.4.7h6.75a.25.25 0 0 1 .25.25v8.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25V2.75Z" />
    </svg>
  )
}

export function ChevronIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon chevron-right — rotate 90° for "open"
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  )
}

export function SearchIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon search
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
    </svg>
  )
}

export function GlobeIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon globe — a remote (origin, upstream…)
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948Zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 0 0-4.666 5.5Zm10.181 1.5c-.144 2.074-.866 3.756-1.58 4.948-.12.197-.237.381-.353.552a6.507 6.507 0 0 0 4.666-5.5Zm2.733-1.5a6.507 6.507 0 0 0-4.666-5.5c.123.181.24.365.353.552.714 1.192 1.436 2.874 1.58 4.948Z" />
    </svg>
  )
}

export function StashIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon inbox
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M2.8 2.06A1.75 1.75 0 0 1 4.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25v-4.5c0-.101.02-.202.06-.295Zm1.61.44a.25.25 0 0 0-.23.152L1.887 8H4.75a.75.75 0 0 1 .6.3L6.625 10h2.75l1.275-1.7a.75.75 0 0 1 .6-.3h2.863L11.82 2.652a.25.25 0 0 0-.23-.152Zm10.09 7h-2.875l-1.275 1.7a.75.75 0 0 1-.6.3h-3.5a.75.75 0 0 1-.6-.3L4.375 9.5H1.5v3.75c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25Z" />
    </svg>
  )
}

export function SubmoduleIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon file-submodule
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M0 2.75C0 1.784.784 1 1.75 1H5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1h6.75c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm9.42 9.36 2.883-2.677a.25.25 0 0 0 0-.366L9.42 6.39a.249.249 0 0 0-.42.183V8.5H4.75a.75.75 0 0 0 0 1.5H9v1.927c0 .218.26.331.42.183Z" />
    </svg>
  )
}

export function CheckIcon({ className = '' }: { className?: string }): JSX.Element {
  // octicon check
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}
