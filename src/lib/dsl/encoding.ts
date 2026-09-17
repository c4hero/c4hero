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
