/**
 * Block-level markdown parser for documentation and ADRs — the structure
 * half of the renderer in `components/docs/Markdown.tsx`, kept here so it is
 * a pure function with its own tests. See that file for what is supported
 * and why the subset is hand-rolled.
 */

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; text: string; lang?: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; items: Block[][] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'hr' }

const FENCE = /^\s*(```+|~~~+)\s*([\w-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }

    const fence = FENCE.exec(line)
    if (fence) {
      const close = fence[1][0]
      const buf: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^\\s*${close === '`' ? '`{3,}' : '~{3,}'}\\s*$`).test(lines[i])) buf.push(lines[i++])
      i++ // closing fence (or EOF)
      blocks.push({ kind: 'code', text: buf.join('\n'), lang: fence[2] || undefined })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) { blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] }); i++; continue }

    if (HR.test(line)) { blocks.push({ kind: 'hr' }); i++; continue }

    if (/^\s{0,3}>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ''))
      blocks.push({ kind: 'quote', blocks: parseBlocks(buf) })
      continue
    }

    if (LIST_ITEM.test(line)) {
      const { list, next } = parseList(lines, i)
      blocks.push(list)
      i = next
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') rows.push(splitRow(lines[i++]))
      blocks.push({ kind: 'table', header, rows })
      continue
    }

    if (/^ {4}|^\t/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && (/^ {4}|^\t/.test(lines[i]) || lines[i].trim() === '')) buf.push(lines[i++].replace(/^ {4}|^\t/, ''))
      while (buf.length && buf[buf.length - 1].trim() === '') buf.pop()
      blocks.push({ kind: 'code', text: buf.join('\n') })
      continue
    }

    const buf: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !HEADING.test(lines[i]) && !FENCE.test(lines[i]) && !LIST_ITEM.test(lines[i]) && !/^\s{0,3}>/.test(lines[i]) && !HR.test(lines[i])) {
      buf.push(lines[i++].trim())
    }
    blocks.push({ kind: 'paragraph', text: buf.join(' ') })
  }
  return blocks
}

function parseList(lines: string[], start: number): { list: Block & { kind: 'list' }; next: number } {
  const first = LIST_ITEM.exec(lines[start])!
  const indent = first[1].length
  const ordered = /\d/.test(first[2])
  const items: Block[][] = []
  let i = start
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i])
    // A marker of the other kind at this indent starts a new list.
    if (m && m[1].length === indent && /\d/.test(m[2]) !== ordered) break
    if (!m || m[1].length !== indent) {
      // A deeper-indented line continues the current item.
      if (m && m[1].length > indent && items.length) {
        const { list, next } = parseList(lines, i)
        items[items.length - 1].push(list)
        i = next
        continue
      }
      if (lines[i].trim() === '' && i + 1 < lines.length) {
        const next = LIST_ITEM.exec(lines[i + 1])
        if (next && next[1].length >= indent && (next[1].length > indent || /\d/.test(next[2]) === ordered)) { i++; continue }
      }
      if (!m && lines[i].trim() !== '' && /^\s+/.test(lines[i]) && items.length) {
        // Lazy continuation of the item's paragraph.
        const last = items[items.length - 1]
        const para = last[last.length - 1]
        if (para?.kind === 'paragraph') para.text += ` ${lines[i].trim()}`
        i++
        continue
      }
      break
    }
    items.push([{ kind: 'paragraph', text: m[3] }])
    i++
  }
  return { list: { kind: 'list', ordered, items }, next: i }
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

