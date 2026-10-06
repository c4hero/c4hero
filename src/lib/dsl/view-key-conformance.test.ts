// View keys Structurizr accepts, whatever the source file said (TEA-166).
//
// The decision recorded on the ticket is to normalize at the *import*
// boundary rather than at export, so the stored key and the emitted key never
// diverge (the sidecar keys layout data by view key) and the model can never
// hold a key the real parser rejects. Every rewrite is reported as a parse
// warning — the point is that c4hero doesn't do it silently.

import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { derivedViewKeyBase, isConformantViewKey, sanitizeViewKey } from './viewKey'
import { applySidecar, extractSidecar } from '@/lib/sidecar'
import { generateDefaultViews } from './auto-views'
import { validateForStructurizr } from '@/lib/structurizrValidation'
import type { View, Workspace } from '@/types/model'

const BASE = `workspace "T" {
    model {
        p = person "Ops"
        sys1 = softwareSystem "Payments" {
            api = container "API"
        }
    }
    views {
`

function parseViews(viewsBlock: string) {
    const { workspace, errors, warnings } = parseDSL(`${BASE}${viewsBlock}
    }
}
`)
    return { workspace, errors, warnings }
}

function allKeys(ws: Workspace): string[] {
    return [
        ...ws.views.systemLandscapeViews,
        ...ws.views.systemContextViews,
        ...ws.views.containerViews,
        ...ws.views.componentViews,
        ...(ws.views.dynamicViews ?? []),
        ...(ws.views.deploymentViews ?? []),
    ].map(v => v.key)
}

describe('sanitizeViewKey', () => {
    it('folds each run of illegal characters into a single dash', () => {
        expect(sanitizeViewKey('Label 602')).toBe('Label-602')
        expect(sanitizeViewKey('a  b')).toBe('a-b')
        expect(sanitizeViewKey('a.b/c')).toBe('a-b-c')
    })

    it('trims the dashes it would otherwise leave at the edges', () => {
        expect(sanitizeViewKey(' Label ')).toBe('Label')
        expect(sanitizeViewKey('...x...')).toBe('x')
    })

    it('leaves a conformant key exactly as it was', () => {
        expect(sanitizeViewKey('Ctx_sys-1')).toBe('Ctx_sys-1')
    })

    it('returns empty when nothing legal survives', () => {
        expect(sanitizeViewKey('   ')).toBe('')
        expect(sanitizeViewKey('日本語')).toBe('')
    })
})

describe('parsing a non-conformant view key', () => {
    it('normalizes it and says so, instead of carrying it through to the export', () => {
        const { workspace, errors, warnings } = parseViews(`        systemContext sys1 "Label 602" {
            include *
        }`)
        expect(errors).toEqual([])
        expect(allKeys(workspace)).toEqual(['Label-602'])
        expect(warnings.map(w => w.message).join('\n')).toContain('Label 602')
        expect(warnings[0].message).toContain('Label-602')
    })

    it('keeps the authored key as the view\'s label, so nothing is renamed on screen', () => {
        // c4hero shows `title ?? key`. A key written as "Label 602" was being
        // read by a human, so rewriting it alone would silently rename the
        // view — the regression the e2e gauntlet caught.
        const { workspace } = parseViews(`        systemContext sys1 "Label 602" {
            include *
        }`)
        const view = workspace.views.systemContextViews[0]
        expect(view.key).toBe('Label-602')
        expect(view.title).toBe('Label 602')
        // And it survives the round trip as a real title.
        expect(serializeDSL(workspace)).toContain('title "Label 602"')
    })

    it('leaves a view that already has a title alone', () => {
        const { workspace } = parseViews(`        systemContext sys1 "Label 602" "The billing context" {
            include *
        }`)
        expect(workspace.views.systemContextViews[0].title).toBe('The billing context')
    })

    it('keeps the label even when nothing legal survives in the key', () => {
        const { workspace } = parseViews(`        systemContext sys1 "日本語" {
            include *
        }`)
        const view = workspace.views.systemContextViews[0]
        expect(view.key).toBe('SystemContext-sys1')
        expect(view.title).toBe('日本語')
    })

    it('does not drop or corrupt the view itself', () => {
        const { workspace } = parseViews(`        systemContext sys1 "Label 602" {
            include *
        }`)
        const view = workspace.views.systemContextViews[0]
        expect(view.softwareSystemId).toBe('sys1')
        expect(view.elements.length).toBeGreaterThan(0)
    })

    it('points the warning at the view, not at whatever follows its closing brace', () => {
        const { warnings } = parseViews(`        systemContext sys1 "Label 602" {
            include *
        }
        container sys1 "Containers" {
            include *
        }`)
        expect(warnings).toHaveLength(1)
        expect(warnings[0].line).toBe(9) // the `systemContext` line of the composed source
    })

    it('keeps two keys that normalize alike distinct', () => {
        const { workspace } = parseViews(`        systemContext sys1 "Label 602" {
            include *
        }
        container sys1 "Label.602" {
            include *
        }`)
        expect(allKeys(workspace)).toEqual(['Label-602', 'Label-602-2'])
    })

    it('falls back to a generated key when nothing legal survives', () => {
        const { workspace, warnings } = parseViews(`        systemContext sys1 "   " {
            include *
        }`)
        expect(allKeys(workspace)).toEqual(['SystemContext-sys1'])
        expect(warnings[0].message).toContain('no characters Structurizr allows')
    })

    it('normalizes dynamic and deployment view keys the same way', () => {
        const { workspace, warnings } = parseViews(`        dynamic sys1 "Flow 1" {
        }`)
        expect(allKeys(workspace)).toEqual(['Flow-1'])
        expect(warnings).toHaveLength(1)
    })
})

