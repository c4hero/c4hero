export function normalizeRemoteLogEndpoint(raw: string | undefined, baseHref = window.location.href): string | null {
  const value = raw?.trim()
  if (!value) return null

  try {
    const base = new URL(baseHref)
    const endpoint = new URL(value, base)
    const isSameOrigin = endpoint.origin === base.origin
    if (endpoint.protocol !== 'https:' && !isSameOrigin) return null
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') return null
    return endpoint.toString()
  } catch {
    return null
  }
}
