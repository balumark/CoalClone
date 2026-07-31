import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import Identicon from './Identicon'

// Commit author avatar: shows the real Gravatar image when the address has one
// (fetched in main, delivered as a data: URI), otherwise falls back to a
// generated identicon. Results are cached per email at module scope so switching
// between commits doesn't refetch or flicker.

const cache = new Map<string, string | null>()

export default function Avatar({
  email,
  name,
  size = 32,
  className = ''
}: {
  email: string
  name?: string
  size?: number
  className?: string
}): JSX.Element {
  const avatars = useRepoStore((s) => s.settings.avatars)
  const key = (email || '').trim().toLowerCase()
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null)

  useEffect(() => {
    if (!key || !avatars) {
      setSrc(null)
      return
    }
    if (cache.has(key)) {
      setSrc(cache.get(key) ?? null)
      return
    }
    let alive = true
    void window.api.avatar.get(key).then((res) => {
      const uri = res.ok ? res.value : null
      cache.set(key, uri)
      if (alive) setSrc(uri)
    })
    return () => {
      alive = false
    }
  }, [key, avatars])

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`rounded shrink-0 object-cover ${className}`}
      />
    )
  }
  return <Identicon seed={email || name || '?'} size={size} className={className} />
}
