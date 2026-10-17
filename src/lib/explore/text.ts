/** Word-wrap with character fallback for long identifiers/URLs. */
export function wrapText(text: string, width: number, measure: (value: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (measure(next) <= width) { line = next; continue }
    if (line) { lines.push(line); line = '' }
    for (const char of word) {
      if (line && measure(line + char) > width) { lines.push(line); line = '' }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines
}

export function textInset(person: boolean, height: number, scale: number) {
  if (!person) return 14 * scale
  const radius = height / 2, insetY = Math.min(radius, 12 * scale)
  return Math.max(14 * scale, radius - Math.sqrt(radius * radius - (radius - insetY) ** 2) + 8 * scale)
}

/** Fit in node-local coordinates, independent of camera zoom and reveal. */
export function descriptionLayout(text: string, width: number, height: number, person: boolean, measure: (text: string) => number) {
  let scale = 1
  const linesAt = (s: number) => wrapText(text, (width - 2 * textInset(person, height, s)) / s, measure)
  while (scale > .55) {
    if (69 + (linesAt(scale).length - 1) * 16.8 <= height / scale - 28) break
    scale = Math.max(.55, scale * .92)
  }
  const lines = linesAt(scale)
  const count = Math.max(0, Math.floor((height / scale - 28 - 69) / 16.8) + 1)
  if (lines.length > count && count > 0) {
    let last = lines[count - 1]
    const available = (width - 2 * textInset(person, height, scale)) / scale
    while (last && measure(last + '…') > available) last = last.slice(0, -1)
    lines[count - 1] = last + '…'
  }
  return { scale, lines: lines.slice(0, count) }
}
