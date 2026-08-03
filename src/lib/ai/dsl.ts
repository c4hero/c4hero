// Extract Structurizr DSL from a model response. Models often wrap output in
// markdown code fences (```dsl … ``` or ``` … ```) and add a sentence of
// preamble; this pulls out the workspace block. Pure + unit-tested.

import { scanQuotedString } from '@/lib/dsl/lexer'

/** Strip a single surrounding markdown code fence, if present. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fence = /^```[^\n]*\n([\s\S]*?)\n?```$/
  const match = fence.exec(trimmed)
  if (match) return match[1].trim()
  return trimmed
}

/** Pull the `workspace { … }` block out of a response, tolerating preamble,
 *  code fences, and trailing prose. Returns the trimmed DSL, or the
 *  fence-stripped text if no explicit workspace block is found. */
export function extractDsl(text: string): string {
  const unfenced = stripCodeFence(text)

  // Anchor on the actual `workspace [ "name" [ "desc" ] ] {` declaration, not a
  // stray mention of the word in prose ("Here is your workspace:") which would
  // otherwise splice the preamble into the returned DSL. The string pattern
  // encodes the lexer's consume-one rule deterministically: a backslash
  // before a quote is ONLY consumable as the `\"` pair (the lookahead keeps
  // backtracking from reinterpreting it as a lone char), any other backslash
  // is a lone literal, so the anchor agrees with the parser about where the
  // name/description strings end.
  const decl = /\bworkspace\b\s*(?:"(?:\\"|\\(?!")|[^"\\])*"\s*)*\{/.exec(unfenced)
  if (!decl) {
    // No real block — fall back to the first bare mention so the parser can
    // report a precise error, or return everything when there's none.
    const bare = unfenced.search(/\bworkspace\b/)
    return bare === -1 ? unfenced : unfenced.slice(bare).trim()
  }
  const start = decl.index
  // The matched declaration ends at its opening brace.
  const openIdx = start + decl[0].length - 1

  let depth = 0
  for (let i = openIdx; i < unfenced.length; i++) {
    const ch = unfenced[i]
    // Skip string literals wholesale (a name/description like "the closing }
    // symbol") — counting their braces would close the block early.
    // scanQuotedString implements the lexer's consume-one escape rule, so
    // this scanner and the parser always agree about where a string ends.
    if (ch === '"') { i = scanQuotedString(unfenced, i) - 1; continue }
    // Skip Structurizr DSL comments — a brace inside one must not be counted.
    if (ch === '/' && unfenced[i + 1] === '/') { const nl = unfenced.indexOf('\n', i); if (nl === -1) break; i = nl; continue }
    // `#` opens a comment anywhere on a line unless it starts a hex color
    // like #ffffff — the same disambiguation the lexer uses.
    if (ch === '#' && !/[0-9a-fA-F]/.test(unfenced[i + 1] ?? '')) { const nl = unfenced.indexOf('\n', i); if (nl === -1) break; i = nl; continue }
    if (ch === '/' && unfenced[i + 1] === '*') { const end = unfenced.indexOf('*/', i + 2); if (end === -1) break; i = end + 1; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return unfenced.slice(start, i + 1).trim()
      }
    }
  }
  // Unbalanced — return from `workspace` onward and let the parser report errors.
  return unfenced.slice(start).trim()
}
