import type {
  Container,
  Component,
  ModelElement,
  Person,
  Relationship,
  SoftwareSystem,
  View,
  ViewType,
  Workspace,
} from '@/types/model'

/**
 * Structural diff between two revisions of the same workspace.
 *
 * Pure and deterministic: the same two workspaces always produce byte-identical
 * output, in a stable traversal order (people, systems, containers, components,
 * then relationships, then views). No DOM, no store, no clock, no randomness —
 * so the same engine can serve the in-app compare view and a future CI narrator
 * (TEA-78).
 *
 * ## Why identity is not just `id`
 *
 * Element ids come from the DSL: an authored identifier (`apiApp = container …`)
 * is used verbatim, but a declaration without one gets a *parse-local* counter
 * id (`p1`, `p2`, …) that is not stable between two parses. Matching on id alone
 * would therefore pair unrelated anonymous elements and report a rename storm.
 * Matching runs in three rounds instead, strongest evidence first:
 *
 *   1. same id **and** same name — unambiguous, the common case;
 *   2. same name within the same parent — the DSL identifier was renamed;
 *   3. same *authored* id — the element was renamed (generated `pN` ids are
 *      excluded here, because by this round the name evidence is exhausted and
 *      `p3` in one file means nothing to `p3` in the other).
 *
 * Whatever is left over is genuinely added or removed. Matching is scoped to a
 * parent: a container that moved between systems reads as removed + added,
 * which is what actually happened to the model.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type DiffKind = 'added' | 'removed' | 'changed'

/** One field that differs between the two revisions. */
export interface FieldChange {
  field: string
  before: string
  after: string
}

export interface ElementDiffEntry {
  kind: DiffKind
  /** Id in the head (current) workspace — absent for removed elements. */
  headId?: string
  /** Id in the base (compared-against) workspace — absent for added elements. */
  baseId?: string
  type: ModelElement['type']
  /** Head name, or the base name for a removed element. */
  name: string
  /** Ancestor names, outermost first: `["Internet Banking System"]`. */
  parentPath: string[]
  changes: FieldChange[]
}

export interface RelationshipDiffEntry {
  kind: DiffKind
  headId?: string
  baseId?: string
  sourceName: string
  destinationName: string
  description: string
  changes: FieldChange[]
}

export interface ViewDiffEntry {
  kind: DiffKind
  key: string
  title: string
  type: ViewType
  /** Names of elements that appear on this view only in the head revision. */
  addedElements: string[]
  /** Names of elements that appear on this view only in the base revision. */
  removedElements: string[]
  changes: FieldChange[]
}

export interface DiffSummary {
  added: number
  removed: number
  changed: number
  /** Every entry across elements, relationships, views and workspace fields. */
  total: number
}

