import type { Workspace } from '@/types/model'
import type { EditOp, EditPlan } from './types'
import { elementNameMap } from './context'

// Apply an AI-produced EditPlan against the workspace store. The applier is
// decoupled from zustand via the EditActions interface so it can be unit-tested
// with a fake. New elements are created with a temporary `ref`; the applier maps
// each ref to the real id the store returns, so later ops/relationships resolve.

export interface EditActions {
  addPerson: (name: string) => string
  addSoftwareSystem: (name: string) => string
  addContainer: (systemId: string, name: string) => string
  addComponent: (containerId: string, name: string) => string
  addRelationship: (sourceId: string, destinationId: string, description?: string, technology?: string) => string
  updateElement: (id: string, patch: { name?: string; description?: string; technology?: string }) => void
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

/** Apply each operation in order, resolving refs to real ids. Invalid ops
 *  (unknown parent, missing element, empty name) are skipped, not fatal. */
export function applyEditPlan(
  plan: EditPlan,
  actions: EditActions,
  validIds: ReadonlySet<string>,
): ApplyResult {
  const refMap = new Map<string, string>()
  const applied: AppliedOp[] = []

  // Resolve a token to a concrete id: a ref defined earlier, an existing id,
  // or null when it can't be resolved.
  const resolve = (token: string | undefined): string | null => {
    if (!token) return null
    if (refMap.has(token)) return refMap.get(token)!
    if (validIds.has(token)) return token
    return null
  }

  const skip = (op: EditOp, reason: string) => applied.push({ op, ok: false, reason })
  const ok = (op: EditOp) => applied.push({ op, ok: true })

  for (const op of plan.operations) {
    switch (op.op) {
      case 'addPerson': {
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addPerson(op.name.trim())
        refMap.set(op.ref, id)
        validIds = new Set(validIds).add(id)
        if (op.description?.trim()) actions.updateElement(id, { description: op.description.trim() })
        ok(op)
        break
      }
      case 'addSoftwareSystem': {
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addSoftwareSystem(op.name.trim())
        refMap.set(op.ref, id)
        validIds = new Set(validIds).add(id)
        if (op.description?.trim()) actions.updateElement(id, { description: op.description.trim() })
        ok(op)
        break
      }
      case 'addContainer': {
        const parentId = resolve(op.parent)
        if (!parentId) { skip(op, 'unknown parent system'); break }
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addContainer(parentId, op.name.trim())
        if (!id) { skip(op, 'parent is not a software system'); break }
        refMap.set(op.ref, id)
        validIds = new Set(validIds).add(id)
        if (op.description?.trim() || op.technology?.trim()) {
          actions.updateElement(id, { description: op.description?.trim(), technology: op.technology?.trim() })
        }
        ok(op)
        break
      }
      case 'addComponent': {
        const parentId = resolve(op.parent)
        if (!parentId) { skip(op, 'unknown parent container'); break }
        if (!op.name?.trim()) { skip(op, 'missing name'); break }
        const id = actions.addComponent(parentId, op.name.trim())
        if (!id) { skip(op, 'parent is not a container'); break }
        refMap.set(op.ref, id)
        validIds = new Set(validIds).add(id)
        if (op.description?.trim() || op.technology?.trim()) {
          actions.updateElement(id, { description: op.description?.trim(), technology: op.technology?.trim() })
        }
        ok(op)
        break
      }
      case 'addRelationship': {
        const source = resolve(op.source)
        const destination = resolve(op.destination)
        if (!source || !destination) { skip(op, 'unknown source or destination'); break }
        if (source === destination) { skip(op, 'self-relationship'); break }
        const id = actions.addRelationship(source, destination, op.description?.trim() || undefined, op.technology?.trim() || undefined)
        if (!id) { skip(op, 'could not create relationship'); break }
        ok(op)
        break
      }
      case 'updateElement': {
        if (!validIds.has(op.id)) { skip(op, 'element not found'); break }
        actions.updateElement(op.id, {
          name: op.name?.trim() || undefined,
          description: op.description?.trim() || undefined,
          technology: op.technology?.trim() || undefined,
        })
        ok(op)
        break
      }
      case 'updateRelationship': {
        actions.updateRelationship(op.id, {
          description: op.description?.trim() || undefined,
          technology: op.technology?.trim() || undefined,
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

/** Human-readable, one-line-per-op preview, resolving existing ids to names. */
export function describeOps(plan: EditPlan, ws: Workspace | null): string[] {
  const names = ws ? elementNameMap(ws) : new Map<string, string>()
  const refNames = new Map<string, string>()
  const label = (token: string): string => refNames.get(token) ?? names.get(token) ?? token

  return plan.operations.map((op) => {
    switch (op.op) {
      case 'addPerson':
        refNames.set(op.ref, op.name)
        return `Add person “${op.name}”`
      case 'addSoftwareSystem':
        refNames.set(op.ref, op.name)
        return `Add software system “${op.name}”`
      case 'addContainer':
        refNames.set(op.ref, op.name)
        return `Add container “${op.name}”${op.technology ? ` (${op.technology})` : ''} to ${label(op.parent)}`
      case 'addComponent':
        refNames.set(op.ref, op.name)
        return `Add component “${op.name}”${op.technology ? ` (${op.technology})` : ''} to ${label(op.parent)}`
      case 'addRelationship':
        return `Connect ${label(op.source)} → ${label(op.destination)}${op.description ? ` (“${op.description}”)` : ''}`
      case 'updateElement':
        return `Update ${label(op.id)}${op.name ? ` → rename “${op.name}”` : ''}${op.description ? ' (description)' : ''}${op.technology ? ` (tech: ${op.technology})` : ''}`
      case 'updateRelationship':
        return `Update relationship ${op.id}${op.description ? ` (“${op.description}”)` : ''}`
      case 'deleteElement':
        return `Delete ${label(op.id)}`
      default:
        return 'Unknown operation'
    }
  })
}
