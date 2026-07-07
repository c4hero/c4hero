import type { Workspace, ElementStatus, ViewType } from '@/types/model'
import type { EditOp, EditPlan } from './types'
import { elementNameMap, flattenElements } from './context'
import { ELEMENT_STATUS_VALUES } from './schema'

// Apply an AI-produced EditPlan against the workspace store. The applier is
// decoupled from zustand via the EditActions interface so it can be unit-tested
// with a fake. New elements are created with a temporary `ref`; the applier maps
// each ref to the real id the store returns, so later ops/relationships resolve.

export interface EditActions {
  addPerson: (name: string) => string
  addSoftwareSystem: (name: string, external?: boolean) => string
  addContainer: (systemId: string, name: string) => string
  addComponent: (containerId: string, name: string) => string
  addRelationship: (sourceId: string, destinationId: string, description?: string, technology?: string) => string
  updateElement: (id: string, patch: { name?: string; description?: string; technology?: string; location?: 'Internal' | 'External'; tags?: string[]; status?: ElementStatus; owner?: string }) => void
  updateRelationship: (id: string, patch: { description?: string; technology?: string }) => void
  deleteElement: (id: string) => void
  /** Create a view of `type` scoped to `scopeId` (a system for systemContext /
   *  container views, a container for component views, undefined for a landscape
   *  view). Auto-populates the view. Returns the new view key. */
  addView: (type: ViewType, scopeId: string | undefined, title?: string) => string
}

export interface AppliedOp {
  op: EditOp
  ok: boolean
  /** Reason the op was skipped, when ok is false. */
  reason?: string
}

export interface ApplyResult {
  applied: AppliedOp[]
  appliedCount: number
  skippedCount: number
}

// Dependency order: a parent/endpoint must be created before whatever references
// it. People+systems, then containers, then components, then relationships, then
// updates, then view creation (so an auto-populated view captures the elements
// and relationships just added), then deletes last (so nothing a relationship
// needs is gone first).
function editOpRank(op: EditOp): number {
  switch (op.op) {
    case 'addPerson':
    case 'addSoftwareSystem': return 0
    case 'addContainer': return 1
    case 'addComponent': return 2
    case 'addRelationship': return 3
    case 'updateElement':
    case 'updateRelationship': return 4
    case 'addView': return 5
    case 'deleteElement': return 6
    default: return 4
  }
}

// Optional string fields aren't type-checked by isEditOp (the JSON sanitizer only
// validates ids/refs/names), so a malformed value like `description: 5` would
// otherwise throw at `.trim()` and abort the ENTIRE apply. Coerce defensively:
// keep non-empty trimmed strings, drop anything else (number, null, object).
function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Validate an AI-proposed status against the enum, dropping anything invalid so
 *  a bogus value never reaches the store. */
function optStatus(v: unknown): ElementStatus | undefined {
  return typeof v === 'string' && ELEMENT_STATUS_VALUES.has(v) ? (v as ElementStatus) : undefined
}

/** Merge AI-proposed category tags into an element's existing tags. Additive by
 *  design: replacing the array would strip structural tags (Element, Container,
 *  Database, …) that drive styling, so "tag your datastores" would silently
 *  break the diagram. Returns a new array only when it genuinely adds a tag
 *  (case-insensitive), else undefined so the update is a no-op. */
function mergeTags(existing: string[] | undefined, proposed: unknown): string[] | undefined {
  if (!Array.isArray(proposed)) return undefined
  const clean = proposed.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
  if (!clean.length) return undefined
  const base = existing ?? []
  const seen = new Set(base.map((t) => t.toLowerCase()))
  const out = [...base]
  for (const t of clean) {
    const k = t.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(t) }
  }
  return out.length > base.length ? out : undefined
}

/** Apply each operation in dependency order, resolving refs to real ids. Invalid
 *  ops (unknown parent, missing element, empty name) are skipped, not fatal. */
