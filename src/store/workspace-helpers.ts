import type {
  Workspace, View, ModelElement, Person, SoftwareSystem, Container, Component,
} from '@/types/model'

/** Get flat array of all views */
export function allViewsOf(ws: Workspace): View[] {
  return [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
  ]
}

/** Find a view by key inside a workspace */
export function findViewHelper(ws: Workspace, key: string): View | undefined {
  return allViewsOf(ws).find(v => v.key === key)
}

/** Iterate every element in the model tree. Return true from callback to stop early. */
export function forEachElementHelper(ws: Workspace, fn: (el: ModelElement) => boolean | void): void {
  for (const p of ws.model.people) { if (fn(p)) return }
  for (const sys of ws.model.softwareSystems) {
    if (fn(sys)) return
    for (const c of sys.containers) {
      if (fn(c)) return
      for (const comp of c.components) { if (fn(comp)) return }
    }
  }
}

/** Find an element by ID in the model tree */
export function findElementHelper(ws: Workspace, id: string): ModelElement | undefined {
  return getElementIndex(ws).get(id)
}

/**
 * Workspace-scoped id → element cache. Keyed by Workspace identity, so
 * each cloned workspace snapshot gets its own index built lazily on the
 * first lookup and reused thereafter. Replaces the O(n) tree walks that
 * findElementHelper used to do on every call — relevant for hot paths
 * that look up multiple elements per render (e.g. relationship resolution
 * on the canvas, view derivation, undo/redo recompute).
 *
 * The WeakMap means cached snapshots are GC'd as soon as the store
 * releases its reference.
 */
const elementIndexCache = new WeakMap<Workspace, Map<string, ModelElement>>()

/** Build (or fetch from cache) the id → element map for a workspace. */
export function getElementIndex(ws: Workspace): Map<string, ModelElement> {
  let idx = elementIndexCache.get(ws)
  if (!idx) {
    idx = new Map()
    forEachElementHelper(ws, (el) => { idx!.set(el.id, el) })
    elementIndexCache.set(ws, idx)
  }
  return idx
}

/** Patch shape that updateElement / updateElementLive both consume. */
export type ElementPatch = Partial<Pick<ModelElement, 'name' | 'description' | 'tags' | 'status' | 'owner' | 'url'>>
  & { location?: 'Internal' | 'External' | 'Unspecified'; technology?: string }

/** Apply a patch to an element in-place. Returns true only when the
 *  element was found AND at least one field changed. Returning false
 *  prevents phantom undo entries when nothing actually mutated. */
export function applyElementPatch(ws: Workspace, id: string, patch: ElementPatch): boolean {
  let changed = false
  forEachElementHelper(ws, (el) => {
    if (el.id !== id) return false
    // Use 'key in patch' for fields that can be legitimately cleared to undefined.
    // This distinguishes { status: undefined } (clear) from {} (leave unchanged),
    // which matters because the UI passes { status: undefined } when the user
    // deselects a value (e.g. clears description or picks "no status").
    if (patch.name !== undefined && el.name !== patch.name) { el.name = patch.name; changed = true }
    if ('description' in patch && el.description !== patch.description) { el.description = patch.description; changed = true }
    if (patch.tags !== undefined) {
      const tagsChanged = patch.tags.length !== el.tags.length || patch.tags.some((t, i) => t !== el.tags[i])
      if (tagsChanged) { el.tags = patch.tags; changed = true }
    }
    if ('status' in patch && el.status !== patch.status) { el.status = patch.status; changed = true }
    if ('owner' in patch && el.owner !== patch.owner) { el.owner = patch.owner; changed = true }
    if ('url' in patch && el.url !== patch.url) { el.url = patch.url; changed = true }
    if (patch.location !== undefined && (el.type === 'person' || el.type === 'softwareSystem')) {
      const cur = (el as Person | SoftwareSystem).location
      if (cur !== patch.location) { (el as Person | SoftwareSystem).location = patch.location; changed = true }
    }
    if (patch.technology !== undefined && (el.type === 'container' || el.type === 'component')) {
      const cur = (el as Container | Component).technology
      if (cur !== patch.technology) { (el as Container | Component).technology = patch.technology; changed = true }
    }
    return true
  })
  return changed
}

/** True if an element with the given ID exists in the model tree. */
export function elementExists(ws: Workspace, id: string): boolean {
  return getElementIndex(ws).has(id)
}

/** The four view-type array keys — used wherever we need to iterate or locate views by type. */
export const VIEW_ARRAY_KEYS = ['systemLandscapeViews', 'systemContextViews', 'containerViews', 'componentViews'] as const

/** Apply a callback to every view in the workspace (mutates views in place). */
export function forEachView(ws: Workspace, fn: (v: View) => void): void {
  for (const key of VIEW_ARRAY_KEYS) {
    for (const v of ws.views[key]) fn(v)
  }
}

/** Return a name that doesn't collide with any existing element name. */
export function uniqueElementName(base: string, ws: Workspace): string {
  const taken = new Set<string>()
  forEachElementHelper(ws, (el) => { taken.add(el.name) })
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Add an element to the active view (no-op if no view is active or the
 *  element is already present). */
export function addToCurrentView(
  ws: Workspace,
  activeViewKey: string | null,
  elementId: string,
  position?: { x: number; y: number },
): void {
  if (!activeViewKey) return
  const view = findViewHelper(ws, activeViewKey)
  if (view && !view.elements.some((e) => e.id === elementId)) {
    view.elements.push({ id: elementId, x: position?.x, y: position?.y })
  }
}

/** Deep-clone the workspace for safe mutation. Returns null when there's
 *  no workspace loaded. */
export function cloneWorkspace(ws: Workspace | null): Workspace | null {
  return ws ? structuredClone(ws) : null
}
