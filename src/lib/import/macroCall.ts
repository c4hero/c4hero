// Line-oriented tokenizer for the C4-PlantUML macro syntax that Mermaid's C4
// diagrams deliberately mirror: `Name(arg, "quoted arg", $key=value) {`.
//
// This is not a PlantUML grammar. It recognises one macro call per line,
// block open/close braces, and the handful of bare directives both importers
// care about; everything else is reported to the caller as an "other" line
// so it can warn with a line number instead of dropping it silently.

export interface MacroCall {
  kind: 'call'
  line: number
  name: string
  /** Positional args, quotes stripped, in order. */
  positional: string[]
  /** `$key=value` args, quotes stripped, keys without the `$`. */
  named: Record<string, string>
  /** The line ended with `{` — a block follows. */
  opensBlock: boolean
}

export interface BlockClose { kind: 'close'; line: number }
export interface BareLine { kind: 'bare'; line: number; text: string }
export type MacroLine = MacroCall | BlockClose | BareLine

const CALL = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(\{)?\s*$/

/** Split a macro argument list on top-level commas, respecting quotes and
 *  nested parentheses. `"a, b", c(d, e)` → ['"a, b"', 'c(d, e)']. */
export function splitArgs(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      cur += ch
      if (ch === '\\' && i + 1 < text.length) { cur += text[++i]; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim() !== '' || out.length > 0) out.push(cur)
  return out.map((a) => a.trim())
}

/** Strip one layer of matching quotes and decode the escapes PlantUML and
 *  Mermaid both accept inside them (`\"`, `\n`). */
export function unquote(raw: string): string {
  const t = raw.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).replace(/\\n/g, '\n').replace(/\\(["'\\])/g, '$1')
  }
  return t
}

/** Tokenise every line. Comments (`'` in PlantUML, `%%` in Mermaid, `//`)
 *  and blank lines are dropped. */
export function tokenizeMacroLines(content: string): MacroLine[] {
  const out: MacroLine[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i]
    const text = raw.trim()
    if (text === '' || text.startsWith("'") || text.startsWith('%%') || text.startsWith('//')) continue
    if (text === '}') { out.push({ kind: 'close', line: lineNo }); continue }
    const m = text.match(CALL)
    if (m) {
      const positional: string[] = []
      const named: Record<string, string> = {}
      for (const arg of splitArgs(m[2])) {
        const nm = arg.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/)
        if (nm) named[nm[1]] = unquote(nm[2])
        else positional.push(unquote(arg))
      }
      out.push({ kind: 'call', line: lineNo, name: m[1], positional, named, opensBlock: m[3] === '{' })
      continue
    }
    out.push({ kind: 'bare', line: lineNo, text })
  }
  return out
}

/** Resolve a macro's arguments by the documented positional order, letting
 *  `$name=` forms override. Missing args are `undefined`; empty strings are
 *  kept as `undefined` too, since both tools treat `""` as "not given". */
export function args(call: MacroCall, order: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  order.forEach((key, i) => {
    const v = call.named[key] ?? call.positional[i]
    out[key] = v === undefined || v === '' ? undefined : v
  })
  return out
}