describe('conformant keys are left alone', () => {
    it('round-trips a valid key without a warning', () => {
        const { workspace, warnings } = parseViews(`        systemContext sys1 "Ctx_1-a" {
            include *
        }`)
        expect(allKeys(workspace)).toEqual(['Ctx_1-a'])
        expect(warnings).toEqual([])
        expect(serializeDSL(workspace)).toContain('"Ctx_1-a"')
    })

    it('leaves a duplicate conformant key alone — that is the source file\'s own error', () => {
        const { workspace, warnings } = parseViews(`        systemContext sys1 "Dup" {
            include *
        }
        container sys1 "Dup" {
            include *
        }`)
        expect(allKeys(workspace)).toEqual(['Dup', 'Dup'])
        expect(warnings).toEqual([])
    })
})

describe('a view key c4hero lexes as a keyword (#232)', () => {
    // `deployment`, `component`, … are keywords to c4hero's lexer but plain
    // words to Structurizr, which keys the view with them. Reading one as "no
    // key" ended the header early, and its leftover words started a second
    // view scoped to the description string — saved as DSL Structurizr
    // rejects.
    const MODEL = `workspace "T" {
    model {
        u = person "User"
        sys1 = softwareSystem "Payments" {
            api = container "API" {
                ctrl = component "Controller"
            }
        }
        u -> api "Uses"
        deploymentEnvironment "default" {
            deploymentNode "Server" {
                containerInstance api
            }
        }
    }
    views {
`
    const parseWith = (viewsBlock: string) => parseDSL(`${MODEL}${viewsBlock}
    }
}
`)
    const allViews = (ws: Workspace): View[] => [
        ...ws.views.systemLandscapeViews,
        ...ws.views.systemContextViews,
        ...ws.views.containerViews,
        ...ws.views.componentViews,
        ...(ws.views.dynamicViews ?? []),
        ...(ws.views.deploymentViews ?? []),
    ]

    it.each([
        ['systemLandscape', 'systemLandscape deployment "Everything"', 'deployment', 'Everything', 'include *'],
        ['systemContext', 'systemContext sys1 systemContext "Context"', 'systemContext', 'Context', 'include *'],
        ['container', 'container sys1 component "Containers"', 'component', 'Containers', 'include *'],
        ['component', 'component api container "Components"', 'container', 'Components', 'include *'],
        ['dynamic', 'dynamic sys1 dynamic "Flow"', 'dynamic', 'Flow', 'u -> api "Uses"'],
        ['deployment', 'deployment * "default" deployment "Where it runs"', 'deployment', 'Where it runs', 'include *'],
    ])('keeps a %s view in one piece, with its key and body', (type, header, key, description, body) => {
        const { workspace, errors, warnings } = parseWith(`        ${header} {
            ${body}
            autoLayout lr
        }`)
        expect(errors).toEqual([])
        expect(warnings).toEqual([])
        const views = allViews(workspace)
        expect(views).toHaveLength(1)
        const [view] = views
        expect(view).toMatchObject({ type, key, description, autoLayout: { direction: 'LR' } })
        expect(view.autoKey).toBeUndefined()
        expect(view.elements.length).toBeGreaterThan(0)

        // The serializer quotes every key, so the keyword cannot be misread
        // on the way back in either. A header description may follow it.
        const saved = serializeDSL(workspace)
        expect(saved).toMatch(new RegExp(`"${key}"( "[^"]*")? \\{`))
        const reparsed = parseDSL(saved)
        expect(reparsed.errors).toEqual([])
        expect(allViews(reparsed.workspace).map(v => [v.type, v.key, v.description, v.elements.length]))
            .toEqual([[type, key, description, view.elements.length]])
    })

    it('reads a deployment environment written as a keyword word', () => {
        const { workspace, errors } = parseWith(`        deployment * default deployment {
            include *
        }`)
        expect(errors).toEqual([])
        expect(workspace.views.deploymentViews).toHaveLength(1)
        expect(workspace.views.deploymentViews[0]).toMatchObject({ environment: 'default', key: 'deployment' })
        expect(serializeDSL(workspace)).toContain('deployment * "default" "deployment" {')
    })

    it('skips custom and filtered views keyed with a keyword, leaving the views around them alone', () => {
        // Neither is modelled. Skipping only the header's string/identifier
        // words stopped at the keyword key, which then started a view.
        const { workspace, errors } = parseWith(`        custom deployment "Title" {
            autoLayout lr
        }
        systemContext sys1 ctx {
            include *
        }
        filtered ctx exclude "Person" container
        container sys1 cnt {
            include *
        }`)
        expect(errors).toEqual([])
        expect(allViews(workspace).map(v => [v.type, v.key])).toEqual([['systemContext', 'ctx'], ['container', 'cnt']])
    })

    it('reports a header it cannot read up to `{` instead of splitting the view', () => {
        // `extra` is a fifth header word — Structurizr rejects it too ("Too
        // many tokens"). Recovery skips to the header's own `{`, so the body
        // stays with its view and the next view is untouched.
        const { workspace, errors } = parseWith(`        systemContext sys1 ctx "Context" extra {
            include *
        }
        container sys1 cnt {
            include *
        }`)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toBe('Expected \'{\' after the view header, got IDENTIFIER \'extra\'')
        expect(errors[0].line).toBe(17)
        expect(allViews(workspace).map(v => [v.type, v.key, v.elements.length > 0]))
            .toEqual([['systemContext', 'ctx', true], ['container', 'cnt', true]])
    })

    it('finds a stray header word behind a comment', () => {
        // Structurizr rejects this header too. The comment used to hide
        // `extra`, so recovery never reached the header's `{` and the body
        // was skipped.
        const { workspace, errors } = parseWith(`        systemContext sys1 ctx /* note */ extra {
            include *
        }`)
        expect(errors.map(e => e.message)).toEqual(['Expected \'{\' after the view header, got IDENTIFIER \'extra\''])
        expect(workspace.views.systemContextViews[0].elements.length).toBeGreaterThan(0)
    })

    it('reports a header with no `{` without swallowing the next view', () => {
        const { workspace, errors } = parseWith(`        systemLandscape everything
        systemContext sys1 ctx {
            include *
        }`)
        expect(errors.map(e => e.message)).toEqual(['Expected \'{\' after the view header, got KEYWORD \'systemContext\''])
        expect(allViews(workspace).map(v => [v.type, v.key])).toEqual([['systemLandscape', 'everything'], ['systemContext', 'ctx']])
        expect(workspace.views.systemContextViews[0].elements.length).toBeGreaterThan(0)
    })

    it.each([
        ['on the line after the header', 'systemContext sys1 ctx\n        {'],
        ['after a line comment', 'systemContext sys1 ctx // note\n        {'],
        ['after a block comment', 'systemContext sys1 ctx /* note */ {'],
    ])('still accepts the `{` %s', (_where, header) => {
        const { workspace, errors } = parseWith(`        ${header}
            include *
        }`)
        expect(errors).toEqual([])
        expect(workspace.views.systemContextViews[0].elements.length).toBeGreaterThan(0)
    })

    it('reads a quoted dynamic view scope, as the other view types do', () => {
        // Structurizr reads the first header word as the scope, quoted or
        // not. Read as the key instead, `"sys1"` left `k` stray and the body
        // landed on an unscoped view, whose step to a container Structurizr
        // rejected on save.
        const { workspace, errors } = parseWith(`        dynamic "sys1" k {
            u -> api "Uses"
        }`)
        expect(errors).toEqual([])
        expect(workspace.views.dynamicViews.map(v => [v.softwareSystemId, v.key, v.relationships.length]))
            .toEqual([['sys1', 'k', 1]])
        expect(serializeDSL(workspace)).toContain('dynamic sys1 "k" {')
    })

    it('quotes a scope it could not resolve, so the save reads back as the same header', () => {
        // Written raw, `Containers of A` came back as a scope, a key and a
        // stray word. Structurizr strips the quotes, so it still reads the
        // same (unknown) scope.
        const { workspace } = parseWith(`        container "Containers of A" cnt {
            include *
        }
        dynamic "Some Flow" flow {
        }`)
        const saved = serializeDSL(workspace)
        expect(saved).toContain('container "Containers of A" "cnt" {')
        expect(saved).toContain('dynamic "Some Flow" "flow" {')
        const reparsed = parseDSL(saved)
        expect(reparsed.errors).toEqual([])
        expect(allViews(reparsed.workspace).map(v => [v.type, v.softwareSystemId, v.key]))
            .toEqual([['container', 'Containers of A', 'cnt'], ['dynamic', 'Some Flow', 'flow']])
    })
})

