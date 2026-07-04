// Tolerant, incremental extraction of objects from a JSON array as its enclosing
// text streams in. Used to surface streamed review findings one-by-one instead of
// waiting for the whole `{ "findings": [ ... ] }` payload to arrive and parse.

/**
 * Returns a stateful `feed` function. Call it with the FULL accumulated text each
 * time more arrives; it returns any array elements under `key` that have fully
 * closed since the last call, each run through `JSON.parse`.
 *
 * Tolerant of: leading prose / a ```json code fence before the object, whitespace
 * and commas between elements, braces/brackets inside strings (with escapes), and
 * a still-incomplete trailing element. Elements that don't parse are skipped. Once
 * the array's closing `]` is seen the parser is done and returns nothing further.
 */
export function createArrayStreamParser(key: string): (text: string) => unknown[] {
  const needle = `"${key}"`
  let arrStart = -1   // index just past the array's opening '['
  let i = 0           // resume position (text only ever grows, so this stays valid)
  let depth = 0       // brace depth within the array (0 = between elements)
  let inStr = false
  let esc = false
  let objStart = -1   // start of the object currently being scanned
  let closed = false

  return function feed(text: string): unknown[] {
    const out: unknown[] = []
    if (closed) return out
    if (arrStart < 0) {
      const k = text.indexOf(needle)
      if (k < 0) return out
      const br = text.indexOf('[', k + needle.length)
      if (br < 0) return out
      arrStart = br + 1
      i = arrStart
    }
    for (; i < text.length; i++) {
      const c = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '{') { if (depth === 0) objStart = i; depth++; continue }
      if (c === '}') {
        if (depth > 0) depth--
        if (depth === 0 && objStart >= 0) {
          const slice = text.slice(objStart, i + 1)
          objStart = -1
          try { out.push(JSON.parse(slice)) } catch { /* skip a malformed element */ }
        }
        continue
      }
      // Only the array's own closing bracket lives at depth 0; nested ] inside an
      // object are at depth > 0 and fall through, ignored.
      if (c === ']' && depth === 0) { closed = true; i++; break }
    }
    return out
  }
}
