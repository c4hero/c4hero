import { randomUUID } from 'node:crypto'
import type { EditActions } from '@/lib/ai/operations'
import type { Workspace, ModelElement, View } from '@/types/model'
import { deriveIdFromName, uniqueDerivedId } from '@/lib/identifier'
import {
  allViewsOf, appendScopedView, applyElementPatch, cascadeDeleteElements,
  collectTakenIds, findElementHelper, invalidateElementIndex, materializeAutoViews,
  restoreViewElement, uniqueElementName,
} from '@/store/workspace-helpers'

/** Mutable, isolated model adapter: no Zustand, browser globals or UI state.
 * IDs are pinned for the duration of a plan (and in the saved DSL), so a rename
 * cannot invalidate later operations referring to the same element. */
export function createEditActions(ws: Workspace): EditActions {
  const base = (name: string, tag: string) => {
    name = uniqueElementName(name, ws)
    const taken = collectTakenIds(ws)
    return {
      id: uniqueDerivedId(deriveIdFromName(name), id => taken.has(id)),
      name, tags: ['Element', tag], properties: {},
    }
  }
  const element = (id: string): ModelElement => {
    const found = findElementHelper(ws, id)
    if (!found) throw new Error(`Element ${id} no longer exists in this plan`)
    return found
  }
  const place = (id: string, views: View[]) => {
    invalidateElementIndex(ws)
    for (const view of views) {
      if (!view.elements.some(e => e.id === id)) view.elements.push(restoreViewElement(ws, view.key, id))
    }
  }
  const newView = (type: Parameters<EditActions['addView']>[0], scope: string | undefined, title?: string) => {
    materializeAutoViews(ws)
    const taken = new Set([...allViewsOf(ws).map(v => v.key), ...Object.keys(ws.savedLayout ?? {})])
    const key = uniqueDerivedId(deriveIdFromName(title ?? `${type}-${scope ?? 'model'}`), k => taken.has(k))
    appendScopedView(ws, type, scope, title ?? `New ${type} view`, key)
    return key
  }
  return {
    addPerson(name) {
      const person = { ...base(name, 'Person'), type: 'person' as const, location: 'Internal' as const }
      ws.model.people.push(person)
      place(person.id, ws.views.systemLandscapeViews)
      return person.id
    },
    addSoftwareSystem(name, external) {
      const system = { ...base(name, 'Software System'), type: 'softwareSystem' as const,
        location: external ? 'External' as const : 'Internal' as const, containers: [] }
      ws.model.softwareSystems.push(system)
      place(system.id, ws.views.systemLandscapeViews)
      return system.id
    },
    addContainer(parent, name) {
      const system = element(parent)
      if (system.type !== 'softwareSystem') throw new Error('Container parent must be a software system')
      const container = { ...base(name, 'Container'), type: 'container' as const, components: [] }
      system.containers.push(container)
      const views = ws.views.containerViews.filter(v => v.softwareSystemId === parent)
      place(container.id, views)
      if (!views.length) newView('container', parent, `${system.name} — Containers`)
      return container.id
    },
    addComponent(parent, name) {
      const container = element(parent)
      if (container.type !== 'container') throw new Error('Component parent must be a container')
      const component = { ...base(name, 'Component'), type: 'component' as const }
      container.components.push(component)
      const views = ws.views.componentViews.filter(v => v.containerId === parent)
      place(component.id, views)
      if (!views.length) newView('component', parent, `${container.name} — Components`)
      return component.id
    },
    addRelationship(sourceId, destinationId, description, technology) {
      element(sourceId)
      element(destinationId)
      const taken = collectTakenIds(ws)
      const id = uniqueDerivedId(`rel_${randomUUID().replaceAll('-', '')}`, value => taken.has(value))
      ws.model.relationships.push({ id, sourceId, destinationId, description, technology, tags: ['Relationship'], properties: {} })
      for (const view of ws.views.systemContextViews) {
        if (view.softwareSystemId === sourceId) place(destinationId, [view])
        if (view.softwareSystemId === destinationId) place(sourceId, [view])
      }
      for (const view of allViewsOf(ws)) {
        if (view.type === 'dynamic' || view.type === 'deployment') continue
        const excluded = new Set(view.excludedRelationshipIds ?? [])
        if (ws.model.relationships.some(r => excluded.has(r.id) && r.sourceId === sourceId && r.destinationId === destinationId)) continue
        if (view.elements.some(e => e.id === sourceId) && view.elements.some(e => e.id === destinationId)) {
          view.relationships.push({ id })
        }
      }
      return id
    },
    updateElement(id, patch) {
      element(id)
      // The shared applier can supply undefined optional fields after creation.
      // Only explicitly supplied values should replace existing model data.
      applyElementPatch(ws, id, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)))
    },
    updateRelationship(id, patch) {
      const relationship = ws.model.relationships.find(r => r.id === id)
      if (!relationship) throw new Error(`Relationship ${id} no longer exists in this plan`)
      Object.assign(relationship, patch)
    },
    deleteElement(id) {
      element(id)
      cascadeDeleteElements(ws, [id])
    },
    addView: newView,
  }
}