describe('keys c4hero generates are conformant by construction', () => {
    it('derives a key from the element ref without inheriting its punctuation', () => {
        const { workspace } = parseViews(`        systemContext sys1 {
            include *
        }
        container sys1 {
            include *
        }`)
        for (const key of allKeys(workspace)) expect(isConformantViewKey(key)).toBe(true)
        expect(allKeys(workspace)).toEqual(['SystemContext-sys1', 'Containers-sys1'])
    })

    it('sanitizes the base of an auto-generated default view key', () => {
        // generateDefaultViews embeds element ids in the key. Ids are
        // constrained today; this keeps that from being a rule the key
        // generator silently depends on.
        const ws: Workspace = {
            name: 'T',
            model: {
                people: [],
                softwareSystems: [{
                    id: 'my sys.1', type: 'softwareSystem', name: 'S',
                    tags: ['Element', 'Software System'], properties: {}, containers: [],
                }],
                relationships: [], groups: [], deploymentEnvironments: [],
            },
            views: {
                systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
                dynamicViews: [], deploymentViews: [],
                configuration: { styles: { elements: [], relationships: [] } },
            },
        }
        generateDefaultViews(ws)
        const keys = allKeys(ws)
        expect(keys.length).toBeGreaterThan(0)
        for (const key of keys) expect(isConformantViewKey(key)).toBe(true)
        expect(keys).toContain('SystemContext-my-sys-1')
    })
})

