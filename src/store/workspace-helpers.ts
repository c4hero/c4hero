import { current, isDraft } from 'immer'
import type {
  Workspace, View, ModelElement, Person, SoftwareSystem, Container, Component,
  ViewType, ElementInView, DeploymentNode,
} from '@/types/model'
import type { CascadeImpact } from './workspace-types'
import { expandDeploymentElements, walkDeploymentNodes } from '@/lib/deployment'
export type { CascadeImpact } from './workspace-types'

/** Deep-clone an object that may be an Immer draft. structuredClone'ing a
 *  draft proxy throws DataCloneError; current() unwraps the draft to a plain
 *  snapshot first, then structuredClone produces a writable detached copy.
 *  Acts as identity for plain (non-draft) inputs. */
function deepCloneMaybeDraft<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return structuredClone(isDraft(value) ? (current(value as object) as T) : value)
}

/** Fill view arrays and model collections that predate their introduction.
 *  Workspaces persisted (or crash-recovery-snapshotted) before dynamic and
 *  deployment views existed lack those arrays; every VIEW_ARRAY_KEYS loop and
 *  allViewsOf spread would throw on them. Run once at every point a workspace
 *  object from outside the store becomes THE workspace. */
export function normalizeWorkspaceShape(ws: Workspace): Workspace {
  ws.views.dynamicViews ??= []
  ws.views.deploymentViews ??= []
  ws.model.deploymentEnvironments ??= []
  return ws
}

