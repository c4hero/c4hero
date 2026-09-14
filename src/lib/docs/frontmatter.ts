/**
 * YAML frontmatter, the small subset knowledge bundles actually use.
 *
 * Parsing is deliberately permissive — the OKF spec requires consumers to
 * accept unknown keys and odd formatting, and Structurizr-authored docs have
 * no frontmatter at all. Scalars, quoted scalars and inline lists come back
 * as strings / string arrays; anything else (block maps, block lists) is
 * skipped rather than rejected. Serialization always double-quotes so any
 * title round-trips.
 */

export type FrontmatterValue = string | string[]
export type Frontmatter = Record<string, FrontmatterValue>

export interface ParsedDocument {
  /** Empty when the file has no frontmatter block. */
  frontmatter: Frontmatter
  /** True when a `---` block was present, even if it held nothing usable. */
  hasFrontmatter: boolean
  /** The markdown after the block (or the whole text when there is none). */
  body: string
}

// The block may be empty (`---\n---`), and a BOM must not hide it.
const BLOCK = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

export function parseFrontmatter(text: string): ParsedDocument {
  const match = BLOCK.exec(text)
  if (!match) return { frontmatter: {}, hasFrontmatter: false, body: text }
  const frontmatter: Frontmatter = {}
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    // Block content (indented) belongs to the previous key; we don't model it.
    if (/^\s/.test(line) || line.trim() === '' || line.trimStart().startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    const raw = line.slice(colon + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || raw === '') continue
    frontmatter[key] = raw.startsWith('[') && raw.endsWith(']') ? parseInlineList(raw) : parseScalar(raw)
  }
  return { frontmatter, hasFrontmatter: true, body: text.slice(match[0].length) }
}

function parseInlineList(raw: string): string[] {
  const inner = raw.slice(1, -1).trim()
  if (!inner) return []
  // Split on commas outside quotes.
  const items: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of inner) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ',') {
      items.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  items.push(cur)
  return items.map((s) => parseScalar(s.trim())).filter((s) => s !== '')
}

function parseScalar(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string
    } catch {
      return raw.slice(1, -1)
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'")
  // A trailing YAML comment on a bare scalar.
  return raw.replace(/\s+#.*$/, '')
}

/** Render a frontmatter block. Undefined and empty values are omitted. */
export function serializeFrontmatter(fields: Record<string, FrontmatterValue | undefined>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) lines.push(`${key}: [${value.map(quote).join(', ')}]`)
    } else {
      lines.push(`${key}: ${quote(value)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

/** JSON string syntax is a subset of YAML's double-quoted scalar. */
function quote(value: string): string {
  return JSON.stringify(value)
}

export function firstString(value: FrontmatterValue | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

export function asList(value: FrontmatterValue | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}
