import type { ModelElement, View, Workspace } from '@/types/model'
import { collectCascadeIds } from '@/store/workspace-helpers'

/**
 * What happens if these elements go away.
 *
 * Pure, deterministic graph work over the model — no AI, no guessing. Every
 * claim it makes ("this relationship breaks", "that view disappears", "this
 * element is left with nothing pointing at it") is read straight off the model
 * using the same cascade rules the real delete uses, via `collectCascadeIds`.
 * If the analysis says three things break, exactly three things break.
 *
 * Scope is deliberately *removal*. A rename or a retype does not break anything
 * structurally — ids carry the references — so reporting one as an impact would
 * be crying wolf. Deletion is the case where the blast radius is real and
 * invisible from the canvas.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ImpactRef {
  id: string
  name: string
  type: ModelElement['type']
  /** Ancestor names, outermost first. */
  parentPath: string[]
}

/** An element reached by following relationships out from the removed set. */
export interface ImpactReach extends ImpactRef {
  /** 1 = directly connected to something being removed. */
  depth: number
}

export interface ImpactLink {
  id: string
  sourceId: string
  destinationId: string
  sourceName: string
  destinationName: string
  description: string
  /** `inbound` — a surviving element points at the removed set, so it breaks.
   *  `outbound` — the removed set points at a survivor, which loses a caller.
   *  `internal` — both ends are being removed. */
  side: 'inbound' | 'outbound' | 'internal'
}

export interface ImpactView {
  key: string
  title: string
  type: View['type']
  /** True when the view itself disappears because its scope element is gone. */
  deleted: boolean
  /** How many of the view's elements would vanish from it. */
  lostElements: number
}

export interface ImpactSummary {
  removed: number
  brokenLinks: number
  dependents: number
  dependencies: number
  orphaned: number
  viewsDeleted: number
  viewsChanged: number
}

export interface ImpactReport {
  /** The elements the user picked. */
  targets: ImpactRef[]
  /** Children that go with them (containers of a system, components of a container). */
  descendants: ImpactRef[]
  /** Relationships that lose at least one endpoint. */
  brokenLinks: ImpactLink[]
  /** Surviving elements that point at the removed set, and what points at those
   *  in turn, up to `maxDepth`. These are the things that break. */
  dependents: ImpactReach[]
  /** Surviving elements the removed set points at, and onward. These lose a
   *  caller rather than breaking. */
  dependencies: ImpactReach[]
  /** Survivors left with no relationships at all. */
  orphaned: ImpactRef[]
  views: ImpactView[]
  /** Every id that would cease to exist. */
  removedIds: string[]
  /** Removed ids plus every directly-affected survivor — what to select on the
   *  canvas to see the blast radius. */
  affectedIds: string[]
  summary: ImpactSummary
  /** True when removing the targets touches nothing outside themselves. */
  isolated: boolean
}

export interface ImpactOptions {
  /** How far to follow the dependency chain. 1 is direct neighbours only. */
  maxDepth?: number
}

/** Far enough to show a knock-on effect, near enough that a big model doesn't
 *  report half of itself as affected. */
export const DEFAULT_IMPACT_DEPTH = 3

// ─── Model indexing ──────────────────────────────────────────────────

interface FlatElement {
  element: ModelElement
  parentPath: string[]
}

function flatten(workspace: Workspace): Map<string, FlatElement> {
  const flat = new Map<string, FlatElement>()
  for (const person of workspace.model.people) {
    flat.set(person.id, { element: person, parentPath: [] })
  }
  for (const system of workspace.model.softwareSystems) {
    flat.set(system.id, { element: system, parentPath: [] })
    for (const container of system.containers) {
      flat.set(container.id, { element: container, parentPath: [system.name] })
      for (const component of container.components) {
        flat.set(component.id, { element: component, parentPath: [system.name, container.name] })
      }
    }
  }
  return flat
}

