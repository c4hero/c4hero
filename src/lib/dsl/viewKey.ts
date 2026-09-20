// View-key conformance (TEA-166).
//
// Structurizr restricts view keys to `a-zA-Z0-9_-`. A key outside that set
// produces DSL the real parser rejects outright:
//
//   View keys can only contain the following characters: a-zA-Z0-9_-
//     at line 814: systemContext sys1 "Label 602" {
//
// c4hero normalizes at the *import* boundary rather than at export: the
// stored key and the emitted key stay identical, so the sidecar (which keys
// layout data by view key), key dedup and the serializer all keep agreeing,
// while the model can never hold a key Structurizr would reject. The rewrite
// is reported as a parse warning, never applied silently.

/** The exact character class Structurizr accepts in a view key. */
export const VIEW_KEY_PATTERN = /^[A-Za-z0-9_-]+$/

/** True when `key` is a view key the real Structurizr parser accepts. */
export function isConformantViewKey(key: string): boolean {
  return VIEW_KEY_PATTERN.test(key)
}

/** Fold a raw key down to Structurizr's character class: every run of illegal
 *  characters becomes a single `-`, and leading/trailing dashes are trimmed so
 *  `"Label 602"` reads as `Label-602` rather than `Label-602-`. A key with no
 *  legal characters at all normalizes to `''`, which callers treat as "no key
 *  given" and replace with a derived one. */
export function sanitizeViewKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}
