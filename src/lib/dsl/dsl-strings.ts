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
//   - `"A\nB"` -- MEASURED against the real CLI, not assumed: real
//     Structurizr DOES unescape a backslash immediately followed by `n`
//     into an actual newline. `softwareSystem "A" "C:\new"` parses to a
//     value with char codes 67,58,10,101,119 -- i.e. `C:` + LF + `ew`, not
//     the four literal characters `\new`. By contrast `softwareSystem "B"
//     "C:\temp"` parses to char codes 67,58,92,116,... -- i.e. `C:\temp`
//     literal, backslash-t is NOT unescaped. So `\n` is special-cased and
//     `\t` is not. Since a real newline inside a quoted string is itself a
//     hard parse error (see above), and there is no escape for a literal
//     backslash in Structurizr DSL, a backslash run immediately before `n`
//     can never be emitted: it must be stripped down to the bare `n`
//     rather than passed through, or the real parser would silently turn
//     it into a newline and corrupt the value (this is the GH #109
//     Windows-path domain: `\new`, `\node_modules`, `\network`, `\nightly`
//     ...). Any OTHER control character (a real, literal newline/tab/etc,
//     as opposed to the two printable characters backslash+n) is collapsed
//     to a single space, same as before.
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
 * Strip the ENTIRE run of backslashes immediately preceding an `n`.
 *
 * Real Structurizr unescapes a lone backslash-n into a real newline
 * (measured, see GROUND TRUTH above), so `\n` cannot be emitted verbatim.
 * Stripping only the LAST backslash of a run is not enough: `\\n` (two
 * backslashes then `n`) would become `\n` (one backslash then `n`), which
 * is still a backslash immediately before `n` and still decodes to a
 * newline. The whole run has to go. There is no escape sequence for a
 * literal backslash in Structurizr DSL (see the `"X:\\"` case above), so a
 * literal backslash directly before `n` is simply not representable --
 * stripping it is the only correct option, exactly like the trailing-
 * backslash and control-character handling above.
 */
function stripBackslashRunsBeforeN(value: string): string {
    return value.replace(/\\+n/g, 'n')
}

/**
 * Escape a raw string value for embedding inside a double-quoted DSL string
 * literal, matching exactly what the real Structurizr parser accepts.
 *
 * Order matters:
 *   1. Replace every C0 control character (U+0000-U+001F) and U+007F (a
 *      real newline/tab/etc.) with a single space each -- these cannot be
 *      represented inside a quoted string at all (a literal newline is a
 *      hard parse error).
 *   2. Strip the entire run of backslashes immediately before any `n` --
 *      real Structurizr unescapes backslash-n into a real newline (see
 *      GROUND TRUTH above), so the two printable characters backslash+n
 *      would silently corrupt the value into backslash-less text plus a
 *      newline if passed through. Backslash-t is left untouched: it is
 *      NOT unescaped by real Structurizr and survives as two literal
 *      characters.
 *   3. Strip any run of trailing backslashes -- a value ending in a
 *      backslash cannot be represented because the backslash escapes the
 *      closing quote and corrupts tokenisation.
 *   4. Escape every double quote as backslash-quote. This is the ONLY
 *      backslash the serializer ever introduces; backslashes are never
 *      doubled.
 */
export function escapeDslString(value: string): string {
    const noControlChars = blankControlChars(value)
    const noBackslashBeforeN = stripBackslashRunsBeforeN(noControlChars)
    const noTrailingBackslash = stripTrailingBackslashes(noBackslashBeforeN)
    return noTrailingBackslash.split('"').join('\\"')
}

/**
 * Sanitize a tag value for emission inside a comma-separated tag list.
 * Tags have no escape mechanism at all in Structurizr DSL, so anything that
 * would corrupt the tag list (commas, control characters) is simply removed
 * rather than escaped. Same backslash-before-n stripping as
 * escapeDslString() above (real Structurizr unescapes backslash-n to a
 * newline; a tag containing one would otherwise silently corrupt the tag
 * list with an embedded newline).
 */
export function sanitizeTag(tag: string): string {
    const noControlChars = blankControlChars(tag)
    const noBackslashBeforeN = stripBackslashRunsBeforeN(noControlChars)
    const noTrailingBackslash = stripTrailingBackslashes(noBackslashBeforeN)
    return noTrailingBackslash.split(',').join(' ').trim()
}
