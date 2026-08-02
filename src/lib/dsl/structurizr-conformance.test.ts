// Conformance tests against the REAL Structurizr parser.
//
// Every other test in this directory checks c4hero against itself:
// `parse(serialize(x)) === x`. That invariant held perfectly while the
// serializer emitted DSL that Structurizr rejected or silently misread
// (GH #109) — a parser and serializer that agree with each other prove
// nothing about agreeing with anyone else.
//
// These tests use the Structurizr CLI as an independent oracle. They skip
// when it is not installed so local `npm test` stays fast; CI installs it and
// sets STRUCTURIZR_CLI, so the gate is enforced there.
//
//   curl -sSL -o cli.zip \
//     https://github.com/structurizr/cli/releases/latest/download/structurizr-cli.zip
//   unzip cli.zip -d .structurizr-cli && chmod +x .structurizr-cli/structurizr.sh
//
// Note that validation alone is NOT sufficient. `container "X:\\"` passes
// validation and stores `X:\" ` — a corrupted value, no error. Anything
// asserting round-trip safety has to compare the value the real parser
// actually stored, which is why exportModel() exists below.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import { createBigBankSample } from '@/lib/templates/bigBank'
import { createMicroservicesTemplate } from '@/lib/templates/microservices'
import { createMonolithTemplate } from '@/lib/templates/monolith'
import { createEventDrivenTemplate } from '@/lib/templates/eventDriven'
import type { Workspace } from '@/types/model'

const CLI = process.env.STRUCTURIZR_CLI ?? join(process.cwd(), '.structurizr-cli', 'structurizr.sh')
const CLI_AVAILABLE = existsSync(CLI)

