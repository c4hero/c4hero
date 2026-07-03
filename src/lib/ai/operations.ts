import type { Workspace } from '@/types/model'
import type { EditOp, EditPlan } from './types'
import { elementNameMap, flattenElements } from './context'

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
  updateElement: (id: string, patch: { name?: string; description?: string; technology?: string; location?: 'Internal' | 'External' }) => void
  updateRelationship: (id: string, patch: { description?: string; technology?: string }) => void
  deleteElement: (id: string) => void
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
// updates, then deletes (last, so nothing a relationship needs is gone first).
// Exported so repo-scan's proposal merge sorts by the SAME order applyEditPlan
// applies in — otherwise the two paths could disagree and drop children whose
// parent resolves in one ordering but not the other.
export function editOpRank(op: EditOp): number {
  switch (op.op) {
    case 'addPerson':
    case 'addSoftwareSystem': return 0
    case 'addContainer': return 1
    case 'addComponent': return 2
    case 'addRelationship': return 3
    case 'updateElement':
    case 'updateRelationship': return 4
    case 'deleteElement': return 5
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
  // External systems can't hold containers (the UI forbids it via getCreatableTypes);
  // reject AI ops that would create that otherwise-impossible model state.
  const externalSystemIds = new Set(
    ws.model.softwareSystems.filter((s) => s.location === 'External').map((s) => s.id),
  )
  const applied: AppliedOp[] = []

  // Register a newly-created element so later ops can target it by ref, id, or name.
  const register = (ref: string, id: string, name: string) => {
    refMap.set(ref, id)
    validIds.add(id)
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
        register(op.ref, id, op.name)
        const desc = optStr(op.description)
        if (desc) actions.updateElement(id, { description: desc })
        ok(op)
        break
      }
      case 'addSoftwareSystem': {
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addSoftwareSystem(op.name.trim(), op.external)
        register(op.ref, id, op.name)
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
        register(op.ref, id, op.name)
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
        register(op.ref, id, op.name)
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
        if (!validIds.has(op.id)) { skip(op, 'element not found'); break }
        const name = optStr(op.name)
        const description = optStr(op.description)
        const technology = optStr(op.technology)
        // The store treats a present-but-undefined key as "clear this field"
        // (so the UI can blank out a text box). Only include a key here when
        // the op actually set it, so an op that e.g. only changes location
        // doesn't wipe out the element's existing name/description/technology.
        actions.updateElement(op.id, {
          ...(name && { name }),
          ...(description && { description }),
          ...(technology && { technology }),
          // Guard the value — isEditOp doesn't type-check it, so a bogus string
          // from the model must not reach the store.
          location: op.location === 'External' || op.location === 'Internal' ? op.location : undefined,
        })
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
      case 'deleteElement': {
        if (!validIds.has(op.id)) { skip(op, 'element not found'); break }
        actions.deleteElement(op.id)
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
        return `Update ${label(op.id)}${op.name ? ` → rename “${op.name}”` : ''}${op.description ? ' (description)' : ''}${op.technology ? ` (tech: ${op.technology})` : ''}${op.location ? ` (${op.location.toLowerCase()})` : ''}`
      case 'updateRelationship':
        return `Update relationship ${op.id}${op.description ? ` (“${op.description}”)` : ''}`
      case 'deleteElement':
        return `Delete ${label(op.id)}`
      default:
        return 'Unknown operation'
    }
  })
}
