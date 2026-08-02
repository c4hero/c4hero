/**
 * Decodes escapeDslString() output under the CORRECTED Structurizr quoted-
 * string rules (measured against the pinned CLI v2025.11.09; see the
 * GROUND TRUTH block at the top of dsl-strings.ts):
 *   - `\"` decodes to a literal quote
 *   - `\n` decodes to a real newline -- Structurizr DOES unescape this
 *   - any other backslash (including `\t` and a doubled `\\`) decodes to
 *     itself, literally -- it is never an escape
 *
 * This decoder is a small, independent implementation (not a call into
 * dsl-strings.ts) so this test is a genuine cross-check of what the
 * serializer emits against what the real parser would read back, the same
 * spirit as strict-structurizr-tokenizer.test.ts and the decoder in
 * conformance-emit.test.ts. Its job here is narrower: prove that for values
 * containing backslash-n, backslash-t and a doubled backslash, decoding the
 * serializer's actual output reproduces exactly the sanitised value c4hero
 * intends -- and, in particular, that decoding NEVER yields a real newline,
 * which would mean a backslash-n sequence leaked into the output unstripped.
 */
import { describe, it, expect } from 'vitest'
import { escapeDslString } from './dsl-strings'

const BACKSLASH = String.fromCharCode(92)

/**
 * Decode the inner text of a single Structurizr quoted string literal
 * (the caller passes just the text between the quotes, not the quotes
 * themselves) using the corrected real-Structurizr rules.
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
        if (ch === '\\' && inner[i + 1] === 'n') {
            out += '\n'
            i += 2
            continue
        }
        // Any other backslash -- including one immediately followed by `t`,
        // by another backslash, or by end-of-input -- is a literal
        // backslash character, not an escape.
        out += ch
        i++
    }
    return out
}

describe('decoding escapeDslString() output under corrected Structurizr rules', () => {
    it('a value containing backslash-n: the backslash is sanitised away before emission, so decode is a no-op', () => {
        // Raw user value: "C:" + backslash + "new" -- exactly the GH-165
        // failure shape (a Windows path whose remainder happens to start
        // with the letter n). If the serializer emitted this verbatim, the
        // real parser would unescape backslash-n into a newline and split
        // the value in two. escapeDslString() must sanitise the backslash
        // away first, so what actually reaches the wire never contains the
        // dangerous two-char sequence in the first place.
        const raw = 'C:' + BACKSLASH + 'new'
        const sanitized = 'C:new'

        const emitted = escapeDslString(raw)
        expect(emitted).not.toContain(BACKSLASH + 'n')

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(sanitized)
        expect(decoded).not.toContain('\n')
    })

    it('a value containing backslash-t: stays a literal two-char sequence end to end', () => {
        // Structurizr does NOT unescape backslash-t, so unlike backslash-n
        // this needs no sanitisation: the raw value survives emission and
        // decoding completely unchanged.
        const raw = 'C:' + BACKSLASH + 'temp'
        const sanitized = raw

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(sanitized)
    })

    it('a value containing a doubled backslash (not adjacent to "n"): both backslashes survive as literals', () => {
        // "\\" is not an escape in real Structurizr, so a value with two
        // literal backslash characters must round-trip as two literal
        // backslash characters, never halved and never doubled further.
        const raw = 'X:' + BACKSLASH + BACKSLASH + 'Data'
        const sanitized = raw

        const emitted = escapeDslString(raw)
        expect(emitted).toBe(raw)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(sanitized)
    })

    it('a doubled backslash immediately before "n": the whole run is stripped, not just its last backslash', () => {
        // If only the backslash nearest `n` were removed, the remaining
        // backslash would become newly adjacent to `n` and still decode to
        // a newline. The entire run has to go.
        const raw = 'X' + BACKSLASH + BACKSLASH + 'notes'
        const sanitized = 'Xnotes'

        const emitted = escapeDslString(raw)
        expect(emitted).not.toContain(BACKSLASH + 'n')

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(sanitized)
        expect(decoded).not.toContain('\n')
    })

    it('a value combining all three shapes in one string decodes to the fully sanitised value', () => {
        const raw = 'Path' + BACKSLASH + 'nnext' + BACKSLASH + 'temp' + BACKSLASH + BACKSLASH + 'end'
        // - `\nnext` -> the leading backslash of the run right before `n`
        //   is stripped: "nnext"
        // - `\temp` -> backslash-t is not sanitised: stays literal
        // - `\\end` -> doubled backslash, not adjacent to `n`: stays literal
        const sanitized = 'Path' + 'nnext' + BACKSLASH + 'temp' + BACKSLASH + BACKSLASH + 'end'

        const emitted = escapeDslString(raw)
        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(sanitized)
        expect(decoded).not.toContain('\n')
    })
})
