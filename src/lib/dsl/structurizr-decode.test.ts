/**
 * Decodes escapeDslString() output under the real Structurizr quoted-string
 * rules (GROUND TRUTH block at the top of dsl-strings.ts -- do not
 * re-litigate it, encode it):
 *   - `\"` decodes to a literal quote
 *   - a backslash immediately followed by `n` decodes to a real newline --
 *     MEASURED against the real CLI: `softwareSystem "A" "C:\new"` parses to
 *     char codes 67,58,10,101,119 (`C:` + LF + `ew`), not the four literal
 *     characters `\new`.
 *   - any OTHER backslash (including one before `t`, or a second backslash
 *     that only ever gets there because the first one wasn't `\"`/`\n`)
 *     decodes to itself, literally. In particular Structurizr does NOT
 *     unescape backslash-t: `softwareSystem "B" "C:\temp"` parses to char
 *     codes 67,58,92,116,... (`C:\temp` literal).
 *
 * Because real Structurizr unescapes `\n`, escapeDslString() must never emit
 * a backslash immediately before `n` -- it strips the whole backslash run
 * instead (see dsl-strings.ts). So for every value round-tripped through
 * escapeDslString() in this file, decoding never actually observes a `\n`
 * sequence: the assertions below prove BOTH halves independently -- that
 * escapeDslString() sanitises backslash-before-n away, AND that if it ever
 * didn't, this decoder (modelling the real parser) would turn it into a
 * newline, which is exactly the corruption the sanitisation exists to
 * prevent.
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
        // MEASURED: real Structurizr unescapes a lone backslash-n into a
        // real newline character (see file header). This is the ONLY
        // two-char backslash sequence, besides `\"`, that decodes to
        // anything other than itself.
        if (ch === '\\' && inner[i + 1] === 'n') {
            out += '\n'
            i += 2
            continue
        }
        // Any other backslash -- including one immediately followed by
        // `t`, by another backslash, or by end-of-input -- is a literal
        // backslash character, not an escape.
        out += ch
        i++
    }
    return out
}

describe('decoding escapeDslString() output under real Structurizr rules', () => {
    it('a value containing backslash-n: the backslash is stripped before emission, so decoding sees a bare "n", not a newline', () => {
        // Raw user value: "C:" + backslash + "new" -- a Windows path whose
        // remainder happens to start with the letter n (the exact GH #109
        // repro). Structurizr DOES unescape backslash-n into a newline (see
        // GROUND TRUTH), so escapeDslString() must strip the backslash
        // before emission -- otherwise the real CLI would silently corrupt
        // this into "C:" + LF + "ew".
        const raw = 'C:' + BACKSLASH + 'new'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe('C:new')
        expect(emitted).not.toContain(BACKSLASH)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe('C:new')
        expect(decoded).not.toContain('\n')
    })

    it('a value containing backslash-t: stays a literal two-char sequence end to end', () => {
        // Structurizr does NOT unescape backslash-t (measured), so the raw
        // value survives emission and decoding completely unchanged -- the
        // opposite treatment from the backslash-n case above.
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

    it('a doubled backslash immediately before "n": the ENTIRE run is stripped, not just the last backslash', () => {
        // Stripping only the last backslash of the run would leave a
        // single backslash newly adjacent to "n" (`\\n` -> `\n`), which
        // still decodes to a newline under the real parser. The whole run
        // must go.
        const raw = 'X' + BACKSLASH + BACKSLASH + 'notes'

        const emitted = escapeDslString(raw)
        expect(emitted).toBe('Xnotes')
        expect(emitted).not.toContain(BACKSLASH)

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe('Xnotes')
        expect(decoded).not.toContain('\n')
    })

    it('a value combining backslash-n, backslash-t and a doubled backslash: only the backslash-n run is stripped', () => {
        const raw = 'Path' + BACKSLASH + 'nnext' + BACKSLASH + 'temp' + BACKSLASH + BACKSLASH + 'end'

        const emitted = escapeDslString(raw)
        // "Path\nnext\temp\\end" -> the backslash before the first "n" is
        // stripped ("Pathnnext"); "\temp" is untouched (t is not special);
        // the doubled backslash before "end" is untouched (not before n).
        expect(emitted).toBe('Pathnnext' + BACKSLASH + 'temp' + BACKSLASH + BACKSLASH + 'end')
        expect(emitted).not.toContain(BACKSLASH + 'n')

        const decoded = decodeStructurizrQuotedText(emitted)
        expect(decoded).toBe(emitted)
        expect(decoded).not.toContain('\n')
    })

    it('would decode an UNSANITISED backslash-n straight into a newline (proves the decoder models the real parser, not just c4hero)', () => {
        // This deliberately bypasses escapeDslString() to show what would
        // happen if a backslash-n sequence ever reached the real CLI
        // unsanitised -- pinning the measured GROUND TRUTH independently of
        // whether escapeDslString() is doing its job.
        const decoded = decodeStructurizrQuotedText('C:' + BACKSLASH + 'new')
        expect(decoded).toBe('C:\new')
        expect(decoded.charCodeAt(2)).toBe(10) // LF, matching the measured char codes
    })
})
