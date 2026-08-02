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
    it('returns true for a legacy document containing a doubled backslash inside a string', () => {
        expect(detectLegacyEscapes('workspace {\n  model {\n    p = person "a\\\\b"\n  }\n}')).toBe(true)
    })

    it('returns false for a modern document with a plain Windows-style path', () => {
        expect(detectLegacyEscapes('workspace {\n  model {\n    p = person "C:\\folder"\n  }\n}')).toBe(false)
    })

    it('returns true for a document using pre-fix location/owner/status keywords', () => {
        expect(detectLegacyEscapes('model {\n  p = person "Alice" {\n    location External\n  }\n}')).toBe(true)
    })
})

// ─── Legacy-aware lexer ──────────────────────────────────────────────

describe('legacy-aware lexer', () => {
    it('decodes a doubled backslash in a legacy document', () => {
        const { tokens, errors } = lex('"a\\\\b"')
        expect(errors).toHaveLength(0)
        expect(tokens[0].value).toBe('a\\b')
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