function refOf(flat: Map<string, FlatElement>, id: string): ImpactRef | null {
  const entry = flat.get(id)
  if (!entry) return null
  return { id, name: entry.element.name, type: entry.element.type, parentPath: entry.parentPath }
}

function allViews(workspace: Workspace): View[] {
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

// ─── Traversal ───────────────────────────────────────────────────────

/** Breadth-first reach from the removed set, skipping removed elements (they
 *  are gone, so nothing routes through them) and recording the first — that is,
 *  shortest — depth at which each survivor is touched. */
function reachFrom(
  seeds: Set<string>,
  adjacency: Map<string, string[]>,
  removed: Set<string>,
  maxDepth: number,
): Map<string, number> {
  const depths = new Map<string, number>()
  let frontier = [...seeds]
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (removed.has(neighbour) || depths.has(neighbour)) continue
        depths.set(neighbour, depth)
        next.push(neighbour)
      }
    }
    frontier = next
  }
  return depths
}

function toReach(flat: Map<string, FlatElement>, depths: Map<string, number>): ImpactReach[] {
  const entries: ImpactReach[] = []
  for (const [id, depth] of depths) {
    const ref = refOf(flat, id)
    if (ref) entries.push({ ...ref, depth })
  }
  // Nearest first, then by name, so the list reads the same on every run.
  return entries.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))
}

// ─── Analysis ────────────────────────────────────────────────────────

export function analyzeImpact(
  workspace: Workspace,
  ids: Iterable<string>,
  options: ImpactOptions = {},
): ImpactReport {
  const maxDepth = Math.max(1, options.maxDepth ?? DEFAULT_IMPACT_DEPTH)
  const flat = flatten(workspace)
  const { idSet, deletedContainerIds, allDeletedIds } = collectCascadeIds(workspace, ids)

  const targets: ImpactRef[] = []
  const descendants: ImpactRef[] = []
  for (const id of allDeletedIds) {
    const ref = refOf(flat, id)
    if (!ref) continue
    if (idSet.has(id)) targets.push(ref)
    else descendants.push(ref)
  }
  targets.sort((a, b) => a.name.localeCompare(b.name))
  descendants.sort((a, b) => a.name.localeCompare(b.name))

  // Relationship graph over surviving elements, plus the links that break.
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  const survivingLinkCount = new Map<string, number>()
  const hadLink = new Set<string>()
  const brokenLinks: ImpactLink[] = []

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }

  for (const rel of workspace.model.relationships) {
    const sourceGone = allDeletedIds.has(rel.sourceId)
    const destinationGone = allDeletedIds.has(rel.destinationId)
    hadLink.add(rel.sourceId)
    hadLink.add(rel.destinationId)

    if (!sourceGone && !destinationGone) {
      push(incoming, rel.destinationId, rel.sourceId)
      push(outgoing, rel.sourceId, rel.destinationId)
      survivingLinkCount.set(rel.sourceId, (survivingLinkCount.get(rel.sourceId) ?? 0) + 1)
      survivingLinkCount.set(rel.destinationId, (survivingLinkCount.get(rel.destinationId) ?? 0) + 1)
      continue
    }

    // A broken link still tells us who was connected, so seed the traversal
    // graph with it — otherwise a direct neighbour of the removed set would be
    // unreachable from it.
    push(incoming, rel.destinationId, rel.sourceId)
    push(outgoing, rel.sourceId, rel.destinationId)

    brokenLinks.push({
      id: rel.id,
      sourceId: rel.sourceId,
      destinationId: rel.destinationId,
      sourceName: flat.get(rel.sourceId)?.element.name ?? rel.sourceId,
      destinationName: flat.get(rel.destinationId)?.element.name ?? rel.destinationId,
      description: rel.description?.trim() ?? '',
      side: sourceGone && destinationGone ? 'internal' : sourceGone ? 'outbound' : 'inbound',
    })
  }

  const dependents = toReach(flat, reachFrom(allDeletedIds, incoming, allDeletedIds, maxDepth))
  const dependencies = toReach(flat, reachFrom(allDeletedIds, outgoing, allDeletedIds, maxDepth))

  const orphaned: ImpactRef[] = []
  for (const id of hadLink) {
    if (allDeletedIds.has(id)) continue
    if ((survivingLinkCount.get(id) ?? 0) > 0) continue
    const ref = refOf(flat, id)
    if (ref) orphaned.push(ref)
  }
  orphaned.sort((a, b) => a.name.localeCompare(b.name))

  // View fallout, following the same rules the delete itself applies: a scoped
  // view whose scope element is targeted goes with it, everything else just
  // loses the elements that vanished.
  const views: ImpactView[] = []
  for (const view of allViews(workspace)) {
    const deleted =
      ((view.type === 'systemContext' || view.type === 'container') &&
        !!view.softwareSystemId && idSet.has(view.softwareSystemId)) ||
      (view.type === 'component' &&
        !!view.containerId && (idSet.has(view.containerId) || deletedContainerIds.has(view.containerId)))
    const lostElements = view.elements.reduce(
      (count, element) => count + (allDeletedIds.has(element.id) ? 1 : 0),
      0,
    )
    if (!deleted && lostElements === 0) continue
    views.push({
      key: view.key,
      title: view.title?.trim() || view.key,
      type: view.type,
      deleted,
      lostElements,
    })
  }

  const removedIds = [...allDeletedIds]
  const directIds = new Set<string>()
  for (const entry of dependents) if (entry.depth === 1) directIds.add(entry.id)
  for (const entry of dependencies) if (entry.depth === 1) directIds.add(entry.id)

  const summary: ImpactSummary = {
    removed: removedIds.length,
    brokenLinks: brokenLinks.length,
    dependents: dependents.length,
    dependencies: dependencies.length,
    orphaned: orphaned.length,
    viewsDeleted: views.filter((view) => view.deleted).length,
    viewsChanged: views.filter((view) => !view.deleted).length,
  }

  return {
    targets,
    descendants,
    brokenLinks,
    dependents,
    dependencies,
    orphaned,
    views,
    removedIds,
    affectedIds: [...removedIds, ...directIds],
    summary,
    // A view simply losing the removed element is not fallout — every view it
    // appeared on does that. Isolation is about what *breaks*.
    isolated:
      descendants.length === 0 &&
      brokenLinks.length === 0 &&
      dependents.length === 0 &&
      dependencies.length === 0 &&
      orphaned.length === 0 &&
      summary.viewsDeleted === 0,
  }
}