export function applyEditPlan(
  plan: EditPlan,
  actions: EditActions,
  ws: Workspace,
): ApplyResult {
  const refMap = new Map<string, string>()
  // Name → id, so a relationship that references an element by its display name
  // (a common model behaviour, especially from the interview) still resolves.
  // First occurrence wins for duplicate names.
  const nameToId = new Map<string, string>()
  // Built from a SINGLE model walk: the set of valid ids, plus per-type id sets
  // so we can validate a parent BEFORE creating a child (the store's
  // addContainer/addComponent return a fresh id even when they skip creation on
  // a wrong parent type, so a post-hoc `if (!id)` guard is dead).
  const validIds = new Set<string>()
  const systemIds = new Set<string>()
  const containerIds = new Set<string>()
  for (const el of flattenElements(ws)) {
    validIds.add(el.id)
    const key = el.name.trim().toLowerCase()
    if (key && !nameToId.has(key)) nameToId.set(key, el.id)
    if (el.type === 'softwareSystem') systemIds.add(el.id)
    else if (el.type === 'container') containerIds.add(el.id)
  }
  const relIds = new Set(ws.model.relationships.map((r) => r.id))
  // Current tags per element, so an updateElement.tags op can MERGE (add) rather
  // than replace — see mergeTags. Built from the raw model (flattenElements drops
  // tags). Newly-created elements ARE seeded too (see register): the edit prompt
  // lets an updateElement target a same-plan ref, so a tags op on a just-added
  // element must merge onto its structural base (Element/Container …) instead of
  // replacing it via an empty base and wiping the store's built-in tags.
  const tagsById = new Map<string, string[]>()
  for (const p of ws.model.people) tagsById.set(p.id, p.tags)
  for (const sys of ws.model.softwareSystems) {
    tagsById.set(sys.id, sys.tags)
    for (const c of sys.containers) {
      tagsById.set(c.id, c.tags)
      for (const comp of c.components) tagsById.set(comp.id, comp.tags)
    }
  }
  // External systems can't hold containers (the UI forbids it via getCreatableTypes);
  // reject AI ops that would create that otherwise-impossible model state.
  const externalSystemIds = new Set(
    ws.model.softwareSystems.filter((s) => s.location === 'External').map((s) => s.id),
  )
  const applied: AppliedOp[] = []

  // Register a newly-created element so later ops can target it by ref, id, or name.
  // `tags` are the structural defaults the store assigned at creation (Element/
  // Container …); seeding them lets a same-plan updateElement.tags op merge rather
  // than clobber them (see tagsById / mergeTags).
  const register = (ref: string, id: string, name: string, tags: string[]) => {
    refMap.set(ref, id)
    validIds.add(id)
    tagsById.set(id, tags)
    const key = name.trim().toLowerCase()
    // Don't let a newly-created element hijack name resolution for an existing
    // element of the same name — keep the first (existing) mapping so a later
    // by-name reference can't silently resolve to the wrong element. Targeting
    // the new element by `ref` (the precise handle) still works.
    if (key && !nameToId.has(key)) nameToId.set(key, id)
  }

  // Resolve a token to a concrete id: a ref defined earlier, an existing id,
  // an element name, or null when it can't be resolved.
  const resolve = (token: string | undefined): string | null => {
    if (!token) return null
    if (refMap.has(token)) return refMap.get(token)!
    if (validIds.has(token)) return token
    return nameToId.get(token.trim().toLowerCase()) ?? null
  }

  // Like resolve() but WITHOUT the name fallback. Used by updateElement/
  // deleteElement: a name that collides across the model (two "Database"s) must
  // NOT silently retarget the first-walked one — a ref or real id is
  // unambiguous, a bare name is skipped. (Creates/relationships keep name
  // resolution via resolve(), where picking an existing element by name is the
  // intended convenience and the op isn't destructive to an unrelated element.)
  const resolveExact = (token: string | undefined): string | null => {
    if (!token) return null
    if (refMap.has(token)) return refMap.get(token)!
    return validIds.has(token) ? token : null
  }

  const skip = (op: EditOp, reason: string) => applied.push({ op, ok: false, reason })
  const ok = (op: EditOp) => applied.push({ op, ok: true })

  // Apply parents before children (and relationships/updates after the elements
  // they reference, deletes last). A model may emit a child before its parent; in
  // emitted order resolve() wouldn't find the parent and the child would be
  // dropped as "unknown parent". Stable sort preserves order within a rank.
  const ordered = [...plan.operations].sort((a, b) => editOpRank(a) - editOpRank(b))
  for (const op of ordered) {
    switch (op.op) {
      case 'addPerson': {
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addPerson(op.name.trim())
        register(op.ref, id, op.name, ['Element', 'Person'])
        const desc = optStr(op.description)
        if (desc) actions.updateElement(id, { description: desc })
        ok(op)
        break
      }
      case 'addSoftwareSystem': {
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addSoftwareSystem(op.name.trim(), op.external)
        register(op.ref, id, op.name, ['Element', 'Software System'])
        systemIds.add(id)
        if (op.external) externalSystemIds.add(id)
        const desc = optStr(op.description)
        if (desc) actions.updateElement(id, { description: desc })
        ok(op)
        break
      }
      case 'addContainer': {
        const parentId = resolve(op.parent)
        if (!parentId) { skip(op, 'unknown parent system'); break }
        if (!systemIds.has(parentId)) { skip(op, 'parent is not a software system'); break }
        if (externalSystemIds.has(parentId)) { skip(op, 'parent is an external system'); break }
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addContainer(parentId, op.name.trim())
        register(op.ref, id, op.name, ['Element', 'Container'])
        containerIds.add(id)
        const desc = optStr(op.description), tech = optStr(op.technology)
        if (desc || tech) actions.updateElement(id, { description: desc, technology: tech })
        ok(op)
        break
      }
      case 'addComponent': {
        const parentId = resolve(op.parent)
        if (!parentId) { skip(op, 'unknown parent container'); break }
        if (!containerIds.has(parentId)) { skip(op, 'parent is not a container'); break }
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addComponent(parentId, op.name.trim())
        register(op.ref, id, op.name, ['Element', 'Component'])
        const desc = optStr(op.description), tech = optStr(op.technology)
        if (desc || tech) actions.updateElement(id, { description: desc, technology: tech })
        ok(op)
        break
      }
      case 'addRelationship': {
        const source = resolve(op.source)
        const destination = resolve(op.destination)
        if (!source || !destination) { skip(op, 'unknown source or destination'); break }
        if (source === destination) { skip(op, 'self-relationship'); break }
        const id = actions.addRelationship(source, destination, optStr(op.description), optStr(op.technology))
        if (!id) { skip(op, 'could not create relationship'); break }
        ok(op)
        break
      }
      case 'updateElement': {
        // Resolve a same-plan ref or a real id (NOT a name — see resolveExact).
        // The edit prompt tells the model it may update an element it just added
        // by its ref, so a bare validIds check would silently drop those ops
        // (created container, unset status/owner).
        const id = resolveExact(op.id)
        if (!id) { skip(op, 'element not found'); break }
        const name = optStr(op.name)
        const description = optStr(op.description)
        const technology = optStr(op.technology)
        const owner = optStr(op.owner)
        const status = optStatus(op.status)
        const tags = mergeTags(tagsById.get(id), op.tags)
        // The store treats a present-but-undefined key as "clear this field"
        // (so the UI can blank out a text box). Only include a key here when
        // the op actually set it, so an op that e.g. only changes location
        // doesn't wipe out the element's existing name/description/technology.
        actions.updateElement(id, {
          ...(name && { name }),
          ...(description && { description }),
          ...(technology && { technology }),
          ...(tags && { tags }),
          ...(status && { status }),
          ...(owner && { owner }),
          // Guard the value — isEditOp doesn't type-check it, so a bogus string
          // from the model must not reach the store.
          location: op.location === 'External' || op.location === 'Internal' ? op.location : undefined,
        })
        // Keep the merged tags as the new base, so a second same-plan tags op on
        // this element merges onto them rather than the pre-update set.
        if (tags) tagsById.set(id, tags)
        ok(op)
        break
      }
      case 'updateRelationship': {
        if (!relIds.has(op.id)) { skip(op, 'relationship not found'); break }
        const description = optStr(op.description)
        const technology = optStr(op.technology)
        // Same "key presence clears the field" convention as updateElement above —
        // omit unset keys so a description-only update doesn't clear technology (or vice versa).
        actions.updateRelationship(op.id, {
          ...(description && { description }),
          ...(technology && { technology }),
        })
        ok(op)
        break
      }
      case 'addView': {
        const title = optStr(op.title)
        // Landscape spans the whole model — no scope element.
        if (op.viewType === 'systemLandscape') { actions.addView('systemLandscape', undefined, title); ok(op); break }
        const scopeId = resolve(op.scope)
        if (!scopeId) { skip(op, 'unknown view scope element'); break }
        // systemContext / container views are scoped to a software system;
        // component views to a container. Reject a mismatched scope rather than
        // create an empty or nonsensical view.
        if (op.viewType === 'systemContext' || op.viewType === 'container') {
          if (!systemIds.has(scopeId)) { skip(op, 'view scope is not a software system'); break }
        } else if (!containerIds.has(scopeId)) {
          skip(op, 'view scope is not a container'); break
        }
        actions.addView(op.viewType, scopeId, title)
        ok(op)
        break
      }
      case 'deleteElement': {
        const id = resolveExact(op.id)
        if (!id) { skip(op, 'element not found'); break }
        actions.deleteElement(id)
        ok(op)
        break
      }
      default: {
        skip(op as EditOp, 'unknown operation')
      }
    }
  }

  const appliedCount = applied.filter((a) => a.ok).length
  return { applied, appliedCount, skippedCount: applied.length - appliedCount }
}