/** Get flat array of all views */
export function allViewsOf(ws: Workspace): View[] {
  return [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
    // Nullish-guarded: workspaces persisted before dynamic/deployment support
    // existed lack these arrays until re-serialized.
    ...(ws.views.dynamicViews ?? []),
    ...(ws.views.deploymentViews ?? []),
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

/**
 * Drop the cached id → element index for a workspace. Call after a helper
 * mutates `ws.model` so the next reader (e.g. Canvas's buildElementMap)
 * rebuilds against the new tree. Without this, helpers that read through
 * findElementHelper before pushing/removing elements leave a stale index
 * behind and the canvas renders against pre-mutation state.
 */
export function invalidateElementIndex(ws: Workspace): void {
  elementIndexCache.delete(ws)
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

/** True if an element with the given ID exists in the model tree. Deployment
 *  elements count too — an explicit relationship may anchor on an
 *  infrastructure node or instance (e.g. a load balancer routing to a
 *  container instance), exactly as the DSL allows inside an environment. */
export function elementExists(ws: Workspace, id: string): boolean {
  if (getElementIndex(ws).has(id)) return true
  for (const env of ws.model.deploymentEnvironments ?? []) {
    let found = false
    walkDeploymentNodes(env, (node) => {
      if (found) return
      if (node.id === id
        || node.infrastructureNodes.some(i => i.id === id)
        || node.containerInstances.some(i => i.id === id)
        || node.softwareSystemInstances.some(i => i.id === id)) found = true
    })
    if (found) return true
  }
  return false
}

/** The view-type array keys — used wherever we need to iterate or locate views by type. */
export const VIEW_ARRAY_KEYS = ['systemLandscapeViews', 'systemContextViews', 'containerViews', 'componentViews', 'dynamicViews', 'deploymentViews'] as const

/** Apply a callback to every view in the workspace (mutates views in place). */
export function forEachView(ws: Workspace, fn: (v: View) => void): void {
  for (const key of VIEW_ARRAY_KEYS) {
    // Nullish-guarded: a crash-recovery snapshot persisted before dynamic /
    // deployment view arrays existed may lack these keys until re-serialized.
    for (const v of ws.views[key] ?? []) fn(v)
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

/** Every ID that lives in the workspace's DSL identifier namespace: model
 *  elements, relationships, groups, and the deployment tree. Used to keep
 *  user-set and derived element IDs collision-free (the serializer would
 *  otherwise suffix-rename on export, breaking ID stability). */
export function collectTakenIds(ws: Workspace): Set<string> {
  const taken = new Set<string>()
  forEachElementHelper(ws, (el) => { taken.add(el.id) })
  for (const r of ws.model.relationships) taken.add(r.id)
  for (const g of ws.model.groups) taken.add(g.id)
  const walkNode = (n: DeploymentNode): void => {
    taken.add(n.id)
    for (const i of n.infrastructureNodes) taken.add(i.id)
    for (const ci of n.containerInstances) taken.add(ci.id)
    for (const si of n.softwareSystemInstances) taken.add(si.id)
    for (const child of n.children) walkNode(child)
  }
  for (const env of ws.model.deploymentEnvironments) {
    taken.add(env.id)
    for (const n of env.deploymentNodes) walkNode(n)
  }
  return taken
}

/** Rewrite every reference to a model element's ID, in place. The caller has
 *  already validated the new ID (format, uniqueness). Returns the auto-view
 *  key renames so the caller can patch view-key references held outside the
 *  workspace (activeViewKey, viewHistory).
 *
 *  Covers: the element itself, relationship endpoints, group membership, view
 *  membership, view scope fields, dynamic-step endpoints, deployment
 *  instances, and the keys of parser-synthesised auto views (they embed the
 *  scope element's ID, e.g. `SystemContext-<id>` — left stale, the layout
 *  sidecar written against the old key would orphan on the next import). */
export function renameElementId(ws: Workspace, oldId: string, newId: string): { from: string; to: string }[] {
  forEachElementHelper(ws, (el) => {
    if (el.id !== oldId) return false
    el.id = newId
    return true
  })
  for (const r of ws.model.relationships) {
    if (r.sourceId === oldId) r.sourceId = newId
    if (r.destinationId === oldId) r.destinationId = newId
  }
  for (const g of ws.model.groups) {
    g.elementIds = g.elementIds.map(id => (id === oldId ? newId : id))
  }
  const walkNode = (n: DeploymentNode): void => {
    for (const ci of n.containerInstances) {
      if (ci.containerId === oldId) ci.containerId = newId
    }
    for (const si of n.softwareSystemInstances) {
      if (si.softwareSystemId === oldId) si.softwareSystemId = newId
    }
    for (const child of n.children) walkNode(child)
  }
  for (const env of ws.model.deploymentEnvironments) {
    for (const n of env.deploymentNodes) walkNode(n)
  }
  const keyRenames: { from: string; to: string }[] = []
  forEachView(ws, (v) => {
    for (const el of v.elements) {
      if (el.id === oldId) el.id = newId
    }
    for (const r of v.relationships) {
      if (r.sourceId === oldId) r.sourceId = newId
      if (r.destinationId === oldId) r.destinationId = newId
    }
    if (v.softwareSystemId === oldId) v.softwareSystemId = newId
    if (v.containerId === oldId) v.containerId = newId
    if (v.autoKey && v.key.split('-').includes(oldId)) {
      const from = v.key
      v.key = v.key.split('-').map(seg => (seg === oldId ? newId : seg)).join('-')
      keyRenames.push({ from, to: v.key })
    }
  })
  invalidateElementIndex(ws)
  return keyRenames
}

/** Add an element to the active view (no-op if no view is active or the
 *  element is already present). */
/** Which element types each C4 view kind may show — a higher-level view never
 *  shows lower-level internals (a System Landscape never shows containers, etc.),
 *  though deeper views may show higher-level elements as external/boundary nodes. */
const VIEW_ELEMENT_TYPES: Record<View['type'], ReadonlySet<ModelElement['type']>> = {
  systemLandscape: new Set<ModelElement['type']>(['person', 'softwareSystem']),
  systemContext: new Set<ModelElement['type']>(['person', 'softwareSystem']),
  container: new Set<ModelElement['type']>(['person', 'softwareSystem', 'container']),
  component: new Set<ModelElement['type']>(['person', 'softwareSystem', 'container', 'component']),
  // Dynamic views derive their element membership from the interaction steps
  // alone — Structurizr has no `include` for them, so a directly-added element
  // would silently vanish on save/reload. Nothing may be dropped in directly.
  dynamic: new Set<ModelElement['type']>(),
  // Deployment views show deployment elements (nodes/instances), which are not
  // ModelElements — plain model elements are never dropped into them directly.
  deployment: new Set<ModelElement['type']>(),
}

/** True when a view of `viewType` is allowed to display an element of `elementType`. */
export function viewAllowsElementType(viewType: View['type'], elementType: ModelElement['type']): boolean {
  return VIEW_ELEMENT_TYPES[viewType].has(elementType)
}

export function addToCurrentView(
  ws: Workspace,
  activeViewKey: string | null,
  elementId: string,
  position?: { x: number; y: number },
  elementType?: ModelElement['type'],
): void {
  if (!activeViewKey) return
  const view = findViewHelper(ws, activeViewKey)
  if (!view) return
  // Don't drop an element into a view that can't hold its type (e.g. a container
  // onto a System Landscape view). The element still lives in the model and is
  // added to the appropriate scoped views by the caller.
  if (elementType && !viewAllowsElementType(view.type, elementType)) return
  if (!view.elements.some((e) => e.id === elementId)) {
    view.elements.push({ id: elementId, x: position?.x, y: position?.y })
  }
}

/** Reset the element/relationship/group selection on the draft. One place to
 *  change if selection ever gains another field. */
export function clearSelectionDraft(
  s: { selectedElementIds: string[]; selectedRelationshipId: string | null; selectedGroupId: string | null },
): void {
  s.selectedElementIds = []
  s.selectedRelationshipId = null
  s.selectedGroupId = null
}

/** Close both AI surfaces (assistant + settings) so the inspector can take the
 *  shared slot. Callers own the guard (selection vs create differ on batchApplying). */
export function closeAiSurfaces(s: { aiPanelOpen: boolean; aiSettingsOpen: boolean }): void {
  s.aiPanelOpen = false
  s.aiSettingsOpen = false
}

/** Select a just-created element and close the assistant so the inspector shows
 *  — EXCEPT during an AI batch apply (keep the panel to show its results) or while
 *  the assistant is mid-flow (aiPanelBusy: interview/wizard/sweep — don't yank it
 *  out from under the user). Centralizes the selection-reset + panel-close that
 *  every create action shares, matching the selection-slice guard. */
export function selectCreated(
  s: { batchApplying: boolean; aiPanelBusy: boolean; aiPanelOpen: boolean; aiSettingsOpen: boolean; focusElementId: string | null; selectedElementIds: string[]; selectedRelationshipId: string | null; selectedGroupId: string | null },
  id: string,
): void {
  s.focusElementId = id
  s.selectedElementIds = [id]
  s.selectedRelationshipId = null
  s.selectedGroupId = null
  if (!s.batchApplying && !s.aiPanelBusy) closeAiSurfaces(s)
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
 * Compute the initial elements + relationships for a freshly-created view
 * so the canvas isn't empty when the user adds a new view. Auto-population
 * rules (preserving Structurizr's "include the scope + everything related"
 * convention):
 *
 *  - systemLandscape: all people + all software systems
 *  - systemContext:   the scoped system + every person/system with a
 *                     relationship to it
 *  - container:       all containers of the scoped system + people/other
 *                     systems/other containers that interact with them
 *  - component:       all components of the scoped container + people/
 *                     systems/containers that interact with them (other
 *                     containers shown as the C4 boundary if a child
 *                     component is related)
 *
 * Returns the auto-populated element refs and the relationship refs whose
 * endpoints both ended up in the view.
 */
export function buildInitialViewContent(
  model: Workspace['model'],
  type: ViewType,
  scopeId: string | undefined,
): { elements: ElementInView[]; relationships: { id: string }[] } {
  const elements: ElementInView[] = []

  if (type === 'systemLandscape') {
    for (const p of model.people) elements.push({ id: p.id })
    for (const sys of model.softwareSystems) elements.push({ id: sys.id })
  } else if (type === 'systemContext' && scopeId) {
    // Mirror parser's expandWildcard for systemContext: include the scope plus
    // any people / external systems that have a relationship to the scope OR
    // to one of its containers/components (the user-friendly equivalent of
    // Structurizr's "implied relationships"). Without this, DSL files that
    // express relationships at container granularity produce an empty system
    // context view.
    elements.push({ id: scopeId })
    const scopeSys = model.softwareSystems.find((s) => s.id === scopeId)
    const scopeInternalIds = new Set<string>([scopeId])
    if (scopeSys) {
      for (const c of scopeSys.containers) {
        scopeInternalIds.add(c.id)
        for (const comp of c.components) scopeInternalIds.add(comp.id)
      }
    }
    const related = new Set<string>()
    for (const rel of model.relationships) {
      if (scopeInternalIds.has(rel.sourceId)) related.add(rel.destinationId)
      if (scopeInternalIds.has(rel.destinationId)) related.add(rel.sourceId)
    }
    for (const p of model.people) {
      if (related.has(p.id)) elements.push({ id: p.id })
    }
    for (const sys of model.softwareSystems) {
      if (sys.id !== scopeId && related.has(sys.id)) elements.push({ id: sys.id })
    }
  } else if (type === 'container' && scopeId) {
    const sys = model.softwareSystems.find((s) => s.id === scopeId)
    if (sys) {
      for (const c of sys.containers) elements.push({ id: c.id })
    }
    const containerIds = new Set(elements.map((e) => e.id))
    const related = new Set<string>()
    for (const rel of model.relationships) {
      if (containerIds.has(rel.sourceId)) related.add(rel.destinationId)
      if (containerIds.has(rel.destinationId)) related.add(rel.sourceId)
    }
    for (const p of model.people) {
      if (related.has(p.id)) elements.push({ id: p.id })
    }
    for (const otherSys of model.softwareSystems) {
      if (otherSys.id !== scopeId && related.has(otherSys.id)) elements.push({ id: otherSys.id })
      for (const c of otherSys.containers) {
        if (related.has(c.id)) elements.push({ id: c.id })
      }
    }
  } else if (type === 'component' && scopeId) {
    const container = model.softwareSystems.flatMap((s) => s.containers).find((c) => c.id === scopeId)
    if (container) {
      for (const comp of container.components) elements.push({ id: comp.id })
    }
    const componentIds = new Set(elements.map((e) => e.id))
    const related = new Set<string>()
    for (const rel of model.relationships) {
      if (componentIds.has(rel.sourceId)) related.add(rel.destinationId)
      if (componentIds.has(rel.destinationId)) related.add(rel.sourceId)
    }
    for (const p of model.people) {
      if (related.has(p.id)) elements.push({ id: p.id })
    }
    for (const otherSys of model.softwareSystems) {
      if (related.has(otherSys.id)) elements.push({ id: otherSys.id })
      for (const c of otherSys.containers) {
        if (c.id !== scopeId && related.has(c.id)) elements.push({ id: c.id })
        else if (c.id !== scopeId && c.components.some((comp) => related.has(comp.id))) elements.push({ id: c.id })
      }
    }
  }

  const elementIdSet = new Set(elements.map((e) => e.id))
  const relationships = model.relationships
    .filter((r) => elementIdSet.has(r.sourceId) && elementIdSet.has(r.destinationId))
    .map((r) => ({ id: r.id }))

  return { elements, relationships }
}

/** Build a scoped view (initial content + the standard shape) and push it onto
 *  the matching view array of the (draft) workspace, returning the new view.
 *  Centralizes the View construction shared by addView, addContainer and
 *  addComponent — caller owns selection/active-view/undo handling. */
export function appendScopedView(
  ws: Workspace,
  type: ViewType,
  scopeId: string | undefined,
  title: string,
  key: string,
  options?: { environment?: string },
): View {
  const view: View = {
    type,
    key,
    title,
    elements: [],
    relationships: [],
    autoLayout: { direction: 'TB' },
    softwareSystemId: (type === 'systemContext' || type === 'container' || type === 'deployment' || type === 'dynamic') ? scopeId : undefined,
    containerId: type === 'component' ? scopeId : undefined,
    environment: type === 'deployment' ? options?.environment : undefined,
  }

  if (type === 'deployment') {
    // Seed with every deployment element of the environment (scoped when a
    // system is given); relationships follow from the seeded element set.
    view.elements = expandDeploymentElements(ws.model, options?.environment, scopeId)
    const idSet = new Set(view.elements.map((e) => e.id))
    view.relationships = ws.model.relationships
      .filter((r) => idSet.has(r.sourceId) && idSet.has(r.destinationId))
      .map((r) => ({ id: r.id }))
  } else if (type !== 'dynamic') {
    // Dynamic views start empty — interactions are authored step by step.
    const { elements, relationships } = buildInitialViewContent(ws.model, type, scopeId)
    view.elements = elements
    view.relationships = relationships
  }

  switch (type) {
    case 'systemLandscape': ws.views.systemLandscapeViews.push(view); break
    case 'systemContext': ws.views.systemContextViews.push(view); break
    case 'container': ws.views.containerViews.push(view); break
    case 'component': ws.views.componentViews.push(view); break
    case 'dynamic': (ws.views.dynamicViews ??= []).push(view); break
    case 'deployment': (ws.views.deploymentViews ??= []).push(view); break
  }
  return view
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
  /** Mint a fresh unique ID — derived from `name` when given (elements),
   *  random otherwise (relationships). Must track its own mints: clones are
   *  built before they're pushed, so the workspace alone can't dedupe them. */
  freshId: (name?: string) => string,
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
    const newName = uniqueElementName(`${element.name} copy`, ws)
    const newId = freshId(newName)
    let cloned = false

    if (element.type === 'person') {
      ws.model.people.push({
        ...deepCloneMaybeDraft(element),
        id: newId,
        idIsAuto: true,
        name: newName,
      })
      cloned = true
    } else if (element.type === 'softwareSystem') {
      const clonedContainers = element.containers.map((c) => ({
        ...deepCloneMaybeDraft(c),
        id: freshId(c.name),
        idIsAuto: true,
        components: c.components.map((comp) => ({ ...deepCloneMaybeDraft(comp), id: freshId(comp.name), idIsAuto: true })),
      }))
      ws.model.softwareSystems.push({
        ...deepCloneMaybeDraft(element),
        id: newId,
        idIsAuto: true,
        name: newName,
        containers: clonedContainers,
      })
      cloned = true
    } else if (element.type === 'container') {
      const parent = ws.model.softwareSystems.find((sys) => sys.containers.some((c) => c.id === id))
      if (parent) {
        parent.containers.push({
          ...deepCloneMaybeDraft(element),
          id: newId,
          idIsAuto: true,
          name: newName,
          components: element.components.map((comp) => ({ ...deepCloneMaybeDraft(comp), id: freshId(comp.name), idIsAuto: true })),
        })
        cloned = true
      }
    } else if (element.type === 'component') {
      outer: for (const sys of ws.model.softwareSystems) {
        for (const container of sys.containers) {
          if (container.components.some((c) => c.id === id)) {
            container.components.push({
              ...deepCloneMaybeDraft(element),
              id: newId,
              idIsAuto: true,
              name: newName,
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
      const newRelId = freshId()
      ws.model.relationships.push({
        ...deepCloneMaybeDraft(rel),
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

  // Mutated the model (pushed people / containers / components / systems and
  // possibly relationships); evict the stale id→element index so the next
  // reader rebuilds it against the post-mutation tree.
  invalidateElementIndex(ws)
  return newIds
}

/** What a cascade delete of `ids` would take with it. */
export interface CascadeIds {
  /** The explicitly targeted ids. */
  idSet: Set<string>
  /** Containers removed because they (or their parent system) were targeted. */
  deletedContainerIds: Set<string>
  /** Components removed because they, their container, or its system was targeted. */
  deletedComponentIds: Set<string>
  /** Everything above, together — every id that would cease to exist. */
  allDeletedIds: Set<string>
}

/**
 * Roll a set of targeted element ids up into everything a delete would remove.
 * The single source of truth for cascade scope: `cascadeDeleteElements` (which
 * performs the delete), `computeCascadeImpact` (which previews it for the
 * confirm dialog) and the impact analysis all call this, so a change to the
 * cascade rule can't leave one of them behind.
 */
export function collectCascadeIds(ws: Workspace, ids: Iterable<string>): CascadeIds {
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

  return { idSet, deletedContainerIds, deletedComponentIds, allDeletedIds }
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
  const { idSet, deletedContainerIds, allDeletedIds } = collectCascadeIds(ws, ids)

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

  // Deployment elements deleted directly (an instance or infrastructure node
  // by id, or a deployment node — which takes its whole subtree with it).
  const collectSubtree = (node: DeploymentNode, into: Set<string>): void => {
    into.add(node.id)
    for (const inst of node.containerInstances) into.add(inst.id)
    for (const inst of node.softwareSystemInstances) into.add(inst.id)
    for (const infra of node.infrastructureNodes) into.add(infra.id)
    for (const child of node.children) collectSubtree(child, into)
  }
  const removedDeploymentIds = new Set<string>()
  const pruneNodes = (nodes: DeploymentNode[]): DeploymentNode[] =>
    nodes.filter((node) => {
      if (idSet.has(node.id)) {
        collectSubtree(node, removedDeploymentIds)
        return false
      }
      node.children = pruneNodes(node.children)
      node.infrastructureNodes = node.infrastructureNodes.filter((infra) => {
        if (!idSet.has(infra.id)) return true
        removedDeploymentIds.add(infra.id)
        return false
      })
      node.containerInstances = node.containerInstances.filter((inst) => {
        if (!idSet.has(inst.id)) return true
        removedDeploymentIds.add(inst.id)
        return false
      })
      node.softwareSystemInstances = node.softwareSystemInstances.filter((inst) => {
        if (!idSet.has(inst.id)) return true
        removedDeploymentIds.add(inst.id)
        return false
      })
      return true
    })
  for (const env of ws.model.deploymentEnvironments ?? []) {
    env.deploymentNodes = pruneNodes(env.deploymentNodes)
  }
  for (const id of removedDeploymentIds) allDeletedIds.add(id)

  // Deployment instances of deleted containers/systems die with them, and
  // the instances' own ids then cascade through relationships and view refs —
  // a dangling containerInstance would serialize a reference to the deleted
  // element and fail to re-parse.
  const removedInstanceIds = new Set<string>()
  for (const env of ws.model.deploymentEnvironments ?? []) {
    walkDeploymentNodes(env, (node) => {
      node.containerInstances = node.containerInstances.filter((inst) => {
        if (!allDeletedIds.has(inst.containerId)) return true
        removedInstanceIds.add(inst.id)
        return false
      })
      node.softwareSystemInstances = node.softwareSystemInstances.filter((inst) => {
        if (!allDeletedIds.has(inst.softwareSystemId)) return true
        removedInstanceIds.add(inst.id)
        return false
      })
    })
  }
  for (const id of removedInstanceIds) allDeletedIds.add(id)

  // Prune relationships referencing any deleted endpoint
  ws.model.relationships = ws.model.relationships.filter(
    (r) => !allDeletedIds.has(r.sourceId) && !allDeletedIds.has(r.destinationId),
  )
  const survivingRelIds = new Set(ws.model.relationships.map((r) => r.id))
  const survivingRelById = new Map(ws.model.relationships.map((r) => [r.id, r]))

  // Prune view element refs + view relationship refs
  forEachView(ws, (v) => {
    v.elements = v.elements.filter((e) => !allDeletedIds.has(e.id))
    v.relationships = v.relationships.filter((r) => survivingRelIds.has(r.id))
    if (v.type === 'dynamic') {
      // Dynamic membership is derived from interaction steps; drop elements
      // whose every step died so they don't linger as orphan nodes (the next
      // parse would drop them anyway — steps are all that serializes).
      const stepEndpoints = new Set<string>()
      for (const step of v.relationships) {
        const rel = survivingRelById.get(step.id)
        stepEndpoints.add(step.sourceId ?? rel?.sourceId ?? '')
        stepEndpoints.add(step.destinationId ?? rel?.destinationId ?? '')
      }
      v.elements = v.elements.filter((e) => stepEndpoints.has(e.id))
    }
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
  ws.views.deploymentViews = (ws.views.deploymentViews ?? []).filter(
    (v) => !v.softwareSystemId || !idSet.has(v.softwareSystemId),
  )
  ws.views.dynamicViews = (ws.views.dynamicViews ?? []).filter(
    (v) => (!v.softwareSystemId || !idSet.has(v.softwareSystemId))
      && (!v.containerId || (!idSet.has(v.containerId) && !deletedContainerIds.has(v.containerId))),
  )

  // Drop deleted IDs from group memberships
  ws.model.groups = ws.model.groups.map((g) => ({
    ...g,
    elementIds: g.elementIds.filter((eid) => !allDeletedIds.has(eid)),
  }))

  invalidateElementIndex(ws)
  return { allDeletedIds, deletedContainerIds }
}

/**
 * Mutation-free dry run of `cascadeDeleteElements`. Returns counts so a confirm
 * dialog can warn the user about the actual blast radius before they proceed.
 *
 * Shares `collectCascadeIds` with the real delete, so the preview and the
 * deletion can't disagree about scope.
 */
export function computeCascadeImpact(ws: Workspace, ids: Iterable<string>): CascadeImpact {
  const idSet = new Set(ids)
  const elementNames: string[] = []

  // Up-front pass: collect names of every explicitly-selected element exactly once.
  // This is separated from the cascade traversal below so that a selected child
  // whose parent is also selected still gets its name recorded (the cascade branch
  // only sweeps IDs, not names, for children of a selected system).
  for (const p of ws.model.people) {
    if (idSet.has(p.id)) elementNames.push(p.name)
  }
  for (const sys of ws.model.softwareSystems) {
    if (idSet.has(sys.id)) elementNames.push(sys.name)
    for (const c of sys.containers) {
      if (idSet.has(c.id)) elementNames.push(c.name)
      for (const comp of c.components) {
        if (idSet.has(comp.id)) elementNames.push(comp.name)
      }
    }
  }

  const { deletedContainerIds, deletedComponentIds, allDeletedIds } = collectCascadeIds(ws, ids)

  // Don't double-count: subtract IDs the caller listed explicitly that also turned up via cascade.
  const descendantContainers = [...deletedContainerIds].filter((id) => !idSet.has(id)).length
  const descendantComponents = [...deletedComponentIds].filter((id) => !idSet.has(id)).length

  let relationships = 0
  for (const r of ws.model.relationships) {
    if (allDeletedIds.has(r.sourceId) || allDeletedIds.has(r.destinationId)) relationships++
  }

  let scopedViews = 0
  for (const v of ws.views.systemContextViews) {
    if (v.softwareSystemId && idSet.has(v.softwareSystemId)) scopedViews++
  }
  for (const v of ws.views.containerViews) {
    if (v.softwareSystemId && idSet.has(v.softwareSystemId)) scopedViews++
  }
  for (const v of ws.views.componentViews) {
    if (v.containerId && (idSet.has(v.containerId) || deletedContainerIds.has(v.containerId))) scopedViews++
  }

  return {
    elementCount: elementNames.length,
    elementNames,
    descendantContainers,
    descendantComponents,
    relationships,
    scopedViews,
  }
}