// ─── Presentation helpers ────────────────────────────────────────────

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** One-line risk summary for the panel header and screen-reader announcements. */
export function formatImpactHeadline(report: ImpactReport): string {
  if (report.targets.length === 0) return 'Nothing selected'
  const name = report.targets.length === 1
    ? `"${report.targets[0].name}"`
    : `${report.targets.length} elements`

  if (report.isolated) return `Removing ${name} affects nothing else`

  const clauses: string[] = []
  const breaking = report.dependents.filter((entry) => entry.depth === 1).length
  if (report.brokenLinks.length > 0) clauses.push(plural(report.brokenLinks.length, 'relationship'))
  if (breaking > 0) clauses.push(plural(breaking, 'dependent'))
  if (report.summary.viewsDeleted > 0) clauses.push(plural(report.summary.viewsDeleted, 'view') + ' deleted')
  if (report.orphaned.length > 0) clauses.push(plural(report.orphaned.length, 'element') + ' orphaned')

  if (clauses.length === 0) return `Removing ${name} affects nothing else`
  if (clauses.length === 1) return `Removing ${name} breaks ${clauses[0]}`
  const tail = `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`
  return `Removing ${name} breaks ${tail}`
}

/** `System / Container / Component` path for display. */
export function formatImpactPath(ref: ImpactRef): string {
  return [...ref.parentPath, ref.name].join(' / ')
}