export interface WorkspaceDiff {
  elements: ElementDiffEntry[]
  relationships: RelationshipDiffEntry[]
  views: ViewDiffEntry[]
  /** Workspace-level fields (name, description, scope). */
  workspaceChanges: FieldChange[]
  summary: DiffSummary
  /** Head element id -> status, for canvas tinting. Removed elements are absent
   *  from the head workspace and so cannot appear here; they are in `elements`. */
  elementStatus: Map<string, 'added' | 'changed'>
  /** Head relationship id -> status, for canvas tinting. */
  relationshipStatus: Map<string, 'added' | 'changed'>
  /** True when the two revisions describe the same architecture. */
  identical: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Ids the DSL parser generates for declarations with no author identifier.
 *  They restart per parse, so they carry no cross-revision meaning. */
function isGeneratedId(id: string): boolean {
  return /^p\d+$/.test(id)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function text(value: string | undefined): string {
  return value?.trim() ?? ''
}

function tagText(tags: string[]): string {
  return [...tags].sort().join(', ')
}

function propertiesText(properties: Record<string, string>): string {
  return Object.keys(properties)
    .sort()
    .map((key) => `${key}=${properties[key]}`)
    .join(', ')
}

function pushChange(
  changes: FieldChange[],
  field: string,
  before: string,
  after: string,
): void {
  if (before !== after) changes.push({ field, before, after })
}

// ─── Matching ────────────────────────────────────────────────────────

interface MatchResult<T> {
  pairs: Array<{ base: T; head: T }>
  addedOnly: T[]
  removedOnly: T[]
}

interface Identified {
  id: string
  name: string
}

/**
 * Pair items from two revisions of the same sibling list. See the module
 * comment for why this runs in three rounds. Deterministic: candidates are
 * always consumed in source order.
 */
export function matchByIdentity<T extends Identified>(base: T[], head: T[]): MatchResult<T> {
  const pairs: Array<{ base: T; head: T }> = []
  const usedHead = new Set<number>()
  const matchedBase = new Set<number>()

  const claim = (baseIndex: number, headIndex: number, baseItem: T, headItem: T) => {
    matchedBase.add(baseIndex)
    usedHead.add(headIndex)
    pairs.push({ base: baseItem, head: headItem })
  }

  const rounds: Array<(b: T, h: T) => boolean> = [
    (b, h) => b.id === h.id && normalizeName(b.name) === normalizeName(h.name),
    (b, h) => normalizeName(b.name) === normalizeName(h.name),
    (b, h) => b.id === h.id && !isGeneratedId(b.id),
  ]

  for (const isMatch of rounds) {
    for (let i = 0; i < base.length; i++) {
      if (matchedBase.has(i)) continue
      for (let j = 0; j < head.length; j++) {
        if (usedHead.has(j)) continue
        if (!isMatch(base[i], head[j])) continue
        claim(i, j, base[i], head[j])
        break
      }
    }
  }

  return {
    pairs,
    addedOnly: head.filter((_, index) => !usedHead.has(index)),
    removedOnly: base.filter((_, index) => !matchedBase.has(index)),
  }
}

// ─── Element diffing ─────────────────────────────────────────────────

function baseElementChanges(before: ModelElement, after: ModelElement): FieldChange[] {
  const changes: FieldChange[] = []
  pushChange(changes, 'name', before.name, after.name)
  pushChange(changes, 'description', text(before.description), text(after.description))
  pushChange(changes, 'owner', text(before.owner), text(after.owner))
  pushChange(changes, 'url', text(before.url), text(after.url))
  pushChange(changes, 'status', text(before.status), text(after.status))
  pushChange(changes, 'tags', tagText(before.tags), tagText(after.tags))
  pushChange(changes, 'properties', propertiesText(before.properties), propertiesText(after.properties))
  if ('technology' in before || 'technology' in after) {
    const beforeTech = 'technology' in before ? text(before.technology) : ''
    const afterTech = 'technology' in after ? text(after.technology) : ''
    pushChange(changes, 'technology', beforeTech, afterTech)
  }
  if ('location' in before || 'location' in after) {
    const beforeLocation = 'location' in before ? text(before.location) : ''
    const afterLocation = 'location' in after ? text(after.location) : ''
    pushChange(changes, 'location', beforeLocation, afterLocation)
  }
  return changes
}

/** Accumulates element entries and the base -> head id mapping in one pass. */
class ElementDiffCollector {
  readonly entries: ElementDiffEntry[] = []
  /** base element id -> head element id, for every matched pair. */
  readonly baseToHead = new Map<string, string>()
  readonly headNames = new Map<string, string>()
  readonly baseNames = new Map<string, string>()

  added(element: ModelElement, parentPath: string[]): void {
    this.entries.push({
      kind: 'added',
      headId: element.id,
      type: element.type,
      name: element.name,
      parentPath,
      changes: [],
    })
  }

  removed(element: ModelElement, parentPath: string[]): void {
    this.entries.push({
      kind: 'removed',
      baseId: element.id,
      type: element.type,
      name: element.name,
      parentPath,
      changes: [],
    })
  }

  matched(before: ModelElement, after: ModelElement, parentPath: string[]): void {
    this.baseToHead.set(before.id, after.id)
    const changes = baseElementChanges(before, after)
    if (changes.length === 0) return
    this.entries.push({
      kind: 'changed',
      headId: after.id,
      baseId: before.id,
      type: after.type,
      name: after.name,
      parentPath,
      changes,
    })
  }
}

function addSubtree(
  collector: ElementDiffCollector,
  element: ModelElement,
  parentPath: string[],
): void {
  collector.added(element, parentPath)
  const childPath = [...parentPath, element.name]
  if (element.type === 'softwareSystem') {
    for (const container of element.containers) addSubtree(collector, container, childPath)
  } else if (element.type === 'container') {
    for (const component of element.components) addSubtree(collector, component, childPath)
  }
}

function removeSubtree(
  collector: ElementDiffCollector,
  element: ModelElement,
  parentPath: string[],
): void {
  collector.removed(element, parentPath)
  const childPath = [...parentPath, element.name]
  if (element.type === 'softwareSystem') {
    for (const container of element.containers) removeSubtree(collector, container, childPath)
  } else if (element.type === 'container') {
    for (const component of element.components) removeSubtree(collector, component, childPath)
  }
}

function diffComponents(
  collector: ElementDiffCollector,
  before: Container,
  after: Container,
  parentPath: string[],
): void {
  const path = [...parentPath, after.name]
  const { pairs, addedOnly, removedOnly } = matchByIdentity<Component>(before.components, after.components)
  for (const pair of pairs) collector.matched(pair.base, pair.head, path)
  for (const component of addedOnly) addSubtree(collector, component, path)
  for (const component of removedOnly) removeSubtree(collector, component, path)
}

function diffContainers(
  collector: ElementDiffCollector,
  before: SoftwareSystem,
  after: SoftwareSystem,
  parentPath: string[],
): void {
  const path = [...parentPath, after.name]
  const { pairs, addedOnly, removedOnly } = matchByIdentity<Container>(before.containers, after.containers)
  for (const pair of pairs) {
    collector.matched(pair.base, pair.head, path)
    diffComponents(collector, pair.base, pair.head, path)
  }
  for (const container of addedOnly) addSubtree(collector, container, path)
  for (const container of removedOnly) removeSubtree(collector, container, path)
}

function diffElements(base: Workspace, head: Workspace): ElementDiffCollector {
  const collector = new ElementDiffCollector()

  const people = matchByIdentity<Person>(base.model.people, head.model.people)
  for (const pair of people.pairs) collector.matched(pair.base, pair.head, [])
  for (const person of people.addedOnly) addSubtree(collector, person, [])
  for (const person of people.removedOnly) removeSubtree(collector, person, [])

  const systems = matchByIdentity<SoftwareSystem>(base.model.softwareSystems, head.model.softwareSystems)
  for (const pair of systems.pairs) {
    collector.matched(pair.base, pair.head, [])
    diffContainers(collector, pair.base, pair.head, [])
  }
  for (const system of systems.addedOnly) addSubtree(collector, system, [])
  for (const system of systems.removedOnly) removeSubtree(collector, system, [])

  return collector
}

// ─── Relationship diffing ────────────────────────────────────────────

function relationshipChanges(before: Relationship, after: Relationship): FieldChange[] {
  const changes: FieldChange[] = []
  pushChange(changes, 'description', text(before.description), text(after.description))
  pushChange(changes, 'technology', text(before.technology), text(after.technology))
  pushChange(changes, 'interactionStyle', text(before.interactionStyle), text(after.interactionStyle))
  pushChange(changes, 'lineStyle', text(before.lineStyle), text(after.lineStyle))
  pushChange(changes, 'url', text(before.url), text(after.url))
  pushChange(changes, 'tags', tagText(before.tags), tagText(after.tags))
  pushChange(changes, 'properties', propertiesText(before.properties), propertiesText(after.properties))
  return changes
}

/** Index every element of a workspace by id, including nested ones. */
function indexElements(workspace: Workspace): Map<string, ModelElement> {
  const index = new Map<string, ModelElement>()
  for (const person of workspace.model.people) index.set(person.id, person)
  for (const system of workspace.model.softwareSystems) {
    index.set(system.id, system)
    for (const container of system.containers) {
      index.set(container.id, container)
      for (const component of container.components) index.set(component.id, component)
    }
  }
  return index
}

function diffRelationships(
  base: Workspace,
  head: Workspace,
  baseToHead: Map<string, string>,
  baseIndex: Map<string, ModelElement>,
  headIndex: Map<string, ModelElement>,
): RelationshipDiffEntry[] {
  const entries: RelationshipDiffEntry[] = []
  const nameOf = (index: Map<string, ModelElement>, id: string) => index.get(id)?.name ?? id

  // Head relationships bucketed by endpoint pair. Parallel edges between the
  // same two elements stay in one bucket and are then told apart by
  // description, so re-describing one of them reads as a change, not a
  // remove + add.
  const headByEndpoints = new Map<string, Relationship[]>()
  for (const rel of head.model.relationships) {
    const key = `${rel.sourceId}->${rel.destinationId}`
    const bucket = headByEndpoints.get(key)
    if (bucket) bucket.push(rel)
    else headByEndpoints.set(key, [rel])
  }
  const claimedHead = new Set<string>()

  for (const rel of base.model.relationships) {
    const headSource = baseToHead.get(rel.sourceId)
    const headDestination = baseToHead.get(rel.destinationId)
    const candidates = headSource && headDestination
      ? (headByEndpoints.get(`${headSource}->${headDestination}`) ?? []).filter((c) => !claimedHead.has(c.id))
      : []

    const match =
      candidates.find((c) => normalizeName(text(c.description)) === normalizeName(text(rel.description))) ??
      candidates[0]

    if (!match) {
      entries.push({
        kind: 'removed',
        baseId: rel.id,
        sourceName: nameOf(baseIndex, rel.sourceId),
        destinationName: nameOf(baseIndex, rel.destinationId),
        description: text(rel.description),
        changes: [],
      })
      continue
    }

    claimedHead.add(match.id)
    const changes = relationshipChanges(rel, match)
    if (changes.length === 0) continue
    entries.push({
      kind: 'changed',
      headId: match.id,
      baseId: rel.id,
      sourceName: nameOf(headIndex, match.sourceId),
      destinationName: nameOf(headIndex, match.destinationId),
      description: text(match.description),
      changes,
    })
  }

  for (const rel of head.model.relationships) {
    if (claimedHead.has(rel.id)) continue
    entries.push({
      kind: 'added',
      headId: rel.id,
      sourceName: nameOf(headIndex, rel.sourceId),
      destinationName: nameOf(headIndex, rel.destinationId),
      description: text(rel.description),
      changes: [],
    })
  }

  return entries
}

// ─── View diffing ────────────────────────────────────────────────────

/** Every view in the workspace, in a stable order. Includes dynamic and
 *  deployment views (which the canvas doesn't draw yet but the model carries),
 *  and tolerates workspaces written before those arrays existed. */
function allViewsIn(workspace: Workspace): View[] {
  const views = workspace.views
  return [
    ...views.systemLandscapeViews,
    ...views.systemContextViews,
    ...views.containerViews,
    ...views.componentViews,
    ...(views.dynamicViews ?? []),
    ...(views.deploymentViews ?? []),
  ]
}

function viewTitle(view: View): string {
  return text(view.title) || view.key
}

function diffViews(
  base: Workspace,
  head: Workspace,
  baseToHead: Map<string, string>,
  baseIndex: Map<string, ModelElement>,
  headIndex: Map<string, ModelElement>,
): ViewDiffEntry[] {
  const entries: ViewDiffEntry[] = []
  const baseViews = allViewsIn(base)
  const headViews = allViewsIn(head)
  const headByKey = new Map(headViews.map((view) => [view.key, view]))
  const seenHeadKeys = new Set<string>()

  for (const before of baseViews) {
    const after = headByKey.get(before.key)
    if (!after) {
      entries.push({
        kind: 'removed',
        key: before.key,
        title: viewTitle(before),
        type: before.type,
        addedElements: [],
        removedElements: [],
        changes: [],
      })
      continue
    }
    seenHeadKeys.add(after.key)

    const changes: FieldChange[] = []
    pushChange(changes, 'title', text(before.title), text(after.title))
    pushChange(changes, 'description', text(before.description), text(after.description))

    // Membership is compared in head id space so a renamed DSL identifier
    // doesn't masquerade as "removed from the view, then added back".
    const beforeMembers = new Set(
      before.elements.map((element) => baseToHead.get(element.id) ?? `base:${element.id}`),
    )
    const afterMembers = new Set(after.elements.map((element) => element.id))

    const addedElements = after.elements
      .filter((element) => !beforeMembers.has(element.id))
      .map((element) => headIndex.get(element.id)?.name ?? element.id)
    const removedElements = before.elements
      .filter((element) => {
        const headId = baseToHead.get(element.id)
        return !headId || !afterMembers.has(headId)
      })
      .map((element) => baseIndex.get(element.id)?.name ?? element.id)

    if (changes.length === 0 && addedElements.length === 0 && removedElements.length === 0) continue
    entries.push({
      kind: 'changed',
      key: after.key,
      title: viewTitle(after),
      type: after.type,
      addedElements,
      removedElements,
      changes,
    })
  }

  for (const after of headViews) {
    if (seenHeadKeys.has(after.key)) continue
    entries.push({
      kind: 'added',
      key: after.key,
      title: viewTitle(after),
      type: after.type,
      addedElements: after.elements.map((element) => headIndex.get(element.id)?.name ?? element.id),
      removedElements: [],
      changes: [],
    })
  }

  return entries
}

// ─── Entry point ─────────────────────────────────────────────────────

/**
 * Diff two revisions of a workspace: `base` is the older/compared-against
 * revision, `head` is the one currently open.
 */
export function diffWorkspaces(base: Workspace, head: Workspace): WorkspaceDiff {
  const collector = diffElements(base, head)
  const baseIndex = indexElements(base)
  const headIndex = indexElements(head)

  const relationships = diffRelationships(base, head, collector.baseToHead, baseIndex, headIndex)
  const views = diffViews(base, head, collector.baseToHead, baseIndex, headIndex)

  const workspaceChanges: FieldChange[] = []
  pushChange(workspaceChanges, 'name', text(base.name), text(head.name))
  pushChange(workspaceChanges, 'description', text(base.description), text(head.description))
  pushChange(workspaceChanges, 'scope', text(base.scope), text(head.scope))

  const elementStatus = new Map<string, 'added' | 'changed'>()
  for (const entry of collector.entries) {
    if (entry.kind === 'removed' || !entry.headId) continue
    elementStatus.set(entry.headId, entry.kind)
  }
  const relationshipStatus = new Map<string, 'added' | 'changed'>()
  for (const entry of relationships) {
    if (entry.kind === 'removed' || !entry.headId) continue
    relationshipStatus.set(entry.headId, entry.kind)
  }

  const all = [...collector.entries, ...relationships, ...views]
  const summary: DiffSummary = {
    added: all.filter((entry) => entry.kind === 'added').length,
    removed: all.filter((entry) => entry.kind === 'removed').length,
    changed: all.filter((entry) => entry.kind === 'changed').length,
    total: all.length + workspaceChanges.length,
  }

  return {
    elements: collector.entries,
    relationships,
    views,
    workspaceChanges,
    summary,
    elementStatus,
    relationshipStatus,
    identical: summary.total === 0,
  }
}

// Two-level WeakMap: base -> head -> diff. Both keys are workspace objects, and
// the store replaces the workspace object on every edit, so a stale entry is
// unreachable the moment either side changes and the pair is re-diffed. Lets the
// canvas overlay and the compare panel share one computation per edit.
const diffCache = new WeakMap<Workspace, WeakMap<Workspace, WorkspaceDiff>>()

/** `diffWorkspaces`, memoized on the two workspace object identities. */
export function diffWorkspacesCached(base: Workspace, head: Workspace): WorkspaceDiff {
  let byHead = diffCache.get(base)
  if (!byHead) {
    byHead = new WeakMap<Workspace, WorkspaceDiff>()
    diffCache.set(base, byHead)
  }
  const cached = byHead.get(head)
  if (cached) return cached
  const diff = diffWorkspaces(base, head)
  byHead.set(head, diff)
  return diff
}

/** One-line summary for the compare header and screen-reader announcements. */
export function formatDiffSummary(diff: WorkspaceDiff): string {
  if (diff.identical) return 'No architectural differences'
  const parts: string[] = []
  if (diff.summary.added > 0) parts.push(`${diff.summary.added} added`)
  if (diff.summary.removed > 0) parts.push(`${diff.summary.removed} removed`)
  if (diff.summary.changed > 0) parts.push(`${diff.summary.changed} changed`)
  if (parts.length === 0) return `${diff.workspaceChanges.length} workspace field changed`
  return parts.join(', ')
}

/** Display path for an element entry: `System / Container / Component`. */
export function formatElementPath(entry: ElementDiffEntry): string {
  return [...entry.parentPath, entry.name].join(' / ')
}
