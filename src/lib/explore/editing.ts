import type { Workspace, View } from '@/types/model'
import { getActiveView, getCreatableTypes } from '@/store/workspace-selectors'
import { scopeAllowsContainers } from '@/lib/scopeValidation'

export function supportsSemanticZoom(view?: View) {
  return !!view && ['systemLandscape', 'systemContext', 'container', 'component'].includes(view.type)
}

export function zoomLayoutOwner(ws: Workspace, key: string | null) {
  return (key ? getActiveView(ws, key) : undefined) ?? ws
}

export function zoomElements(ws: Workspace, view?: View) {
  const all = exploreElements(ws)
  if (!view) return all
  const included = new Set(view.elements.map(e => e.id))
  // Focal scope is a boundary in container/component views, not a root card.
  if (view.type === 'container') included.delete(view.softwareSystemId ?? '')
  if (view.type === 'component') included.delete(view.containerId ?? '')
  for (const element of all) {
    if (!included.has(element.id)) continue
    if (element.type === 'softwareSystem') for (const c of element.containers) included.add(c.id)
    if (element.type === 'container') for (const c of element.components) included.add(c.id)
  }
  return all.filter(e => included.has(e.id))
}

export const exploreElements = (ws: Workspace) => [...ws.model.people, ...ws.model.softwareSystems.flatMap(s => [s, ...s.containers.flatMap(c => [c, ...c.components])])]

/** A tool scope, never inserted into authored views or emitted as DSL. */
export function editingView(ws: Workspace, key: string | null, mode: string): View | undefined {
  if (mode !== 'explore') return key ? getActiveView(ws, key) : undefined
  const authored = key ? getActiveView(ws, key) : undefined
  const layout = zoomLayoutOwner(ws, key).exploreLayout
  return { ...authored, key: key ?? '__explore', type: authored?.type ?? 'systemLandscape', locked: authored?.locked || layout?.locked,
    autoLayout: { direction: layout?.direction ?? 'TB' },
    elements: zoomElements(ws, authored).filter(e => !layout?.hiddenIds?.includes(e.id)).map(e => ({ id: e.id, ...(authored?.elements.find(root => root.id === e.id) ?? layout?.elements?.[e.id]) })),
    relationships: ws.model.relationships.map(r => ({ id: r.id })) }
}

export function creatableTypes(ws: Workspace, key: string | null, mode: string, selected: string[]) {
  if (mode !== 'explore') return getCreatableTypes(ws, key)
  const id = selected[0]
  const system = ws.model.softwareSystems.find(s => s.id === id || s.containers.some(c => c.id === id || c.components.some(m => m.id === id)))
  const container = system?.containers.find(c => c.id === id || c.components.some(m => m.id === id))
  return { canCreatePerson: true, canCreateSystem: true,
    canCreateContainer: scopeAllowsContainers(ws.scope) ? system?.id ?? null : null,
    canCreateComponent: scopeAllowsContainers(ws.scope) ? container?.id ?? null : null }
}
