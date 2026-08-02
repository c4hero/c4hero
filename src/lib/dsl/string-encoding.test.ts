import { describe, it, expect } from 'vitest'
import { escapeDslString, sanitizeTag } from './dsl-strings'
import { lex, detectLegacyEscapes } from './lexer'
import { parseDSL, serializeDSL } from './index'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
    return {
        name: 'Test',
        model: {
            people: [],
            softwareSystems: [],
            relationships: [],
            groups: [],
        },
        views: {
            systemLandscapeViews: [],
            systemContextViews: [],
            containerViews: [],
            componentViews: [],
            configuration: { styles: { elements: [], relationships: [] } },
        },
    }
}

// ─── escapeDslString ────────────────────────────────────────────────

describe('escapeDslString', () => {
    it('escapes double quotes as backslash-quote', () => {
        expect(escapeDslString('A "B" C')).toBe('A \\"B\\" C')
    })

    it('does not double backslashes', () => {
        expect(escapeDslString('C:\\folder')).toBe('C:\\folder')
    })

    it('strips a trailing backslash (unrepresentable)', () => {
        expect(escapeDslString('X:\\')).toBe('X:')
        expect(escapeDslString('X:\\\\\\')).toBe('X:')
    })

    it('turns a newline into a single space', () => {
        expect(escapeDslString('A\nB')).toBe('A B')
    })

    it('turns a tab into a single space', () => {
        expect(escapeDslString('A\tB')).toBe('A B')
    })

    it('turns other C0 control characters and DEL into a single space each', () => {
        // Build the raw string from character codes rather than embedding
        // literal control bytes or hex escapes in the test source.
        const raw = 'A' + String.fromCharCode(1) + String.fromCharCode(11) + 'B' + String.fromCharCode(127) + 'C'
        expect(escapeDslString(raw)).toBe('A  B C')
    })
})

// ─── sanitizeTag ────────────────────────────────────────────────────

describe('sanitizeTag', () => {
    it('turns a comma into a space', () => {
        expect(sanitizeTag('a,b')).toBe('a b')
    })

    it('drops a tag that sanitises to nothing', () => {
        expect(sanitizeTag('   ')).toBe('')
        expect(sanitizeTag(',,,')).toBe('')
    })

    it('trims surrounding whitespace after sanitising', () => {
        expect(sanitizeTag('  foo  ')).toBe('foo')
    })
})

// ─── Serializer output never contains banned escape sequences ───────

describe('serializer output never contains banned escape sequences', () => {
    it('serializes a hostile name/description with no doubled backslash and no trailing backslash', () => {
        const ws = makeWorkspace()
        ws.model.people.push({
            id: 'p1',
            type: 'person',
            name: 'Shared Folder X:\\',
            description: "HOST-01 'U:\\'",
            tags: ['Element', 'Person'],
            properties: {},
        })

        const dsl = serializeDSL(ws)
        const personLine = dsl.split('\n').find(l => l.includes('person '))
        expect(personLine).toBeDefined()
        // The serializer must never introduce a doubled backslash.
        expect(personLine).not.toMatch(/\\\\/)
        // Every quoted value's raw content (the text between the quotes,
        // treating `\"` as an escaped quote) must not end in a backslash.
        for (const match of personLine!.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
            expect(match[1].endsWith('\\')).toBe(false)
        }
    })

    it('emits a comma-containing tag as a single tag', () => {
        const ws = makeWorkspace()
        ws.model.people.push({
            id: 'p1',
            type: 'person',
            name: 'Alice',
            tags: ['Element', 'Person', 'a,b'],
            properties: {},
        })
        const dsl = serializeDSL(ws)
        expect(dsl).toContain('"a b"')
        expect(dsl).not.toContain('"a,b"')
    })

    it('emits a tag containing a quote escaped', () => {
        const ws = makeWorkspace()
        ws.model.people.push({
            id: 'p1',
            type: 'person',
            name: 'Alice',
            tags: ['Element', 'Person', 'quo"te'],
            properties: {},
        })
        const dsl = serializeDSL(ws)
        expect(dsl).toContain('quo\\"te')
    })
})

// ─── detectLegacyEscapes ─────────────────────────────────────────────

