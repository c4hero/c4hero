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

/** Result of a cascade delete: the model is mutated in place, and the caller
 *  gets back the full set of element IDs that were removed (direct + implicit
 *  children) so it can clear selection state, etc. */
export interface CascadeDeleteResult {
  /** Direct + implicit child IDs that were removed from the model. */
  allDeletedIds: Set<string>
  /** Container IDs implicitly removed because their parent system was deleted. */
  deletedContainerIds: Set<string>
}

/**
 * Duplicate the given elements within the active view. Mutates the workspace in
 * place — clones each model element with a new ID and a "<name> copy" name,
 * mirrors the auto-add-to-sibling-views behaviour of addPerson/Container/
 * Component, and clones intra-set relationships so the cloned subgraph
 * preserves its internal connectivity.
 *
 * Returns the array of newly-created element IDs (in the order they were
 * created). Empty array means no elements were duplicated.
 */
export function duplicateElementsInTree(
  ws: Workspace,
  ids: string[],
  activeViewKey: string,
  nanoid: () => string,
): string[] {
  const newIds: string[] = []
  const view = findViewHelper(ws, activeViewKey)
  if (!view) return newIds

  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) return newIds

  const idMapping = new Map<string, string>()

  for (const id of uniqueIds) {
    const element = findElementHelper(ws, id)
    if (!element) continue

    const inView = view.elements.find((e) => e.id === id)
    const offsetX = (inView?.x ?? 200) + 60
    const offsetY = (inView?.y ?? 200) + 30
    const newId = nanoid()
    let cloned = false

    if (element.type === 'person') {
      ws.model.people.push({
        ...structuredClone(element),
        id: newId,
        name: uniqueElementName(`${element.name} copy`, ws),
      })
      cloned = true
    } else if (element.type === 'softwareSystem') {
      const clonedContainers = element.containers.map((c) => ({
        ...structuredClone(c),
        id: nanoid(),
        components: c.components.map((comp) => ({ ...structuredClone(comp), id: nanoid() })),
      }))
      ws.model.softwareSystems.push({
        ...structuredClone(element),
        id: newId,
        name: uniqueElementName(`${element.name} copy`, ws),
        containers: clonedContainers,
      })
      cloned = true
    } else if (element.type === 'container') {
      const parent = ws.model.softwareSystems.find((sys) => sys.containers.some((c) => c.id === id))
      if (parent) {
        parent.containers.push({
          ...structuredClone(element),
          id: newId,
          name: uniqueElementName(`${element.name} copy`, ws),
          components: element.components.map((comp) => ({ ...structuredClone(comp), id: nanoid() })),
        })
        cloned = true
      }
    } else if (element.type === 'component') {
      outer: for (const sys of ws.model.softwareSystems) {
        for (const container of sys.containers) {
          if (container.components.some((c) => c.id === id)) {
            container.components.push({
              ...structuredClone(element),
              id: newId,
              name: uniqueElementName(`${element.name} copy`, ws),
            })
            cloned = true
            break outer
          }
        }
      }
    }

    if (!cloned) continue
    idMapping.set(id, newId)
    newIds.push(newId)
    view.elements.push({ id: newId, x: offsetX, y: offsetY })

    // Mirror auto-add-to-sibling-views from addPerson / addContainer / addComponent.
    if (element.type === 'person' || element.type === 'softwareSystem') {
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== activeViewKey && !v.elements.some((e) => e.id === newId)) {
          v.elements.push({ id: newId })
        }
      }
    } else if (element.type === 'container') {
      const parentSysId = ws.model.softwareSystems.find((sys) =>
        sys.containers.some((c) => c.id === newId),
      )?.id
      if (parentSysId) {
        for (const v of ws.views.containerViews) {
          if (v.softwareSystemId === parentSysId && v.key !== activeViewKey
            && !v.elements.some((e) => e.id === newId)) {
            v.elements.push({ id: newId })
          }
        }
      }
    } else if (element.type === 'component') {
      let parentContainerId: string | null = null
      for (const sys of ws.model.softwareSystems) {
        for (const c of sys.containers) {
          if (c.components.some((comp) => comp.id === newId)) { parentContainerId = c.id; break }
        }
        if (parentContainerId) break
      }
      if (parentContainerId) {
        for (const v of ws.views.componentViews) {
          if (v.containerId === parentContainerId && v.key !== activeViewKey
            && !v.elements.some((e) => e.id === newId)) {
            v.elements.push({ id: newId })
          }
        }
      }
    }
  }

  // Duplicate relationships that connect two elements within the duplicated set
  // so the cloned subgraph keeps its internal connectivity.
  for (const rel of ws.model.relationships) {
    const newSourceId = idMapping.get(rel.sourceId)
    const newDestId = idMapping.get(rel.destinationId)
    if (newSourceId && newDestId) {
      const newRelId = nanoid()
      ws.model.relationships.push({
        ...structuredClone(rel),
        id: newRelId,
        sourceId: newSourceId,
        destinationId: newDestId,
      })
      for (const v of allViewsOf(ws)) {
        const viewElIds = new Set(v.elements.map((e) => e.id))
        if (viewElIds.has(newSourceId) && viewElIds.has(newDestId)) {
          if (!v.relationships.some((r) => r.id === newRelId)) {
            v.relationships.push({ id: newRelId })
          }
        }
      }
    }
  }

  return newIds
}

