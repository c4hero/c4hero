import type { Workspace, View } from '@/types/model'
import type { EditOp } from './types'
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

export function classifyScope(op: EditOp, ws: Workspace, view: View): PlanScope {
  const viewIds = new Set(view.elements.map((e) => e.id))
  const flat = flattenElements(ws)
  const idForToken = (token: string): string | undefined => {
    if (viewIds.has(token)) return token
    const el = flat.find((e) => e.id === token || e.name.trim().toLowerCase() === token.trim().toLowerCase())
    return el?.id
  }
  const inView = (token: string): boolean => {
    const id = idForToken(token)
    return id !== undefined && viewIds.has(id)
  }

  switch (op.op) {
    case 'addPerson':
    case 'addSoftwareSystem':
      return view.type === 'systemLandscape' || view.type === 'systemContext' ? 'view' : 'context'
    case 'addContainer':
      return view.type === 'container' ? 'view' : 'model'
    case 'addComponent':
      return view.type === 'component' ? 'view' : 'component'
    case 'addRelationship':
      return inView(op.source) && inView(op.destination) ? 'view' : 'model'
    case 'updateElement':
    case 'deleteElement':
      return inView(op.id) ? 'view' : 'model'
    case 'updateRelationship':
      return view.relationships.some((r) => r.id === op.id) ? 'view' : 'model'
    default:
      return 'model'
  }
}