function withTempDsl<T>(dsl: string, fn: (dir: string, file: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'c4hero-conformance-'))
    try {
        const file = join(dir, 'workspace.dsl')
        writeFileSync(file, dsl, 'utf8')
        return fn(dir, file)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

/** Run the real parser over `dsl`. Returns its complaint, or null if accepted. */
function validate(dsl: string): string | null {
    return withTempDsl(dsl, (_dir, file) => {
        try {
            execFileSync(CLI, ['validate', '-w', file], { encoding: 'utf8', stdio: 'pipe' })
            return null
        } catch (err) {
            const e = err as { stdout?: string; stderr?: string; message: string }
            return (e.stdout ?? '') + (e.stderr ?? '') || e.message
        }
    })
}

/** Parse with the real parser and return the model it actually built. */
function exportModel(dsl: string): Record<string, never> | Record<string, unknown> {
    return withTempDsl(dsl, (dir, file) => {
        const out = join(dir, 'out')
        execFileSync(CLI, ['export', '-w', file, '-f', 'json', '-o', out], { stdio: 'pipe' })
        const json = readdirSync(out).find(f => f.endsWith('.json'))
        if (!json) throw new Error('Structurizr CLI produced no JSON export')
        return JSON.parse(readFileSync(join(out, json), 'utf8'))
    })
}

/** Names of every container the real parser found, in declaration order. */
function containerNames(model: Record<string, unknown>): string[] {
    const m = model.model as { softwareSystems?: { containers?: { name: string }[] }[] } | undefined
    return (m?.softwareSystems ?? []).flatMap(s => (s.containers ?? []).map(c => c.name))
}

function systemNamed(model: Record<string, unknown>, name: string) {
    const m = model.model as { softwareSystems?: { name: string; tags?: string; properties?: Record<string, string> }[] } | undefined
    return (m?.softwareSystems ?? []).find(s => s.name === name)
}

interface ExportedRelationship {
    description?: string
    technology?: string
    url?: string
    tags?: string
    properties?: Record<string, string>
}

/** Every relationship the real parser stored (it hangs them off the source element). */
function allRelationships(model: Record<string, unknown>): ExportedRelationship[] {
    const m = model.model as {
        people?: { relationships?: ExportedRelationship[] }[]
        softwareSystems?: { relationships?: ExportedRelationship[] }[]
    } | undefined
    return [
        ...(m?.people ?? []).flatMap(p => p.relationships ?? []),
        ...(m?.softwareSystems ?? []).flatMap(s => s.relationships ?? []),
    ]
}

/** A workspace whose strings exercise everything Structurizr's tokenizer treats specially. */
function hostileWorkspace(): Workspace {
    return {
        name: 'Hostile',
        description: '',
        model: {
            people: [
                {
                    id: 'user', type: 'person', name: 'Ops User',
                    tags: ['Element', 'Person'], properties: {},
                },
            ],
            softwareSystems: [
                {
                    id: 'sys', type: 'softwareSystem', name: 'Example System',
                    tags: ['Element', 'Software System', 'has,comma', 'has"quote'],
                    properties: {}, owner: 'Platform Team', location: 'External',
                    status: 'Live',
                    containers: [
                        // The exact values from GH #109.
                        {
                            id: 'folder', type: 'container', name: 'Shared Folder X:\\',
                            description: "HOST-01 'U:\\'", technology: 'File System',
                            tags: ['Element', 'Container'], properties: {}, components: [],
                        },
                        {
                            id: 'quoted', type: 'container', name: 'Say "hi"',
                            description: 'ends with backslash \\', technology: 'C:\\Program Files',
                            tags: ['Element', 'Container'], properties: {}, components: [],
                        },
                        {
                            id: 'newline', type: 'container', name: 'two\nlines',
                            description: 'tab\there', technology: 'literal \\n not newline',
                            tags: ['Element', 'Container'], properties: {}, components: [],
                        },
                        // Backslash immediately before a quote — representable
                        // (emitted as `\\"`, decoded as literal-\ + quote).
                        {
                            id: 'bsq', type: 'container', name: 'see "manual\\"',
                            description: 'backslash before quote', technology: 'a\\"b',
                            tags: ['Element', 'Container'], properties: {}, components: [],
                        },
                    ],
                },
            ],
            relationships: [
                // Exercises every relationship field the serializer must encode:
                // description/technology (with hostile strings), the
                // property-encoded lineStyle/interactionStyle, url, a tag with
                // a comma, and a user property.
                {
                    id: 'rel1', sourceId: 'user', destinationId: 'sys',
                    description: 'Reads the "daily"\nreport', technology: 'SMB 3.0',
                    tags: ['Relationship', 'nightly,batch'],
                    properties: { 'sync.source': 'ldap' },
                    interactionStyle: 'Asynchronous', lineStyle: 'Orthogonal',
                    url: 'https://example.com/share',
                },
            ],
            groups: [],
        },
        views: {
            systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
            configuration: { styles: { elements: [], relationships: [] } },
        },
    }
}

describe.skipIf(!CLI_AVAILABLE)('Structurizr conformance (real CLI)', () => {
    const templates: [string, () => Workspace][] = [
        ['bigBank', createBigBankSample],
        ['microservices', createMicroservicesTemplate],
        ['monolith', createMonolithTemplate],
        ['eventDriven', createEventDrivenTemplate],
    ]

    it.each(templates)('%s template serializes to DSL Structurizr accepts', (_name, make) => {
        expect(validate(serializeDSL(make()))).toBeNull()
    })

    it('hostile strings serialize to DSL Structurizr accepts', () => {
        expect(validate(serializeDSL(hostileWorkspace()))).toBeNull()
    })

    function icePanelWorkspace(): Workspace {
        const source = readFileSync(join(process.cwd(), 'src/lib/dsl/__fixtures__/hierarchical-landscape.dsl'), 'utf8')
        const { workspace, errors } = parseDSL(source)
        expect(errors).toEqual([])
        return workspace
    }

    it('the IcePanel landscape model re-serializes to DSL Structurizr accepts', () => {
        const ws = icePanelWorkspace()
        // Two exclusions, both tracked elsewhere and neither a string/keyword
        // problem:
        //
        //  - groups serialize as a trailing block of bare identifier
        //    references, which Structurizr rejects outright (TEA-164).
        //  - the source file's own systemContext/container view keys contain
        //    spaces ("Label 602"), which Structurizr rejects at line 814 of
        //    the fixture itself — before c4hero touches it. Reproducing an
        //    invalid key faithfully is not this ticket's bug.
        //
        // What remains is the 1060-line real-world model, which is what the
        // escaping/location/owner fixes here are responsible for.
        ws.model.groups = []
        ws.views.systemLandscapeViews = []
        ws.views.systemContextViews = []
        ws.views.containerViews = []
        ws.views.componentViews = []
        expect(validate(serializeDSL(ws))).toBeNull()
    })

    it('does not make the IcePanel fixture any less valid than it already was', () => {
        // The source is non-conformant on its own (invalid view keys). The
        // property that matters is that a c4hero round-trip does not introduce
        // a *new* class of error — it should still fail on the same thing.
        const source = readFileSync(join(process.cwd(), 'src/lib/dsl/__fixtures__/hierarchical-landscape.dsl'), 'utf8')
        expect(validate(source)).toContain('View keys can only contain')
    })

    // Locks in the known-broken group emission so it cannot regress further,
    // and trips the moment TEA-164 fixes it — at which point fold the groups
    // back into the test above and delete this one.
    it.fails('TEA-164: groups still emit bare refs that Structurizr rejects', () => {
        expect(validate(serializeDSL(icePanelWorkspace()))).toBeNull()
    })

    // Validation is not enough: "X:\\" validates fine and stores a corrupted
    // value. These assert what the real parser actually built.
    describe('value fidelity', () => {
        // Every test reads the same export; one CLI (JVM) run instead of ten.
        let memo: Record<string, unknown> | undefined
        function hostileModel(): Record<string, unknown> {
            memo ??= exportModel(serializeDSL(hostileWorkspace()))
            return memo
        }
        it('preserves hostile container strings exactly, modulo unrepresentable backslashes', () => {
            const model = hostileModel()
            expect(containerNames(model)).toEqual([
                // Trailing backslash is unrepresentable in Structurizr DSL and is dropped.
                'Shared Folder X:',
                'Say "hi"',
                'two\nlines',
                // Backslash-before-quote IS representable and survives byte-exact.
                'see "manual\\"',
            ])
        })

        it('keeps an interior backslash single, not doubled', () => {
            const model = hostileModel()
            const m = model.model as { softwareSystems: { containers: { name: string; technology?: string }[] }[] }
            const quoted = m.softwareSystems[0].containers.find(c => c.name === 'Say "hi"')
            expect(quoted?.technology).toBe('C:\\Program Files')
        })

        it('stores backslash-before-quote byte-exactly', () => {
            const model = hostileModel()
            const m = model.model as { softwareSystems: { containers: { name: string; technology?: string }[] }[] }
            const bsq = m.softwareSystems[0].containers.find(c => c.name === 'see "manual\\"')
            expect(bsq).toBeDefined()
            expect(bsq?.technology).toBe('a\\"b')
        })

        it('carries externality as the External tag', () => {
            const model = hostileModel()
            expect(systemNamed(model, 'Example System')?.tags).toContain('External')
        })

        it('carries owner as a property the real parser can read', () => {
            const model = hostileModel()
            expect(systemNamed(model, 'Example System')?.properties?.owner).toBe('Platform Team')
        })

        it('does not split a tag containing a comma into two tags', () => {
            const model = hostileModel()
            const tags = (systemNamed(model, 'Example System')?.tags ?? '').split(',')
            expect(tags).not.toContain('has')
            expect(tags).not.toContain('comma')
        })

        it('carries element status as a property the real parser can read', () => {
            const model = hostileModel()
            expect(systemNamed(model, 'Example System')?.properties?.['c4hero.status']).toBe('Live')
        })

        it('preserves relationship description, technology and url exactly', () => {
            const model = hostileModel()
            const [rel] = allRelationships(model)
            expect(rel).toBeDefined()
            expect(rel.description).toBe('Reads the "daily"\nreport')
            expect(rel.technology).toBe('SMB 3.0')
            expect(rel.url).toBe('https://example.com/share')
        })

        it('carries lineStyle and interactionStyle as properties, next to user properties', () => {
            const model = hostileModel()
            const [rel] = allRelationships(model)
            expect(rel?.properties?.['c4hero.lineStyle']).toBe('Orthogonal')
            expect(rel?.properties?.['c4hero.interactionStyle']).toBe('Asynchronous')
            expect(rel?.properties?.['sync.source']).toBe('ldap')
        })

        it('does not split a relationship tag containing a comma into two tags', () => {
            const model = hostileModel()
            const tags = (allRelationships(model)[0]?.tags ?? '').split(',')
            expect(tags).not.toContain('nightly')
            expect(tags).not.toContain('batch')
            expect(tags).toContain('nightlybatch')
        })
    })
})

// A suite that silently skips is indistinguishable from a suite that passes —
// which is the same false-confidence failure this whole file exists to prevent.
// The CI job sets STRUCTURIZR_CONFORMANCE=1, so a broken CLI download turns
// into a red build instead of a green skip.
describe('Structurizr conformance harness', () => {
    it('has the CLI installed when conformance is required', () => {
        if (process.env.STRUCTURIZR_CONFORMANCE !== '1') return
        expect(CLI_AVAILABLE, `Structurizr CLI not found at ${CLI}`).toBe(true)
    })
})
