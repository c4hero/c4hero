import type { Workspace, View } from '@/types/model'
import { getActiveView, getCreatableTypes } from '@/store/workspace-selectors'
import { scopeAllowsContainers } from '@/lib/scopeValidation'

export const exploreElements = (ws: Workspace) => [...ws.model.people, ...ws.model.softwareSystems.flatMap(s => [s, ...s.containers.flatMap(c => [c, ...c.components])])]

/** A tool scope, never inserted into authored views or emitted as DSL. */
export function editingView(ws: Workspace, key: string | null, mode: string): View | undefined {
  if (mode !== 'explore') return key ? getActiveView(ws, key) : undefined
  const layout = ws.exploreLayout
  return { key: '__explore', type: 'systemLandscape', locked: layout?.locked,
    autoLayout: { direction: layout?.direction ?? 'TB' },
    elements: exploreElements(ws).filter(e => !layout?.hiddenIds?.includes(e.id)).map(e => ({ id: e.id, ...layout?.elements?.[e.id] })),
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
