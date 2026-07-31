import crypto from 'crypto'

// Resolve a commit author's avatar from Gravatar. Done in the MAIN process on
// purpose: the renderer's CSP blocks external images/network, so we fetch here
// and hand back a data: URI (which the CSP does allow). No avatar / offline →
// null, and the renderer falls back to a generated identicon.

// email(lowercased) -> data URI | null. Positive results and definitive "no
// avatar" (404) are cached; transient network errors are NOT, so they can retry.
const cache = new Map<string, string | null>()

export async function getAvatar(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase()
  if (!key) return null
  if (cache.has(key)) return cache.get(key) ?? null

  const hash = crypto.createHash('md5').update(key).digest('hex')
  // d=404 → Gravatar returns HTTP 404 when the address has no avatar set.
  const url = `https://www.gravatar.com/avatar/${hash}?d=404&s=80`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (res.status === 404) {
      cache.set(key, null)
      return null
    }
    if (!res.ok) return null // transient; don't cache so a later select retries
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    const uri = `data:${type};base64,${buf.toString('base64')}`
    cache.set(key, uri)
    return uri
  } catch {
    return null // offline / aborted — leave uncached for a future retry
  } finally {
    clearTimeout(timer)
  }
}