describe('generated and parsed views derive keys the same way (TEA-344)', () => {
    it('builds a derived key from the sanitized ref, not by sanitizing the composed key', () => {
        expect(derivedViewKeyBase('container', 'payments')).toBe('Containers-payments')
        expect(derivedViewKeyBase('container', '-x')).toBe('Containers-x')
        expect(derivedViewKeyBase('systemContext', 'my sys.1')).toBe('SystemContext-my-sys-1')
        expect(derivedViewKeyBase('systemLandscape', undefined)).toBe('SystemLandscape')
        expect(derivedViewKeyBase('component', '...')).toBe('Components')
    })

    it('gives every generated view the key the parser derives for its type and scope', () => {
        // Awkward ids on purpose: a leading or trailing dash is where sanitizing
        // the whole key and sanitizing only the ref used to disagree.
        const el = (id: string, type: 'softwareSystem' | 'container' | 'component') => ({
            id, type, name: id, tags: ['Element'], properties: {},
        })
        const ws: Workspace = {
            name: 'T',
            model: {
                people: [],
                softwareSystems: ['-x', 'y-', 'a.b', 'plain'].map((id) => ({
                    ...el(id, 'softwareSystem'),
                    containers: [{ ...el(`${id}-api`, 'container'), components: [el(`-${id}-c`, 'component')] }],
                })),
                relationships: [], groups: [], deploymentEnvironments: [],
            },
            views: {
                systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
                dynamicViews: [], deploymentViews: [],
                configuration: { styles: { elements: [], relationships: [] } },
            },
        } as unknown as Workspace
        generateDefaultViews(ws)
        const views = [
            ...ws.views.systemLandscapeViews, ...ws.views.systemContextViews,
            ...ws.views.containerViews, ...ws.views.componentViews,
        ]
        expect(views.length).toBe(13)
        for (const view of views) {
            expect(view.key).toBe(derivedViewKeyBase(view.type, view.containerId ?? view.softwareSystemId))
        }
    })
})