/**
 * Cascade-delete elements from the workspace tree:
 *   - removes the targeted elements from the model
 *   - removes any children rolled up under them (containers in deleted
 *     systems, components in deleted containers)
 *   - prunes relationships whose endpoints were deleted
 *   - removes view element refs and view relationship refs that point at
 *     deleted IDs
 *   - removes scoped views (systemContext / container / component) whose
 *     scope element was deleted
 *   - removes deleted IDs from group memberships
 *
 * Mutates the workspace in place. The caller is expected to have cloned
 * the workspace before invoking.
 */
export function cascadeDeleteElements(ws: Workspace, ids: Iterable<string>): CascadeDeleteResult {
  const idSet = new Set(ids)
  const deletedContainerIds = new Set<string>()
  const deletedComponentIds = new Set<string>()

  // First pass: collect implicit children of any deleted system/container.
  for (const sys of ws.model.softwareSystems) {
    if (idSet.has(sys.id)) {
      for (const c of sys.containers) {
        deletedContainerIds.add(c.id)
        for (const comp of c.components) deletedComponentIds.add(comp.id)
      }
    } else {
      for (const c of sys.containers) {
        if (idSet.has(c.id)) {
          deletedContainerIds.add(c.id)
          for (const comp of c.components) deletedComponentIds.add(comp.id)
        } else {
          for (const comp of c.components) {
            if (idSet.has(comp.id)) deletedComponentIds.add(comp.id)
          }
        }
      }
    }
  }

  const allDeletedIds = new Set([...idSet, ...deletedContainerIds, ...deletedComponentIds])

  // Filter people + tree
  ws.model.people = ws.model.people.filter((p) => !idSet.has(p.id))
  ws.model.softwareSystems = ws.model.softwareSystems.filter((sys) => {
    if (idSet.has(sys.id)) return false
    sys.containers = sys.containers.filter((c) => {
      if (idSet.has(c.id)) return false
      c.components = c.components.filter((comp) => !idSet.has(comp.id))
      return true
    })
    return true
  })

  // Prune relationships referencing any deleted endpoint
  ws.model.relationships = ws.model.relationships.filter(
    (r) => !allDeletedIds.has(r.sourceId) && !allDeletedIds.has(r.destinationId),
  )
  const survivingRelIds = new Set(ws.model.relationships.map((r) => r.id))

  // Prune view element refs + view relationship refs
  forEachView(ws, (v) => {
    v.elements = v.elements.filter((e) => !allDeletedIds.has(e.id))
    v.relationships = v.relationships.filter((r) => survivingRelIds.has(r.id))
  })

  // Remove scoped views whose scope element was deleted
  ws.views.systemContextViews = ws.views.systemContextViews.filter(
    (v) => !v.softwareSystemId || !idSet.has(v.softwareSystemId),
  )
  ws.views.containerViews = ws.views.containerViews.filter(
    (v) => !v.softwareSystemId || !idSet.has(v.softwareSystemId),
  )
  ws.views.componentViews = ws.views.componentViews.filter(
    (v) => !v.containerId || (!idSet.has(v.containerId) && !deletedContainerIds.has(v.containerId)),
  )

  // Drop deleted IDs from group memberships
  ws.model.groups = ws.model.groups.map((g) => ({
    ...g,
    elementIds: g.elementIds.filter((eid) => !allDeletedIds.has(eid)),
  }))

  return { allDeletedIds, deletedContainerIds }
}
