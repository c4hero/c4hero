// Structurizr-correct string/tag escaping.
//
// GROUND TRUTH (verified against the real Structurizr CLI v2025.11.09 -- do
// not re-derive it, encode it):
//   - `"A \"B\" C"` parses correctly -> value `A "B" C`. Backslash-escaping
//     a double quote IS supported.
//   - `"X:\\"` (doubled backslash) is BROKEN: the second backslash escapes
//     the closing quote and the string runs on, producing 'Too many tokens'
//     errors. Backslashes must therefore NEVER be doubled by the serializer.
//   - `"X:\"` (value ending in a single backslash) is BROKEN for the same
//     reason: the trailing backslash escapes the closing quote. A trailing
//     backslash is simply not representable, so it must be stripped.
//   - `"A\nB"` keeps the two literal characters backslash and n; Structurizr
//     does NOT unescape backslash-n or backslash-t. A real newline/tab/
//     control character inside a quoted string is not representable either
//     (a real newline is a hard parse error), so we collapse them to a
//     single space instead.
//   - Tag lists are comma-separated with no escape mechanism, so a comma
//     inside a tag always splits it into two tags -- commas must be removed
//     from tag values before they are emitted.

// Every C0 control character (U+0000-U+001F) plus U+007F (DEL). Built from
// character codes rather than regex hex escapes so the source stays plain
// ASCII text with no ambiguous escape sequences.
const CONTROL_CODES: number[] = []
for (let i = 0x00; i <= 0x1f; i++) CONTROL_CODES.push(i)
CONTROL_CODES.push(0x7f)
const CONTROL_CHARS = new Set(CONTROL_CODES.map(code => String.fromCharCode(code)))

/**
 * Replace every C0 control character and U+007F with a single space each.
 * Does not collapse or trim any other whitespace.
 */
function blankControlChars(value: string): string {
    let result = ''
    for (const ch of value) {
        result += CONTROL_CHARS.has(ch) ? ' ' : ch
    }
    return result
}

/** Strip a run of one or more trailing backslashes. */
function stripTrailingBackslashes(value: string): string {
    let end = value.length
    while (end > 0 && value[end - 1] === '\\') end--
    return value.slice(0, end)
}

/**
 * Escape a raw string value for embedding inside a double-quoted DSL string
 * literal, matching exactly what the real Structurizr parser accepts.
 *
 * Order matters:
 *   1. Replace every C0 control character (U+0000-U+001F) and U+007F (a
 *      real newline/tab/etc.) with a single space each -- these cannot be
 *      represented inside a quoted string at all (a literal newline is a
 *      hard parse error, and Structurizr does not unescape the two-char
 *      sequences backslash-n / backslash-t, so emitting them would just
 *      corrupt the value).
 *   2. Strip any run of trailing backslashes -- a value ending in a
 *      backslash cannot be represented because the backslash escapes the
 *      closing quote and corrupts tokenisation.
 *   3. Escape every double quote as backslash-quote. This is the ONLY
 *      backslash the serializer ever introduces; backslashes are never
 *      doubled.
 */
export function escapeDslString(value: string): string {
    const noControlChars = blankControlChars(value)
    const noTrailingBackslash = stripTrailingBackslashes(noControlChars)
    return noTrailingBackslash.split('"').join('\\"')
}

/**
 * Sanitize a tag value for emission inside a comma-separated tag list.
 * Tags have no escape mechanism at all in Structurizr DSL, so anything that
 * would corrupt the tag list (commas, control characters) is simply removed
 * rather than escaped.
 */
export function sanitizeTag(tag: string): string {
    const noControlChars = blankControlChars(tag)
    const noTrailingBackslash = stripTrailingBackslashes(noControlChars)
    return noTrailingBackslash.split(',').join(' ').trim()
}