describe('detectLegacyEscapes', () => {
    // A bare doubled backslash with no keyword marker is no longer treated
    // as legacy evidence: it is indistinguishable from a modern value that
    // legitimately contains two literal backslash characters (e.g.
    // `a\\b`), and content-based heuristics for "legacy" backslash shapes
    // are provably unsound (see the detectLegacyEscapes doc comment) --
    // the keyword-line marker is the only condition allowed to fire.
    it('returns false for a document containing a doubled backslash but no legacy keyword marker', () => {
        expect(detectLegacyEscapes('workspace {\n  model {\n    p = person "a\\\\b"\n  }\n}')).toBe(false)
    })

    it('returns false for a modern document with a plain Windows-style path', () => {
        expect(detectLegacyEscapes('workspace {\n  model {\n    p = person "C:\\folder"\n  }\n}')).toBe(false)
    })

    it('returns true for a document using pre-fix location/owner/status keywords', () => {
        expect(detectLegacyEscapes('model {\n  p = person "Alice" {\n    location External\n  }\n}')).toBe(true)
    })

    it('returns true for a doubled backslash when a legacy keyword marker is present anywhere in the document', () => {
        expect(
            detectLegacyEscapes('workspace {\n  model {\n    p = person "a\\\\b" {\n      location External\n    }\n  }\n}')
        ).toBe(true)
    })
})

// ─── Legacy-aware lexer ──────────────────────────────────────────────

describe('legacy-aware lexer', () => {
    it('preserves a doubled backslash unchanged with no legacy keyword marker present', () => {
        const { tokens, errors } = lex('"a\\\\b"')
        expect(errors).toHaveLength(0)
        expect(tokens[0].value).toBe('a\\\\b')
    })

    it('decodes a doubled backslash when the document carries a legacy keyword marker', () => {
        // LEGACY_KEYWORD_LINE is deliberately line-anchored (see lexer.ts),
        // so the marker needs its own line here -- real serialized DSL
        // (modern or pre-fix) always puts one statement per line.
        const { tokens, errors } = lex('workspace { model { p = person "a\\\\b" {\n  location External\n} } } ')
        expect(errors).toHaveLength(0)
        const str = tokens.find(t => t.type === 'STRING')
        expect(str?.value).toBe('a\\b')
    })

    it('preserves a single backslash in a modern document (Windows path)', () => {
        const { tokens, errors } = lex('"C:\\folder"')
        expect(errors).toHaveLength(0)
        expect(tokens[0].value).toBe('C:\\folder')
    })

    it('always decodes backslash-quote to a quote regardless of legacy mode', () => {
        const { tokens } = lex('"a\\"b"')
        expect(tokens[0].value).toBe('a"b')
    })
})

// ─── Round-trip stability with hostile values ───────────────────────

describe('round-trip stability with hostile values', () => {
    it('serialize -> parse of hostile values returns the sanitised values, and re-serializing is byte-identical', () => {
        const ws = makeWorkspace()
        ws.model.people.push({
            id: 'p1',
            type: 'person',
            name: 'Quote"Name',
            description: 'Backslash\\Value',
            tags: ['Element', 'Person', 'a,b', 'has"quote'],
            properties: {},
        })
        ws.model.softwareSystems.push({
            id: 's1',
            type: 'softwareSystem',
            name: 'Trailing\\',
            description: 'Line1\nLine2\tTabbed',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
        })

        const dsl1 = serializeDSL(ws)
        const { workspace: parsed, errors } = parseDSL(dsl1)
        expect(errors).toEqual([])

        const person = parsed.model.people.find(p => p.id === 'p1')
        expect(person?.name).toBe('Quote"Name')
        expect(person?.description).toBe('Backslash\\Value')
        expect(person?.tags).toContain('a b')
        expect(person?.tags).toContain('has"quote')

        const sys = parsed.model.softwareSystems.find(s => s.id === 's1')
        expect(sys?.name).toBe('Trailing')
        expect(sys?.description).toBe('Line1 Line2 Tabbed')

        const dsl2 = serializeDSL(parsed)
        expect(dsl2).toBe(dsl1)
    })
})

