import type { Workspace, View, ModelElement, Relationship } from '@/types/model'
import { allViewsOf, findViewHelper, findElementHelper, getElementIndex } from './workspace-helpers'
const relationshipMapCache = new WeakMap<Workspace, Map<string, Relationship>>()

function getFirstViewKey(workspace: Workspace): string | null {
  return allViewsOf(workspace)[0]?.key ?? null
}

export function getAllViews(workspace: Workspace): View[] {
  return allViewsOf(workspace)
}

export function getActiveView(workspace: Workspace, key: string): View | undefined {
  return findViewHelper(workspace, key)
}

export function buildElementMap(workspace: Workspace): Map<string, ModelElement> {
  // Reuse the workspace-scoped element index from workspace-helpers — same
  // shape, same cache, no need to maintain two parallel structures.
  return getElementIndex(workspace)
}

export function buildRelationshipMap(workspace: Workspace): Map<string, Relationship> {
  const cached = relationshipMapCache.get(workspace)
  if (cached) return cached
  const map = new Map<string, Relationship>()
  for (const rel of workspace.model.relationships) {
    map.set(rel.id, rel)
  }
  relationshipMapCache.set(workspace, map)
  return map
}

export function getSelectedElement(
  workspace: Workspace,
  selectedIds: string[],
): ModelElement | undefined {
  if (selectedIds.length === 0) return undefined
  return findElementHelper(workspace, selectedIds[0])
}

export function getRelationshipById(
  workspace: Workspace,
  id: string,
): Relationship | undefined {
  return workspace.model.relationships.find(r => r.id === id)
}

function findChildView(workspace: Workspace, elementId: string, currentViewKey?: string | null): View | undefined {
  const element = findElementHelper(workspace, elementId)
  if (!element) return undefined

  if (element.type === 'softwareSystem') {
    const container = workspace.views.containerViews.find(v => v.softwareSystemId === elementId)
    if (container) return container
    const context = workspace.views.systemContextViews.find(v => v.softwareSystemId === elementId)
    if (context && context.key !== currentViewKey) return context
    return undefined
  }
  if (element.type === 'container') {
    return workspace.views.componentViews.find(v => v.containerId === elementId)
  }
  return undefined
}

export function canDrillInto(workspace: Workspace, elementId: string): boolean {
  return findChildView(workspace, elementId) !== undefined
}

/** Determine whether an element can be "zoomed into". Unlike canDrillInto, this
 *  does NOT require a child view (or even child elements) to exist — the zoom-in
 *  flow prompts to create one, and empty views are a valid starting point for
 *  adding the first containers/components. */
export function getZoomTarget(
  workspace: Workspace,
  elementId: string,
): { elementName: string; targetType: 'container' | 'component' } | null {
  const element = findElementHelper(workspace, elementId)
  if (!element) return null
  if (element.type === 'softwareSystem' && element.location !== 'External') {
    return { elementName: element.name, targetType: 'container' }
  }
  if (element.type === 'container') {
    return { elementName: element.name, targetType: 'component' }
  }
  return null
}

export function getBreadcrumb(workspace: Workspace, viewHistory: string[], activeViewKey: string | null): { key: string; label: string }[] {
  const trail: { key: string; label: string }[] = []
  for (const key of viewHistory) {
    const view = getActiveView(workspace, key)
    if (view) trail.push({ key, label: view.title ?? view.key })
  }
  if (activeViewKey) {
    const view = getActiveView(workspace, activeViewKey)
    if (view) trail.push({ key: activeViewKey, label: view.title ?? activeViewKey })
  }
  return trail
}

/** Determine what element types can be created in the current view context */
export function getCreatableTypes(workspace: Workspace, activeViewKey: string | null): {
  canCreatePerson: boolean
  canCreateSystem: boolean
  canCreateContainer: string | null
  canCreateComponent: string | null
} {
  const result = { canCreatePerson: false, canCreateSystem: false, canCreateContainer: null as string | null, canCreateComponent: null as string | null }
  if (!activeViewKey) return result
  const view = getActiveView(workspace, activeViewKey)
  if (!view) return result

  switch (view.type) {
    case 'systemLandscape':
      result.canCreatePerson = true
      result.canCreateSystem = true
      break
    case 'systemContext':
      result.canCreatePerson = true
      result.canCreateSystem = true
      break
    case 'container':
      result.canCreatePerson = true
      result.canCreateSystem = true
      result.canCreateContainer = view.softwareSystemId ?? null
      break
    case 'component':
      result.canCreateComponent = view.containerId ?? null
      break
  }
  return result
}

export { getFirstViewKey, findChildView as findChildViewHelper }

/**
 * The focal-scope element ID for `view` — the element the view is *about*:
 * the system whose context/containers a view shows, or the container whose
 * components a view shows. Returns undefined for landscape views (no focal
 * element) and for unknown view shapes.
 *
 * Single source of truth — every focal-scope check (Backspace guard, Trash
 * guard, AddElementPanel filter, removeElementsFromView guard, deleteElements
 * defense-in-depth) routes through here so the rule can never quietly drift.
 */
export function getFocalScopeId(view: View | undefined): string | undefined {
  if (!view) return undefined
  switch (view.type) {
    case 'systemContext':
    case 'container':
      return view.softwareSystemId
    case 'component':
      return view.containerId
    default:
      return undefined
  }
}

/**
 * True when `elementId` is the focal scope of the view identified by
 * `viewKey`. Thin wrapper over `getFocalScopeId` — kept for the call sites
 * that already have workspace + viewKey + elementId at hand.
 */
export function isFocalScopeElement(
  workspace: Workspace,
  viewKey: string,
  elementId: string,
): boolean {
  return getFocalScopeId(getActiveView(workspace, viewKey)) === elementId
}
