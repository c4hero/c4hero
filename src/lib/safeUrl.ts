export function normalizeSafeExternalUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  try {
    const parsed = value.startsWith('//')
      ? new URL(`https:${value}`)
      : new URL(value)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}
