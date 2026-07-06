// Minimal markdown block grammar for AI answers — parsing only, kept apart
// from the React renderers (markdown.tsx) so it stays unit-testable and the
// component file remains fast-refresh friendly.

export type MdBlock =
  | { t: 'p'; lines: string[] }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'h'; level: number; text: string }
  | { t: 'code'; lines: string[] }

export function parseBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  const lines = text.split('\n')
  let i = 0
  const isBlockStart = (l: string) => /^\s*([-*•]\s|\d+[.)]\s|#{1,4}\s|```)/.test(l)
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++ }
      i++ // closing fence (or EOF while streaming)
      blocks.push({ t: 'code', lines: code })
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { blocks.push({ t: 'h', level: h[1].length, text: h[2] }); i++; continue }
    const bullet = (l: string) => l.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet(line)) {
      const items: string[] = []
      while (i < lines.length) { const m = bullet(lines[i]); if (!m) break; items.push(m[1]); i++ }
      blocks.push({ t: 'ul', items })
      continue
    }
    const num = (l: string) => l.match(/^\s*\d+[.)]\s+(.*)$/)
    if (num(line)) {
      const items: string[] = []
      while (i < lines.length) { const m = num(lines[i]); if (!m) break; items.push(m[1]); i++ }
      blocks.push({ t: 'ol', items })
      continue
    }
    // Paragraph: consecutive plain lines (soft-wrapped with <br> when rendered).
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i]); i++ }
    blocks.push({ t: 'p', lines: para })
  }
  return blocks
}
