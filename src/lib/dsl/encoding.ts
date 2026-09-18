// What a string survives as, once it has been through the DSL.
//
// The serializer writes values into double-quoted DSL strings. Most characters
// make the trip byte-for-byte, but a backslash immediately before `n` or at the
// very end of a value has no representation Structurizr reads back unchanged,
// so the serializer drops it (see `escapeString`). Anything that needs to
// reason about the value the *real* parser will end up holding — the
// conformance corpus, the Structurizr validation pass — has to apply the same
// rule rather than looking at the raw string.

/** The value a string becomes after the serializer's unrepresentable-backslash
 *  rules: a backslash run before `n`, or at the end of the value, is dropped.
 *  Every other character survives Structurizr byte-for-byte. */
export function representable(s: string): string {
  return s.replace(/\\+(?=n)/g, '').replace(/\\+$/, '')
}

/** A tag after the serializer's comma stripping and backslash rules.
 *  Structurizr splits a tag string on commas, so an interior comma would
 *  silently become two tags; the serializer drops it instead. */
export function representableTag(t: string): string {
  return representable(t.replace(/,/g, ''))
}

/** The value a string comes back as after a full save/load round trip: the
 *  unrepresentable backslashes above are gone, and every carriage return has
 *  become a plain newline. The DSL has no `\r` escape, so `escapeString`
 *  writes CR, LF and CRLF alike as `\n`, which the parser reads back as a
 *  bare newline. */
export function roundTripped(s: string): string {
  return representable(s).replace(/\r\n|\r/g, '\n')
}

/** A tag after a full round trip: commas go first, then the rules above, and
 *  finally the trim. Structurizr splits a tag string on commas and trims each
 *  piece (`Parser.buildTags`), so ` beta ` is read back as `beta` and a tag of
 *  nothing but whitespace is read back as no tag at all. */
export function roundTrippedTag(t: string): string {
  return roundTripped(t.replace(/,/g, '')).trim()
}
