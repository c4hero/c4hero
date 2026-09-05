// Element identifier rules (TEA-242): IDs double as Structurizr DSL variable
// names, so they must be valid identifiers from the moment they exist — the
// serializer emits them verbatim and the parser takes them back verbatim (see
// src/store/internals.ts for the roundtrip constraints).

/** Survives the serializer's sanitize pass untouched: letters/digits/underscores,
 *  no leading digit (the serializer would prepend `e`, changing the ID). */
export const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Structurizr DSL keywords that can start a statement where element
 *  declarations live. An element identifier shadowing one of these would make
 *  the exported `<id> = ...` / `<id> -> ...` lines ambiguous to parsers that
 *  dispatch on the first token. Matched case-insensitively (the DSL is). */
const RESERVED_IDENTIFIERS = new Set([
  'workspace', 'model', 'views', 'group', 'person', 'softwaresystem',
  'container', 'component', 'deploymentenvironment', 'deploymentnode',
  'infrastructurenode', 'containerinstance', 'softwaresysteminstance',
  'description', 'technology', 'tags', 'url', 'properties', 'this',
])

export function isReservedIdentifier(id: string): boolean {
  return RESERVED_IDENTIFIERS.has(id.toLowerCase())
}

/** Validate a user-entered element ID. Returns an error message, or null when
 *  valid. `isTaken` decides uniqueness (the caller excludes the element's own
 *  current ID). */
export function validateElementId(id: string, isTaken: (id: string) => boolean): string | null {
  if (!id) return 'ID is required'
  if (!IDENTIFIER_PATTERN.test(id)) {
    return 'Only letters, digits and underscores, not starting with a digit'
  }
  if (isReservedIdentifier(id)) return `"${id}" is a DSL keyword`
  if (isTaken(id)) return 'This ID is already in use'
  return null
}

/** Derive a camelCase identifier from a display name:
 *  "Payment Service" → paymentService, "API Gateway 2" → apiGateway2.
 *  Diacritics are stripped, everything else non-alphanumeric splits words. */
export function deriveIdFromName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  let id = words
    .map((w, i) => {
      const lower = /^[A-Z0-9]+$/.test(w) ? w.toLowerCase() : w.charAt(0).toLowerCase() + w.slice(1)
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
  if (!id) return 'element'
  if (/^[0-9]/.test(id)) id = `e${id}`
  if (isReservedIdentifier(id)) id = `${id}_`
  return id
}

/** First of `base`, `base2`, `base3`, … that isn't taken. */
export function uniqueDerivedId(base: string, isTaken: (id: string) => boolean): string {
  if (!isTaken(base)) return base
  let n = 2
  while (isTaken(`${base}${n}`)) n++
  return `${base}${n}`
}
