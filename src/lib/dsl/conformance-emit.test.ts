/**
 * Emits the Structurizr conformance corpus to the git-ignored
 * `.conformance-dsl/` directory and asserts offline invariants on every
 * emitted file. This is the fast, network-free half of the conformance gate;
 * `scripts/structurizr-conformance.mjs` runs the same directory through the
 * REAL Structurizr CLI (see `npm run dsl:conformance`).
 *
 * Corpus:
 *   1. createBigBankSample()          -- realistic, mostly-clean workspace
 *   2. createMicroservicesTemplate()  -- realistic, mostly-clean workspace
 *   3. createHostileWorkspace()       -- adversarial string/tag content
 *   4. hierarchical-landscape.dsl     -- parsed, normalised, re-serialised
 *
 * Normalisation applied to corpus item 4 (both documented here and inline
 * at the call site, per the story's requirement that every exclusion/
 * normalisation name its reason and tracking issue):
 *   - model.groups is cleared: c4hero's `group "X" { <identifier> }`
 *     emission is not valid Structurizr DSL. This is a known, separately
 *     tracked defect (TEA-164) and explicitly out of scope for this gate.
 *   - every view key is rewritten to [A-Za-z0-9_-]: the fixture's own
 *     source keys ("Label 600", ...) contain spaces, which the real
 *     Structurizr CLI rejects. The defect is in the fixture (it mirrors a
 *     third-party IcePanel export), not in the serializer.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createBigBankSample } from '@/lib/templates/bigBank'
import { createMicroservicesTemplate } from '@/lib/templates/microservices'
import { createHostileWorkspace } from './__fixtures__/hostile-strings'
import landscapeDsl from './__fixtures__/hierarchical-landscape.dsl?raw'
import type { Workspace } from '@/types/model'

const OUT_DIR = resolve(process.cwd(), '.conformance-dsl')

/** Rewrite a view key to the character class the real Structurizr CLI
 *  accepts ([A-Za-z0-9_-]). Only used on the hierarchical-landscape fixture
 *  normalisation described in the file header -- see TEA-164 note above. */
function sanitizeViewKey(key: string): string {
    const sanitized = key.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
    return sanitized || 'view'
}

function normalizeHierarchicalLandscape(): Workspace {
    const { workspace, errors } = parseDSL(landscapeDsl)
    if (errors.length > 0) {
        throw new Error(`hierarchical-landscape.dsl fixture failed to parse: ${JSON.stringify(errors)}`)
    }

    // TEA-164: c4hero's group emission is invalid Structurizr DSL. Clearing
    // groups here is a scoped normalisation for this conformance corpus, not
    // a product change -- group support is tracked and fixed separately.
    workspace.model.groups = []

    // The fixture's own view keys contain spaces (an IcePanel export
    // artifact); real Structurizr rejects keys with spaces. Rewrite them to
    // the accepted character class so this corpus item exercises everything
    // else about the fixture (239 relationships, hierarchical identifiers,
    // component views, etc.) without tripping over that unrelated defect.
    const seen = new Set<string>()
    const rewrite = (view: { key: string }) => {
        let key = sanitizeViewKey(view.key)
        let suffix = 2
        while (seen.has(key)) {
            key = `${sanitizeViewKey(view.key)}-${suffix}`
            suffix++
        }
        seen.add(key)
        view.key = key
    }
    for (const view of workspace.views.systemLandscapeViews) rewrite(view)
    for (const view of workspace.views.systemContextViews) rewrite(view)
    for (const view of workspace.views.containerViews) rewrite(view)
    for (const view of workspace.views.componentViews) rewrite(view)

    return workspace
}

interface CorpusEntry {
    name: string
    workspace: Workspace
}

const CORPUS: CorpusEntry[] = [
    { name: 'big-bank', workspace: createBigBankSample() },
    { name: 'microservices', workspace: createMicroservicesTemplate() },
    { name: 'hostile-strings', workspace: createHostileWorkspace() },
    { name: 'hierarchical-landscape', workspace: normalizeHierarchicalLandscape() },
]

// ─── Offline invariant helpers ─────────────────────────────────────────

const RESERVED_KEYWORD_LINE = /^\s*(location|owner|status|lineStyle|interactionStyle)\s/

/** A Structurizr-faithful decoder for whole-file scanning: `\"` yields a
 *  literal quote, ANY other backslash is a literal backslash, and a real
 *  newline before the closing quote is a hard error. Mirrors the ground
 *  truth in dsl-strings.ts and the dedicated tokenizer in
 *  strict-structurizr-tokenizer.test.ts, kept intentionally small here since
 *  this test only needs decoded values, not full statement tokenisation.
 *  NOTE: real Structurizr also unescapes a lone backslash-n into a real
 *  newline (measured, see dsl-strings.ts), but this decoder deliberately
 *  does not model that: escapeDslString() guarantees emitted content never
 *  contains a backslash immediately before "n" in the first place (see the
 *  `content.includes('\\n')` invariant below), so there is nothing for this
 *  whole-file scanner to decode differently -- any backslash it encounters
 *  here is, by construction, never one that a real parser would treat as
 *  the start of a `\n` escape. */
