// View keys Structurizr accepts, whatever the source file said (TEA-166).
//
// The decision recorded on the ticket is to normalize at the *import*
// boundary rather than at export, so the stored key and the emitted key never
// diverge (the sidecar keys layout data by view key) and the model can never
// hold a key the real parser rejects. Every rewrite is reported as a parse
// warning — the point is that c4hero doesn't do it silently.

import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { isConformantViewKey, sanitizeViewKey } from './viewKey'
import { applySidecar, extractSidecar } from '@/lib/sidecar'
import { generateDefaultViews } from './auto-views'
import { validateForStructurizr } from '@/lib/structurizrValidation'
import type { Workspace } from '@/types/model'

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
