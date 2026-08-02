/**
 * Decodes escapeDslString() output under the real Structurizr quoted-string
 * rules (GROUND TRUTH block at the top of dsl-strings.ts -- do not
 * re-litigate it, encode it):
 *   - `\"` decodes to a literal quote
 *   - any other backslash (including `\n`, `\t` and a doubled `\\`) decodes
 *     to itself, literally -- it is never an escape. In particular
 *     Structurizr does NOT unescape backslash-n or backslash-t; a real
 *     newline inside a quoted string is a hard parse error, which is a
 *     separate concern from the two printable characters backslash + `n`.
 *
 * NOTE: an earlier version of this file (and of dsl-strings.ts) assumed
 * Structurizr unescapes backslash-n to a real newline and had
 * escapeDslString() strip backslash runs before `n` accordingly. That
 * assumption contradicted the measured GROUND TRUTH and has been reverted;
 * this file now asserts the corrected behaviour: escapeDslString() never
 * alters a backslash run adjacent to `n`, exactly like it never alters one
 * adjacent to `t`.
 *
 * This decoder is a small, independent implementation (not a call into
 * dsl-strings.ts) so this test is a genuine cross-check of what the
 * serializer emits against what the real parser would read back, the same
 * spirit as strict-structurizr-tokenizer.test.ts and the decoder in
 * conformance-emit.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { escapeDslString } from './dsl-strings'

const BACKSLASH = String.fromCharCode(92)

/**
 * Decode the inner text of a single Structurizr quoted string literal
 * (the caller passes just the text between the quotes, not the quotes
 * themselves) using the real Structurizr rules.
 */
function decodeStructurizrQuotedText(inner: string): string {
    let out = ''
    let i = 0
    const n = inner.length
    while (i < n) {
        const ch = inner[i]
        if (ch === '\\' && inner[i + 1] === '"') {
            out += '"'
            i += 2
            continue
        }
        // Any other backslash -- including one immediately followed by `n`,
        // by `t`, by another backslash, or by end-of-input -- is a literal
        // backslash character, not an escape.
        out += ch
        i++
    }
    return out
}

describe('decoding escapeDslString() output under real Structurizr rules', () => {
    it('a value containing backslash-n: both characters survive emission and decoding unchanged', () => {
        // Raw user value: "C:" + backslash + "new" -- a Windows path whose
        // remainder happens to start with the letter n. Structurizr does
        // NOT unescape backslash-n (see GROUND TRUTH), so this needs no
        // sanitisation: the value round-trips exactly as written.
        const raw = 'C:' + BACKSLASH + 'new'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(raw)
        expect(decoded).not.toContain('\n')
    })

    it('a value containing backslash-t: stays a literal two-char sequence end to end', () => {
        // Structurizr does NOT unescape backslash-t either, so the raw
        // value survives emission and decoding completely unchanged --
        // identical treatment to the backslash-n case above.
        const raw = 'C:' + BACKSLASH + 'temp'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(raw)
    })

    it('a value containing a doubled backslash (not adjacent to "n"): both backslashes survive as literals', () => {
        // "\\" is not an escape in real Structurizr, so a value with two
        // literal backslash characters must round-trip as two literal
        // backslash characters, never halved and never doubled further.
        const raw = 'X:' + BACKSLASH + BACKSLASH + 'Data'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(raw)
    })

    it('a doubled backslash immediately before "n": both backslashes survive, no run is stripped', () => {
        // Unlike the (reverted) sanitisation assumption, escapeDslString()
        // does not touch backslash runs adjacent to `n` at all -- the run
        // passes through verbatim, same as any other backslash run.
        const raw = 'X' + BACKSLASH + BACKSLASH + 'notes'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(raw)
        expect(decoded).not.toContain('\n')
    })

    it('a value combining backslash-n, backslash-t and a doubled backslash decodes unchanged', () => {
        const raw = 'Path' + BACKSLASH + 'nnext' + BACKSLASH + 'temp' + BACKSLASH + BACKSLASH + 'end'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(raw)
        expect(decoded).not.toContain('\n')
    })
})