function decodeQuotedValues(content: string): string[] {
    const values: string[] = []
    let i = 0
    const n = content.length
    while (i < n) {
        if (content[i] !== '"') {
            i++
            continue
        }
        i++ // consume opening quote
        let value = ''
        let terminated = false
        while (i < n) {
            const ch = content[i]
            if (ch === '\n') {
                throw new Error(`real newline inside quoted string at offset ${i}`)
            }
            if (ch === '"') {
                terminated = true
                i++
                break
            }
            if (ch === '\\' && content[i + 1] === '"') {
                value += '"'
                i += 2
                continue
            }
            // Any other backslash (including one immediately followed by
            // end-of-input) is a literal backslash character, not an escape.
            value += ch
            i++
        }
        if (!terminated) {
            throw new Error('unterminated quoted string while decoding conformance output')
        }
        values.push(value)
    }
    return values
}

function assertOfflineInvariants(fileName: string, content: string): void {
    const lines = content.split('\n')

    for (const line of lines) {
        expect(line, `${fileName}: reserved keyword leaked into model{}`).not.toMatch(RESERVED_KEYWORD_LINE)
    }

    // The serializer must never double a backslash or emit the two-char
    // sequences backslash-n / backslash-t -- Structurizr does not unescape
    // them, so emitting them would corrupt the value rather than represent
    // a real newline/tab. The only backslash the serializer may introduce
    // is the one in `\"`.
    expect(content.includes('\\\\'), `${fileName}: doubled backslash`).toBe(false)
    expect(content.includes('\\n'), `${fileName}: literal backslash-n escape`).toBe(false)
    expect(content.includes('\\t'), `${fileName}: literal backslash-t escape`).toBe(false)

    // Decoding the whole file with a Structurizr-faithful quote/backslash
    // scanner must succeed (no unterminated strings, no raw newline inside a
    // quoted value) and no decoded value may end with a backslash -- a
    // trailing backslash would escape the closing quote and corrupt
    // tokenisation.
    let values: string[]
    expect(() => {
        values = decodeQuotedValues(content)
    }, `${fileName}: file failed to tokenise as valid Structurizr DSL`).not.toThrow()
    for (const value of values!) {
        expect(value.endsWith('\\'), `${fileName}: quoted value "${value}" ends with a backslash`).toBe(false)
    }

    // autoLayout rank directions must be lowercase (tb|bt|lr|rl).
    for (const line of lines) {
        const match = line.match(/^\s*autoLayout\s+([A-Za-z]+)/)
        if (match) {
            expect(match[1], `${fileName}: autoLayout direction is not lowercase`).toBe(match[1].toLowerCase())
        }
    }
}

// ─── Emit + assert ──────────────────────────────────────────────────────

beforeAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(OUT_DIR, { recursive: true })
})

describe('Structurizr conformance corpus emission', () => {
    for (const entry of CORPUS) {
        it(`emits ${entry.name}.dsl with no offline-detectable Structurizr violations`, () => {
            const dsl = serializeDSL(entry.workspace)
            writeFileSync(resolve(OUT_DIR, `${entry.name}.dsl`), dsl, 'utf8')
            assertOfflineInvariants(`${entry.name}.dsl`, dsl)
        })
    }

    it('round-trips the hostile fixture through parse -> serialize without drift', () => {
        const first = serializeDSL(createHostileWorkspace())
        const { workspace: reparsed, errors } = parseDSL(first)
        expect(errors).toEqual([])
        const second = serializeDSL(reparsed)
        expect(second).toBe(first)
    })

    it('the hostile fixture itself contains a raw backslash immediately before "n" (GH #109 coverage gate)', () => {
        // This is a fixture-coverage assertion, not a serializer assertion:
        // it fails if the hostile fixture stops exercising the GH #109
        // Windows-path domain (a raw value with backslash-n in it), which
        // would silently turn the `content.includes('\\n') === false`
        // invariant above into a vacuous truth (true of any file, hostile
        // or not, once nothing in the corpus contains the shape it's
        // supposed to be guarding against).
        const ws = createHostileWorkspace()
        const rawValues: string[] = []
        for (const person of ws.model.people) {
            rawValues.push(person.name, person.description ?? '')
        }
        for (const system of ws.model.softwareSystems) {
            rawValues.push(system.name, system.description ?? '')
            for (const container of system.containers) {
                rawValues.push(container.name, container.description ?? '')
            }
        }
        for (const relationship of ws.model.relationships) {
            rawValues.push(relationship.description ?? '')
        }
        const hasRawBackslashBeforeN = rawValues.some(value => /\\n/.test(value))
        expect(
            hasRawBackslashBeforeN,
            'hostile fixture must contain at least one raw value with a backslash immediately before "n"'
        ).toBe(true)
    })
})