// ─── Legacy-detection false positive (GH #109) ───────────────────────
//
// A value containing a run of two-or-more backslashes (e.g. a Windows UNC
// path) must never be misclassified as pre-fix c4hero output and have its
// backslashes silently halved / its `\t`/`\n` two-char sequences unescaped
// on load. Built with String.fromCharCode(92) rather than a literal `\\`
// in the test source so the intent (raw backslash characters) is explicit.
describe('legacy detection does not misfire on modern backslash-adjacent values', () => {
    const BACKSLASH = String.fromCharCode(92)

    it('round-trips a UNC-style value with an odd run next to "t" unchanged', () => {
        // Two literal backslashes, then "HOST-01", then one literal
        // backslash immediately before a literal "t" -- the exact repro
        // from GH #109. A pre-fix-only heuristic reads the lone backslash
        // before "t" as a legacy `\t` escape and corrupts the value into
        // `\HOST-01<TAB>emp holds it`.
        const original = BACKSLASH + BACKSLASH + 'HOST-01' + BACKSLASH + 'temp holds it'
        expect(original).toHaveLength(23)

        const ws = makeWorkspace()
        ws.model.softwareSystems.push({
            id: 's1',
            type: 'softwareSystem',
            name: 'FileServer',
            description: original,
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
        })

        const dsl1 = serializeDSL(ws)
        const { workspace: parsed, errors } = parseDSL(dsl1)
        expect(errors).toEqual([])

        const sys = parsed.model.softwareSystems.find(s => s.id === 's1')
        expect(sys?.description).toBe(original)

        // serializeDSL(parseDSL(serializeDSL(ws)).workspace) === serializeDSL(ws)
        expect(serializeDSL(parsed)).toBe(dsl1)
    })

    it('round-trips a UNC-style value with an odd run next to "n" unchanged', () => {
        // Same shape as the "t" case above, but the lone backslash sits
        // next to `n` instead. Per GROUND TRUTH (dsl-strings.ts), real
        // Structurizr does NOT unescape backslash-n any more than it
        // unescapes backslash-t -- both stay two literal characters. So
        // this value must round-trip unchanged exactly like the "t" case,
        // with no special-casing of `n`.
        const original = BACKSLASH + BACKSLASH + 'SHARE-02' + BACKSLASH + 'notes.txt'

        const ws = makeWorkspace()
        ws.model.people.push({
            id: 'p1',
            type: 'person',
            name: 'Ops',
            description: original,
            tags: ['Element', 'Person'],
            properties: {},
        })

        const dsl1 = serializeDSL(ws)
        const { workspace: parsed, errors } = parseDSL(dsl1)
        expect(errors).toEqual([])
        expect(parsed.model.people.find(p => p.id === 'p1')?.description).toBe(original)
        expect(serializeDSL(parsed)).toBe(dsl1)
    })

    it('round-trips a bare even-length run ("a\\\\b") unchanged with no legacy keyword marker', () => {
        // Two adjacent literal backslashes with ordinary letters on both
        // sides and NO location/owner/status/lineStyle/interactionStyle
        // line anywhere in the document. This is the shape a doubled real
        // backslash would ALSO take under the pre-fix scheme, so it used
        // to be (wrongly) treated as sufficient legacy evidence on its
        // own and halved to a single backslash on load.
        const original = 'a' + BACKSLASH + BACKSLASH + 'b'

        const ws = makeWorkspace()
        ws.model.softwareSystems.push({
            id: 's2',
            type: 'softwareSystem',
            name: 'System',
            description: original,
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
        })

        const dsl1 = serializeDSL(ws)
        const { workspace: parsed, errors } = parseDSL(dsl1)
        expect(errors).toEqual([])
        expect(parsed.model.softwareSystems.find(s => s.id === 's2')?.description).toBe(original)
        expect(serializeDSL(parsed)).toBe(dsl1)
    })

    it('a genuinely legacy document (doubled backslash + bare location keyword) still decodes correctly', () => {
        // Hand-written as pre-fix c4hero would have emitted it: the real
        // backslash in the description is doubled, and the bare `location`
        // keyword (never valid in real Structurizr, never emitted by the
        // modern serializer) proves this file predates the fix.
        const doubled = BACKSLASH + BACKSLASH
        const dsl = [
            'workspace "Legacy" {',
            '  model {',
            `    fs = softwareSystem "FileServer" "Share at C:${doubled}data" {`,
            '      location External',
            '    }',
            '  }',
            '  views {}',
            '}',
        ].join('\n')

        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const sys = workspace.model.softwareSystems.find(s => s.id === 'fs')
        // The doubled backslash decodes to a single real backslash, and the
        // legacy `location External` keyword still sets `location`.
        expect(sys?.description).toBe('Share at C:' + BACKSLASH + 'data')
        expect(sys?.location).toBe('External')
    })
})
