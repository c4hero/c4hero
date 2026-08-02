/**
 * End-to-end parse of a large landscape written with hierarchical identifiers.
 *
 * The fixture mirrors a real IcePanel -> Structurizr DSL export (see the header
 * comment in the .dsl file). Before qualified identifiers were supported this
 * file parsed to 66 of its 239 relationships with zero errors reported, and
 * every container view rendered without a single edge.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import landscapeDsl from './__fixtures__/hierarchical-landscape.dsl?raw'

/** Relationship statements in the `model { }` block of the fixture source. */
function countModelRelationshipStatements(dsl: string): number {
    const modelBlock = dsl.slice(0, dsl.indexOf('\n    views {'))
    return modelBlock
        .split('\n')
        .filter(line => line.includes('->'))
        .filter(line => {
            const trimmed = line.trim()
            return !trimmed.startsWith('#') && !trimmed.startsWith('//') && !trimmed.startsWith('*')
        })
        .length
}

describe('IcePanel-style landscape with hierarchical identifiers', () => {
    const { workspace, errors } = parseDSL(landscapeDsl)
    const model = workspace.model

    const allElementIds = new Set<string>()
    for (const person of model.people) allElementIds.add(person.id)
    for (const sys of model.softwareSystems) {
        allElementIds.add(sys.id)
        for (const container of sys.containers) {
            allElementIds.add(container.id)
            for (const component of container.components) allElementIds.add(component.id)
        }
    }

    it('parses without errors', () => {
        expect(errors).toEqual([])
    })

    it('parses every relationship statement in the model block', () => {
        expect(countModelRelationshipStatements(landscapeDsl)).toBe(239)
        expect(model.relationships).toHaveLength(239)
    })

    it('resolves every relationship endpoint to a real element', () => {
        const dangling = model.relationships.filter(
            r => !allElementIds.has(r.sourceId) || !allElementIds.has(r.destinationId)
        )
        expect(dangling).toEqual([])
    })

    it('gives every element a unique id despite variable names reused across scopes', () => {
        const counted = [
            ...model.people.map(p => p.id),
            ...model.softwareSystems.flatMap(s => [
                s.id,
                ...s.containers.flatMap(c => [c.id, ...c.components.map(k => k.id)]),
            ]),
        ]
        expect(new Set(counted).size).toBe(counted.length)
    })

    it('keeps container-level and component-level edges, not just system-level ones', () => {
        const containerIds = new Set(
            model.softwareSystems.flatMap(s => s.containers.map(c => c.id))
        )
        const componentIds = new Set(
            model.softwareSystems.flatMap(s => s.containers.flatMap(c => c.components.map(k => k.id)))
        )
        const touches = (ids: Set<string>) =>
            model.relationships.filter(r => ids.has(r.sourceId) || ids.has(r.destinationId)).length

        // Everything below the system level used to be dropped: these two
        // counts were 0 before qualified identifiers were supported.
        expect(touches(containerIds)).toBe(147)
        expect(touches(componentIds)).toBe(73)
    })

    it('preserves the description on relationships with a dotted destination', () => {
        // `actor1 -> sys3.app48 "..."` — the dotted segment used to occupy the
        // positional description slot.
        const dotted = model.relationships.filter(r => r.sourceId.startsWith('actor'))
        expect(dotted.length).toBeGreaterThan(0)
        expect(dotted.every(r => r.description !== undefined)).toBe(true)
    })

    it('draws edges in the container views of the four most connected systems', () => {
        const views = workspace.views.containerViews.filter(v =>
            ['sys1', 'sys2', 'sys3', 'sys4'].includes(v.softwareSystemId ?? '')
        )
        expect(views).toHaveLength(4)
        for (const view of views) {
            expect(view.elements.length).toBeGreaterThan(0)
            expect(view.relationships.length).toBeGreaterThan(0)
        }
    })

    it('binds every component view to a container, keeping its declared key', () => {
        const containerIds = new Set(
            model.softwareSystems.flatMap(s => s.containers.map(c => c.id))
        )
        const componentViews = workspace.views.componentViews
        expect(componentViews).toHaveLength(16)
        for (const view of componentViews) {
            expect(containerIds.has(view.containerId ?? '')).toBe(true)
            expect(view.autoKey).toBeUndefined()
            expect(view.elements.length).toBeGreaterThan(0)
        }
    })

    it('roundtrips through the serializer without drift', () => {
        const emitted = serializeDSL(workspace)
        const reparsed = parseDSL(emitted)
        expect(reparsed.errors).toEqual([])
        expect(serializeDSL(reparsed.workspace)).toBe(emitted)
        expect(reparsed.workspace.model.relationships).toHaveLength(239)
        expect(reparsed.workspace.model.relationships.map(r => [r.sourceId, r.destinationId, r.description]))
            .toEqual(model.relationships.map(r => [r.sourceId, r.destinationId, r.description]))
    })
})
