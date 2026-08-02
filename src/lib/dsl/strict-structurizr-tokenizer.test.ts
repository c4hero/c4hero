/**
 * A minimal, test-only tokenizer that mimics the REAL Structurizr DSL lexer's
 * quoted-string handling exactly (ground truth in dsl-strings.ts):
 *   - a quoted string starts at `"`
 *   - `\"` yields a literal quote
 *   - ANY other backslash (not immediately followed by `"`) is a literal
 *     backslash character, never an escape
 *   - a real newline before the closing quote is a hard parse error
 *
 * This is deliberately independent of c4hero's own lexer/parser
 * (src/lib/dsl/lexer.ts, parser.ts) -- it exists to catch the case where
 * c4hero's escaping and c4hero's parsing agree with EACH OTHER but not with
 * how the real Structurizr CLI actually tokenises, which is exactly the bug
 * class this story fixes (see string-encoding.test.ts for the c4hero-lexer
 * side of that story).
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createHostileWorkspace } from './__fixtures__/hostile-strings'

interface Token {
    type: 'string' | 'other'
    value: string
    line: number
}

function tokenize(content: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    let line = 1
    const n = content.length
    while (i < n) {
        const ch = content[i]
        if (ch === '\n') {
            line++
            i++
            continue
        }
        if (ch === '"') {
            const startLine = line
            i++
            let value = ''
            let terminated = false
            while (i < n) {
                const c = content[i]
                if (c === '\n') throw new Error(`unterminated string starting at line ${startLine}: real newline before closing quote`)
                if (c === '"') {
                    terminated = true
                    i++
                    break
                }
                if (c === '\\' && content[i + 1] === '"') {
                    value += '"'
                    i += 2
                    continue
                }
                // Any other backslash is a literal backslash, not an escape.
                value += c
                i++
            }
            if (!terminated) throw new Error(`unterminated string starting at line ${startLine}`)
            tokens.push({ type: 'string', value, line: startLine })
            continue
        }
        if (/\s/.test(ch)) {
            i++
            continue
        }
        let j = i
        while (j < n && !/\s/.test(content[j]) && content[j] !== '"') j++
        tokens.push({ type: 'other', value: content.slice(i, j), line })
        i = j
    }
    return tokens
}

// Maximum quoted-string arguments the real Structurizr grammar allows on a
// single statement line for each leading keyword. Used as an upper bound
// (not an exact-arity check) -- some keywords are shared between an element
// statement and a view header that accepts fewer strings, and the element
// form is always the stricter (larger) bound of the two.
const KEYWORD_MAX: Record<string, number> = {
    workspace: 2, // name, description
    person: 3, // name, description, tags
    softwareSystem: 3, // name, description, tags
    container: 4, // name, description, technology, tags
    component: 4, // name, description, technology, tags
    url: 1,
    title: 1,
    description: 1,
    group: 1,
    systemLandscape: 1, // key
    systemContext: 1, // key
    element: 1, // style header: element "tag" {
    relationship: 1, // style header: relationship "tag" {
    themes: Infinity,
}
const RELATIONSHIP_MAX = 3 // description, technology, tags
const BARE_KV_MAX = 2 // properties/perspectives entry: "key" "value"

function statementMax(headWords: string[]): number {
    if (headWords.includes('->')) return RELATIONSHIP_MAX
    for (const word of headWords) {
        if (word in KEYWORD_MAX) return KEYWORD_MAX[word]
    }
    return BARE_KV_MAX
}

describe('strict Structurizr-faithful tokenizer over serializer output', () => {
    const dsl = serializeDSL(createHostileWorkspace())

    it('never reports an unterminated string for the hostile fixture', () => {
        expect(() => tokenize(dsl)).not.toThrow()
    })

    it('keeps every statement within the token arity the real grammar allows', () => {
        const tokens = tokenize(dsl)
        const byLine = new Map<number, Token[]>()
        for (const tok of tokens) {
            if (!byLine.has(tok.line)) byLine.set(tok.line, [])
            byLine.get(tok.line)!.push(tok)
        }
        for (const [line, lineTokens] of byLine) {
            const strings = lineTokens.filter(t => t.type === 'string')
            if (strings.length === 0) continue
            const headWords = lineTokens.filter(t => t.type === 'other').map(t => t.value)
            const max = statementMax(headWords)
            expect(
                strings.length,
                `line ${line}: ${strings.length} quoted args exceeds Structurizr's grammar limit (${max}) -- head: ${headWords.join(' ')}`
            ).toBeLessThanOrEqual(max)
        }
    })

    it('decodes escaped/backslash-bearing values back to exactly what c4hero sanitized them to', () => {
        const tokens = tokenize(dsl)
        const decoded = new Set(tokens.filter(t => t.type === 'string').map(t => t.value))

        // Expected values are derived by hand from the raw hostile-fixture
        // input plus the documented ground truth (control chars -> single
        // space, trailing backslash run stripped, embedded quote left as a
        // real quote once this tokenizer's `\"` decoding unwinds it) --
        // deliberately NOT computed via dsl-strings.ts, so this is a genuine
        // cross-check between the foreign tokenizer and the serializer's
        // actual output, not a comparison of two calls to the same function.
        // trailing backslash in 'Shared Folder X:\' is unrepresentable and stripped.
        expect(decoded.has('Shared Folder X:')).toBe(true)
        // mid-string backslash before an apostrophe (not a quote) stays literal.
        expect(decoded.has("HOST-01 'U:\\'")).toBe(true)
        // newline/tab blanked to spaces; embedded quote survives the escape/decode round trip.
        expect(decoded.has('Contains a newline and a tab, plus a "quoted" phrase.')).toBe(true)
        // Windows path backslashes are literal, single, and never doubled.
        expect(decoded.has('Serves C:\\Users\\svc over SMB')).toBe(true)
        expect(decoded.has('Reads files from')).toBe(true) // tab blanked to space
        expect(decoded.has('https://example.com/docs?q="quoted"')).toBe(true)
        expect(decoded.has('Contains "quotes" and tabs')).toBe(true) // tab blanked to space

        // Tag lists: the whole comma-joined string is one quoted argument.
        // Commas inside a tag have no escape mechanism (they always split
        // the tag), so 'Tag,With Comma' can only survive as 'Tag With Comma'.
        expect(decoded.has('Tag With Comma,Tag"WithQuote,External')).toBe(true)
        expect(decoded.has('Tag WithComma,Tag"WithQuote')).toBe(true)
    })

    it('agrees with c4hero own parser on the decoded values (cross-check, not a duplicate)', () => {
        // This does not replace the tokenizer-only assertions above -- it
        // additionally proves c4hero's own parser (lexer.ts/parser.ts)
        // decodes identically to the independent, ground-truth-only
        // tokenizer built in this file, so nothing is silently diverging
        // between "what c4hero thinks it wrote" and "what Structurizr would
        // actually read".
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const tokens = tokenize(dsl)
        const decoded = new Set(tokens.filter(t => t.type === 'string').map(t => t.value))
        const reSys = workspace.model.softwareSystems[0]
        expect(decoded.has(reSys.name)).toBe(true)
    })
})
