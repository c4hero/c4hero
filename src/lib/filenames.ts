/** Sanitize a filename by removing path separators and dangerous characters. */
export function sanitizeFilename(name: string): string {
  const illegalChars = new Set('/\\:*?"<>|')
  const safeChars = Array.from(name.trim(), (char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127 || illegalChars.has(char) ? '_' : char
  }).join('')
  const cleaned = safeChars
    .replace(/^\.+/, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 180)

  if (!cleaned || cleaned === '_') return 'download'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(cleaned)) {
    return `_${cleaned}`
  }
  return cleaned
}

export function safeSuggestedDslName(suggestedName?: string): string {
  const sanitized = sanitizeFilename(suggestedName ?? 'workspace.dsl')
  if (sanitized === 'download') return 'workspace.dsl'
  return /\.dsl$/i.test(sanitized) ? sanitized : `${sanitized}.dsl`
}
