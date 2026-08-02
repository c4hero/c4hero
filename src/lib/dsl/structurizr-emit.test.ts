/**
 * Verifies the serializer only ever emits DSL keywords the real Structurizr
 * parser accepts (v2025.11.09 ground truth): `location`, bare `owner`,
 * `status`, `lineStyle` and `interactionStyle` are all rejected inside
 * element/relationship blocks, and `autoLayout` rank directions must be
 * lowercase. c4hero instead carries this data through the `External` tag
 * and `properties { }` blocks (`"owner"`, `"c4hero.status"`,
 * `"c4hero.lineStyle"`, `"c4hero.interactionStyle"`).
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
    return {
        name: 'Structurizr Conformance',
        description: 'Exercises every reserved-keyword encoding',
        model: {
            people: [
                {
                    id: 'alice',
                    type: 'person',
                    name: 'Alice',
                    description: 'External customer',
                    tags: ['Element', 'Person'],
                    properties: { department: 'Retail' },
                    location: 'External',
                    owner: 'CX Team',
                    status: 'Live',
                },
                {
                    // Already tagged External in `tags` AND has location: 'External' --
                    // must emit the tag exactly once, not twice.
                    id: 'carol',
                    type: 'person',
                    name: 'Carol',
                    tags: ['Element', 'Person', 'External'],
                    properties: {},
                    location: 'External',
                },
            ],
            softwareSystems: [
                {
                    id: 'platform',
                    type: 'softwareSystem',
                    name: 'Platform',
                    description: 'Core platform',
                    tags: ['Element', 'Software System'],
                    properties: {},
                    location: 'Internal',
                    owner: 'Platform Team',
                    status: 'Deprecated',
                    containers: [
                        {
                            id: 'api',
                            type: 'container',
                            name: 'API',
                            technology: 'Node.js',
                            tags: ['Element', 'Container'],
                            properties: {},
                            owner: 'Backend Team',
                            status: 'Planned',
                            components: [
                                {
                                    id: 'authComp',
                                    type: 'component',
                                    name: 'Auth Component',
                                    tags: ['Element', 'Component'],
                                    properties: {},
                                    owner: 'Security Team',
                                    status: 'Removed',
                                },
                            ],
                        },
                    ],
                },
            ],
            relationships: [
                {
                    id: 'rel-1',
                    sourceId: 'alice',
                    destinationId: 'platform',
                    description: 'Uses',
                    technology: 'HTTPS',
                    tags: [],
                    properties: { rateLimited: 'true' },
                    lineStyle: 'Curved',
                    interactionStyle: 'Asynchronous',
                },
            ],
            groups: [],
        },
        views: {
            systemLandscapeViews: [
                {
                    type: 'systemLandscape',
                    key: 'landscape',
                    // Explicit element list (not `include *`) so idempotency isn't
                    // entangled with the parser's pre-existing, unrelated wildcard
                    // expansion behavior.
                    elements: [{ id: 'alice' }, { id: 'carol' }, { id: 'platform' }],
                    relationships: [],
                    autoLayout: { direction: 'LR' },
                },
            ],
            systemContextViews: [],
            containerViews: [],
            componentViews: [],
            configuration: { styles: { elements: [], relationships: [] } },
        },
    }
}

describe('serializer emits no rejected element/relationship keywords', () => {
    it('never emits location, owner, status, lineStyle or interactionStyle statements', () => {
        const dsl = serializeDSL(makeWorkspace())
        expect(dsl).not.toMatch(/^\s*location\s/m)
        expect(dsl).not.toMatch(/^\s*owner\s/m)
        expect(dsl).not.toMatch(/^\s*status\s/m)
        expect(dsl).not.toMatch(/^\s*lineStyle\s/m)
        expect(dsl).not.toMatch(/^\s*interactionStyle\s/m)
    })
})

describe('External encoding', () => {
    it('an external person with no other block data serializes inline with an External tag, no block', () => {
        const dsl = serializeDSL(makeWorkspace())
        // Carol has no url/owner/status/properties -- only location: External --
        // so she must stay in the inline 3-argument form, not a block.
        expect(dsl).toMatch(/carol = person "Carol" "" "External"\s*$/m)
    })

    it('an element already tagged External plus location External emits External exactly once', () => {
        const dsl = serializeDSL(makeWorkspace())
        const carolLine = dsl.split('\n').find(l => l.includes('person "Carol"'))
        expect(carolLine).toBeDefined()
        const occurrences = (carolLine!.match(/External/g) ?? []).length
        expect(occurrences).toBe(1)
    })
})

describe('owner encoding', () => {
    it('owner appears as an "owner" property inside a properties block', () => {
        const dsl = serializeDSL(makeWorkspace())
        expect(dsl).toContain('"owner" "CX Team"')
        expect(dsl).toContain('"owner" "Platform Team"')
        expect(dsl).toContain('"owner" "Backend Team"')
        expect(dsl).toContain('"owner" "Security Team"')
    })
})

describe('status/lineStyle/interactionStyle encoding', () => {
    it('status appears under the c4hero.status property key', () => {
        const dsl = serializeDSL(makeWorkspace())
        expect(dsl).toContain('"c4hero.status" "Live"')
        expect(dsl).toContain('"c4hero.status" "Deprecated"')
        expect(dsl).toContain('"c4hero.status" "Planned"')
        expect(dsl).toContain('"c4hero.status" "Removed"')
    })

    it('lineStyle and interactionStyle appear under their c4hero.* property keys', () => {
        const dsl = serializeDSL(makeWorkspace())
        expect(dsl).toContain('"c4hero.lineStyle" "Curved"')
        expect(dsl).toContain('"c4hero.interactionStyle" "Asynchronous"')
    })
})

describe('autoLayout rank direction case', () => {
    it('emits lowercase rank direction keywords', () => {
        const dsl = serializeDSL(makeWorkspace())
        expect(dsl).toMatch(/autoLayout lr\b/)
        expect(dsl).not.toMatch(/autoLayout LR\b/)
    })
})

describe('full round-trip fidelity', () => {
    it('parseDSL(serializeDSL(ws)) restores location, owner, status, lineStyle, interactionStyle, tags and user properties', () => {
        const ws = makeWorkspace()
        const dsl = serializeDSL(ws)
        const { workspace: parsed, errors } = parseDSL(dsl)
        expect(errors).toEqual([])

        const alice = parsed.model.people.find(p => p.name === 'Alice')
        expect(alice?.location).toBe('External')
        expect(alice?.owner).toBe('CX Team')
        expect(alice?.status).toBe('Live')
        expect(alice?.properties).toEqual({ department: 'Retail' })
        // External must not also appear as a duplicate user-visible tag.
        expect(alice?.tags).not.toContain('External')

        const carol = parsed.model.people.find(p => p.name === 'Carol')
        expect(carol?.location).toBe('External')
        expect(carol?.tags.filter(t => t === 'External')).toHaveLength(0)

        const platform = parsed.model.softwareSystems.find(s => s.name === 'Platform')
        expect(platform?.location === undefined || platform?.location === 'Internal').toBe(true)
        expect(platform?.owner).toBe('Platform Team')
        expect(platform?.status).toBe('Deprecated')

        const api = platform?.containers.find(c => c.name === 'API')
        expect(api?.owner).toBe('Backend Team')
        expect(api?.status).toBe('Planned')

        const authComp = api?.components.find(c => c.name === 'Auth Component')
        expect(authComp?.owner).toBe('Security Team')
        expect(authComp?.status).toBe('Removed')

        const rel = parsed.model.relationships[0]
        expect(rel?.lineStyle).toBe('Curved')
        expect(rel?.interactionStyle).toBe('Asynchronous')
        expect(rel?.properties).toEqual({ rateLimited: 'true' })

        const view = parsed.views.systemLandscapeViews[0]
        expect(view?.autoLayout?.direction).toBe('LR')
    })

    it('serializeDSL is idempotent: serialize -> parse -> serialize is byte-identical', () => {
        const ws = makeWorkspace()
        const first = serializeDSL(ws)
        const { workspace: parsed, errors } = parseDSL(first)
        expect(errors).toEqual([])
        const second = serializeDSL(parsed)
        expect(second).toBe(first)
    })
})
