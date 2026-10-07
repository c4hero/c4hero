/** Sanitize a filename by removing path separators and dangerous characters. */
/** Device names Windows refuses as a file stem, with or without an extension. */
export const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

export function sanitizeFilename(name: string): string {
  const illegalChars = new Set('/\\:*?"<>|')
  const safeChars = Array.from(name.trim(), (char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127 || illegalChars.has(char) ? '_' : char
  }).join('')
  const withoutLeadingDots = safeChars.replace(/^\.+/, '_')
  // Scan the suffix once: an unanchored greedy regex can retry a long run
  // of dots/spaces at every position when a non-matching character follows.
  let end = withoutLeadingDots.length
  while (end > 0 && (withoutLeadingDots[end - 1] === '.' || withoutLeadingDots[end - 1] === ' ')) {
    end -= 1
  }
  const cleaned = withoutLeadingDots.slice(0, end).slice(0, 180)

  if (!cleaned || cleaned === '_') return 'download'
  if (WINDOWS_RESERVED_NAME.test(cleaned)) {
    return `_${cleaned}`
  }
  return cleaned
}

export function safeSuggestedDslName(suggestedName?: string): string {
  const sanitized = sanitizeFilename(suggestedName ?? 'workspace.dsl')
  if (sanitized === 'download') return 'workspace.dsl'
  return /\.dsl$/i.test(sanitized) ? sanitized : `${sanitized}.dsl`
}
