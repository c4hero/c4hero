import type { Workspace, View } from '@/types/model'
import type { EditOp, EditPlan } from './types'
import { flattenElements } from './context'

// Classify where a proposed operation lands relative to the view the user is on,
// so a plan preview can label each change. Heuristic but pure + unit-tested.
//
//  - 'view'      — touches an element on the current screen, or a new element
//                  whose natural home is this view type
//  - 'context'   — a person/external system (belongs to a landscape/context view)
//  - 'component' — a component (belongs to a component view)
//  - 'model'     — a model-level change not tied to the current view

export type PlanScope = 'view' | 'context' | 'component' | 'model'

/**
 * @param viewRefs refs of elements created earlier in the SAME plan that land on
 *   this view, so a later op referencing such a ref resolves as in-view even
 *   though the element doesn't exist in `ws` yet. Use {@link classifyPlanScopes}
 *   to classify a whole plan with this wired up.
 */
// Precomputed lookups for a (ws, view) pair. Built once per plan and reused
// across every op, so classifying an N-op plan is a single model walk instead
// of O(N) walks with a linear find per token.
interface ScopeCtx {
  viewIds: Set<string>
  ids: Set<string>
  nameToId: Map<string, string>
}

function buildScopeCtx(ws: Workspace, view: View): ScopeCtx {
  const ids = new Set<string>()
  const nameToId = new Map<string, string>()
  for (const e of flattenElements(ws)) {
    ids.add(e.id)
    const k = e.name.trim().toLowerCase()
    if (k && !nameToId.has(k)) nameToId.set(k, e.id)
  }
  return { viewIds: new Set(view.elements.map((e) => e.id)), ids, nameToId }
}

function classifyWithCtx(op: EditOp, view: View, ctx: ScopeCtx, viewRefs?: ReadonlySet<string>): PlanScope {
  const { viewIds, ids, nameToId } = ctx
  const idForToken = (token: string): string | undefined => {
    if (viewIds.has(token) || ids.has(token)) return token
    return nameToId.get(token.trim().toLowerCase())
  }
  const inView = (token: string): boolean => {
    if (viewRefs?.has(token)) return true
    const id = idForToken(token)
    return id !== undefined && viewIds.has(id)
  }

  switch (op.op) {
    case 'addPerson':
    case 'addSoftwareSystem':
      return view.type === 'systemLandscape' || view.type === 'systemContext' ? 'view' : 'context'
    case 'addContainer':
      // Only lands on THIS container view when added to the view's own system.
      return view.type === 'container' && idForToken(op.parent) === view.softwareSystemId ? 'view' : 'model'
    case 'addComponent':
      // Only lands on THIS component view when added to the view's own container.
      return view.type === 'component' && idForToken(op.parent) === view.containerId ? 'view' : 'component'
    case 'addRelationship':
      return inView(op.source) && inView(op.destination) ? 'view' : 'model'
    case 'updateElement':
    case 'deleteElement':
      return inView(op.id) ? 'view' : 'model'
    case 'updateRelationship':
      return view.relationships.some((r) => r.id === op.id) ? 'view' : 'model'
    case 'addView':
      // A view-creating op produces the visible artifact itself — label it 'view'
      // so the plan preview flags it as landing on-screen (a new screen).
      return 'view'
    default:
      return 'model'
  }
}

/** Classify every op in a plan, resolving in-plan-created refs: an op that
 *  references an element added earlier in the same plan (which lands on this
 *  view) is correctly tagged 'view' rather than 'model'. */
export function classifyPlanScopes(plan: EditPlan, ws: Workspace, view: View): PlanScope[] {
  const ctx = buildScopeCtx(ws, view)
  const viewRefs = new Set<string>()
  for (const op of plan.operations) {
    if ((op.op === 'addPerson' || op.op === 'addSoftwareSystem' || op.op === 'addContainer' || op.op === 'addComponent')
      && classifyWithCtx(op, view, ctx) === 'view') {
      viewRefs.add(op.ref)
    }
  }
  return plan.operations.map((op) => classifyWithCtx(op, view, ctx, viewRefs))
}
