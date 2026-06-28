// Extract Structurizr DSL from a model response. Models often wrap output in
// markdown code fences (```dsl … ``` or ``` … ```) and add a sentence of
// preamble; this pulls out the workspace block. Pure + unit-tested.

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
  // otherwise splice the preamble into the returned DSL.
  const decl = /\bworkspace\b\s*(?:"(?:[^"\\]|\\.)*"\s*)*\{/.exec(unfenced)
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
  let inString = false
  for (let i = openIdx; i < unfenced.length; i++) {
    const ch = unfenced[i]
    // Skip braces inside a quoted string literal (a name/description like
    // "the closing } symbol") — counting them would close the block early.
    if (inString) {
      if (ch === '"' && unfenced[i - 1] !== '\\') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
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