/** One-line, human-readable summary of an ApplyResult's skipped operations,
 *  or null when everything applied. Reasons are grouped and counted so the UI
 *  can show e.g. "Skipped 2 of 7 changes — unknown parent system (2)." —
 *  applyEditPlan skips invalid ops rather than failing, and silently dropping
 *  them reads as success to the user. */
export function summarizeSkips(result: ApplyResult): string | null {
  if (result.skippedCount === 0) return null
  const counts = new Map<string, number>()
  for (const a of result.applied) {
    if (a.ok) continue
    const reason = a.reason ?? 'unknown reason'
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => (n > 1 ? `${reason} (${n})` : reason))
    .join(', ')
  const total = result.applied.length
  return `Skipped ${result.skippedCount} of ${total} ${total === 1 ? 'change' : 'changes'} — ${reasons}.`
}

const VIEW_KIND_LABEL: Record<ViewType, string> = {
  systemLandscape: 'a system landscape',
  systemContext: 'a system context',
  container: 'a container',
  component: 'a component',
}

/** Human-readable, one-line-per-op preview, resolving existing ids to names. */
export function describeOps(plan: EditPlan, ws: Workspace | null): string[] {
  const names = ws ? elementNameMap(ws) : new Map<string, string>()
  // Collect every in-plan ref→name up front, so an op that references a ref
  // defined by a LATER add op (plans aren't pre-sorted) still renders the name,
  // not the raw ref token.
  const refNames = new Map<string, string>()
  for (const op of plan.operations) {
    if (op.op === 'addPerson' || op.op === 'addSoftwareSystem' || op.op === 'addContainer' || op.op === 'addComponent') {
      refNames.set(op.ref, op.name)
    }
  }
  const label = (token: string): string => refNames.get(token) ?? names.get(token) ?? token

  return plan.operations.map((op) => {
    switch (op.op) {
      case 'addPerson':
        return `Add person “${op.name}”`
      case 'addSoftwareSystem':
        return `Add software system “${op.name}”`
      case 'addContainer':
        return `Add container “${op.name}”${op.technology ? ` (${op.technology})` : ''} to ${label(op.parent)}`
      case 'addComponent':
        return `Add component “${op.name}”${op.technology ? ` (${op.technology})` : ''} to ${label(op.parent)}`
      case 'addRelationship':
        return `Connect ${label(op.source)} → ${label(op.destination)}${op.description ? ` (“${op.description}”)` : ''}`
      case 'updateElement':
        return `Update ${label(op.id)}${op.name ? ` → rename “${op.name}”` : ''}${op.description ? ' (description)' : ''}${op.technology ? ` (tech: ${op.technology})` : ''}${op.tags?.length ? ` (tags: ${op.tags.join(', ')})` : ''}${op.status ? ` (status: ${op.status})` : ''}${op.owner ? ` (owner: ${op.owner})` : ''}${op.location ? ` (${op.location.toLowerCase()})` : ''}`
      case 'updateRelationship':
        return `Update relationship ${op.id}${op.description ? ` (“${op.description}”)` : ''}`
      case 'deleteElement':
        return `Delete ${label(op.id)}`
      case 'addView':
        return `Add ${VIEW_KIND_LABEL[op.viewType]} view${op.viewType !== 'systemLandscape' && op.scope ? ` of ${label(op.scope)}` : ''}${op.title ? ` (“${op.title}”)` : ''}`
      default:
        return 'Unknown operation'
    }
  })
}