describe('the validator backstops every other path into the store', () => {
    it('flags a key that did not come through the DSL parser', () => {
        const { workspace } = parseViews(`        systemContext sys1 "Ctx" {
            include *
        }`)
        // e.g. a JSON workspace, an AI edit plan, or a hand-edited sidecar.
        workspace.views.systemContextViews[0].key = 'Label 602'
        expect(validateForStructurizr(workspace).map(w => w.code)).toEqual(['view-key-charset'])
    })
})

describe('a minted key never collides with one authored later in the file', () => {
    it('steps around an authored key that the parser has not reached yet', () => {
        // "Label 602" normalizes to Label-602 — which the *next* view already
        // claims verbatim. A forward-only pass would produce two Label-602s:
        // Structurizr rejects the export, and the sidecar merges the two
        // views' layouts because it keys on the view key.
        const { workspace } = parseViews(`        systemContext sys1 "Label 602" {
            include *
        }
        container sys1 "Label-602" {
            include *
        }`)
        expect(allKeys(workspace)).toEqual(['Label-602-2', 'Label-602'])
        expect(new Set(allKeys(workspace)).size).toBe(2)
    })

    it('steps around an authored key a derived key would otherwise take', () => {
        const { workspace } = parseViews(`        systemContext sys1 {
            include *
        }
        container sys1 "SystemContext-sys1" {
            include *
        }`)
        expect(allKeys(workspace)).toEqual(['SystemContext-sys1-2', 'SystemContext-sys1'])
    })
})

describe('layout migration for normalized view keys', () => {
    it.each(['Billing Context', '東京'])('retains layout and locks through save/reload for %s', key => {
        const { workspace } = parseViews(`systemContext sys1 "${key}" {
 include *
}`)
        const saved = { locked: true, elements: { sys1: { pinned: true, locked: true, x: 420, y: 200 } } }
        applySidecar(workspace, { version: 1, views: { [key]: saved } })
        const view = workspace.views.systemContextViews[0]
        expect(view.locked).toBe(true)
        expect(view.elements.find(el => el.id === 'sys1')).toMatchObject(saved.elements.sys1)
        const migrated = extractSidecar(workspace)!
        expect(migrated.views?.[key]).toBeUndefined()
        expect(migrated.views?.[view.key]).toEqual(saved)
        const reloaded = parseDSL(serializeDSL(workspace)).workspace
        applySidecar(reloaded, migrated)
        expect(reloaded.views.systemContextViews[0].locked).toBe(true)
        expect(reloaded.views.systemContextViews[0].elements.find(el => el.id === 'sys1')).toMatchObject(saved.elements.sys1)
    })

    it('keeps colliding authored views separate and prefers migrated data', () => {
        const { workspace } = parseViews(`systemContext sys1 "Billing Context" {
 include *
}
            systemContext sys1 "Billing-Context" {
 include *
}`)
        const old = { elements: { sys1: { pinned: true, x: 100, y: 200 } } }
        const other = { elements: { sys1: { pinned: true, x: 300, y: 400 } } }
        applySidecar(workspace, { version: 1, views: { 'Billing Context': old, 'Billing-Context': other } })
        const [renamed, authored] = workspace.views.systemContextViews
        expect(renamed.key).toBe('Billing-Context-2')
        expect(renamed.elements.find(el => el.id === 'sys1')?.x).toBe(100)
        expect(authored.elements.find(el => el.id === 'sys1')?.x).toBe(300)
        applySidecar(workspace, { version: 1, views: { 'Billing Context': old, [renamed.key]: other } })
        expect(renamed.elements.find(el => el.id === 'sys1')?.x).toBe(300)
    })
})
