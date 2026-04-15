import type { Workspace, ElementInView, ModelElement } from '@/types/model'

/** Generate sensible default views for a workspace that has none.
 *
 *  Mirrors the convention Structurizr CLI uses when --views isn't specified:
 *  one SystemLandscape view, one SystemContext view per software system, one
 *  Container view per system that has containers, and one Component view per
 *  container that has components. Element population follows the same rules as
 *  the workspace store's `addView` action.
 *
 *  Generated views are flagged with `autoView: true` so the serializer can
 *  skip them and the source DSL roundtrips byte-identical. */
export function generateDefaultViews(ws: Workspace): void {
    const hasViews =
        ws.views.systemLandscapeViews.length > 0 ||
        ws.views.systemContextViews.length > 0 ||
        ws.views.containerViews.length > 0 ||
        ws.views.componentViews.length > 0
    if (hasViews) return

    const allElements = collectAllElementsById(ws)
    const findElement = (id: string): ModelElement | undefined => allElements.get(id)

    const usedKeys = new Set<string>()
    const claim = (base: string): string => {
        let candidate = base
        let suffix = 2
        while (usedKeys.has(candidate)) candidate = `${base}-${suffix++}`
        usedKeys.add(candidate)
        return candidate
    }

    // 1. SystemLandscape — all people + all software systems.
    if (ws.model.people.length > 0 || ws.model.softwareSystems.length > 0) {
        const elements: ElementInView[] = [
            ...ws.model.people.map(p => ({ id: p.id })),
            ...ws.model.softwareSystems.map(s => ({ id: s.id })),
        ]
        ws.views.systemLandscapeViews.push({
            type: 'systemLandscape',
            key: claim('SystemLandscape'),
            autoView: true,
            autoKey: true,
            title: 'System Landscape',
            elements,
            relationships: relationshipsBetween(ws, elements),
            autoLayout: { direction: 'TB' },
        })
    }

    // 2. SystemContext — one per software system.
    for (const sys of ws.model.softwareSystems) {
        const relatedIds = relationshipNeighbours(ws, [sys.id])
        const elements: ElementInView[] = [
            { id: sys.id },
            ...ws.model.people.filter(p => relatedIds.has(p.id)).map(p => ({ id: p.id })),
            ...ws.model.softwareSystems
                .filter(s => s.id !== sys.id && relatedIds.has(s.id))
                .map(s => ({ id: s.id })),
        ]
        ws.views.systemContextViews.push({
            type: 'systemContext',
            key: claim(`SystemContext-${sys.id}`),
            autoView: true,
            autoKey: true,
            title: `${sys.name} - System Context`,
            softwareSystemId: sys.id,
            elements,
            relationships: relationshipsBetween(ws, elements),
            autoLayout: { direction: 'TB' },
        })
    }

    // 3. Container — one per software system that has containers.
    for (const sys of ws.model.softwareSystems) {
        if (sys.containers.length === 0) continue
        const containerIds = sys.containers.map(c => c.id)
        const relatedIds = relationshipNeighbours(ws, containerIds)
        const elements: ElementInView[] = [
            ...sys.containers.map(c => ({ id: c.id })),
            ...ws.model.people.filter(p => relatedIds.has(p.id)).map(p => ({ id: p.id })),
            ...ws.model.softwareSystems
                .filter(s => s.id !== sys.id && relatedIds.has(s.id))
                .map(s => ({ id: s.id })),
        ]
        ws.views.containerViews.push({
            type: 'container',
            key: claim(`Containers-${sys.id}`),
            autoView: true,
            autoKey: true,
            title: `${sys.name} - Containers`,
            softwareSystemId: sys.id,
            elements,
            relationships: relationshipsBetween(ws, elements),
            autoLayout: { direction: 'TB' },
        })
    }

    // 4. Component — one per container that has components.
    for (const sys of ws.model.softwareSystems) {
        for (const container of sys.containers) {
            if (container.components.length === 0) continue
            const componentIds = container.components.map(c => c.id)
            const relatedIds = relationshipNeighbours(ws, componentIds)
            const elements: ElementInView[] = [
                ...container.components.map(c => ({ id: c.id })),
                ...Array.from(relatedIds)
                    .filter(id => findElement(id) !== undefined)
                    .map(id => ({ id })),
            ]
            ws.views.componentViews.push({
                type: 'component',
                key: claim(`Components-${container.id}`),
                autoView: true,
                autoKey: true,
                title: `${container.name} - Components`,
                containerId: container.id,
                elements,
                relationships: relationshipsBetween(ws, elements),
                autoLayout: { direction: 'TB' },
            })
        }
    }
}

function collectAllElementsById(ws: Workspace): Map<string, ModelElement> {
    const map = new Map<string, ModelElement>()
    for (const p of ws.model.people) map.set(p.id, p)
    for (const s of ws.model.softwareSystems) {
        map.set(s.id, s)
        for (const c of s.containers) {
            map.set(c.id, c)
            for (const comp of c.components) map.set(comp.id, comp)
        }
    }
    return map
}

function relationshipNeighbours(ws: Workspace, ids: string[]): Set<string> {
    const idSet = new Set(ids)
    const neighbours = new Set<string>()
    for (const r of ws.model.relationships) {
        if (idSet.has(r.sourceId)) neighbours.add(r.destinationId)
        if (idSet.has(r.destinationId)) neighbours.add(r.sourceId)
    }
    return neighbours
}

function relationshipsBetween(ws: Workspace, elements: ElementInView[]): { id: string }[] {
    const idSet = new Set(elements.map(e => e.id))
    return ws.model.relationships
        .filter(r => idSet.has(r.sourceId) && idSet.has(r.destinationId))
        .map(r => ({ id: r.id }))
}
