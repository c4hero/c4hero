import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { Relationship, View, Workspace } from '@/types/model'
import { nanoid, pushUndoSnapshot } from '../internals'
import { allViewsOf, elementExists, findViewHelper } from '../workspace-helpers'

/** Sequential renumber + membership recompute after any step edit.
 *
 *  Orders regenerate 1..n, which flattens parallel-sequence numbering — the
 *  editor is a linear list, so an edit is the user restating the sequence as
 *  linear. Membership is a projection of the steps (steps are all that
 *  serializes), so elements whose last step died drop out here. */
function normalizeDynamicView(ws: Workspace, view: View): void {
  view.relationships.forEach((step, i) => { step.order = String(i + 1) })
  const endpoints = new Set<string>()
  for (const step of view.relationships) {
    const rel = ws.model.relationships.find(r => r.id === step.id)
    const sourceId = step.sourceId ?? rel?.sourceId
    const destId = step.destinationId ?? rel?.destinationId
    if (sourceId) endpoints.add(sourceId)
    if (destId) endpoints.add(destId)
  }
  view.elements = view.elements.filter(e => endpoints.has(e.id))
}

export type DynamicStepSlice = Pick<WorkspaceState,
  | 'addDynamicStep' | 'updateDynamicStepDescription'
  | 'moveDynamicStep' | 'deleteDynamicStep'
>

export const createDynamicStepSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  DynamicStepSlice
> = (set) => ({
  addDynamicStep: (viewKey, sourceId, destinationId, description) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    const view = findViewHelper(ws, viewKey)
    if (!view || view.type !== 'dynamic') return
    if (sourceId === destinationId) return
    if (!elementExists(ws, sourceId) || !elementExists(ws, destinationId)) return

    pushUndoSnapshot(s)

    // Resolve the backing relationship the way the DSL parser does, minus
    // the hierarchy-implied tiers (the picker offers concrete elements):
    // exact forward, then exact reverse (a response step travelling back
    // over an existing relationship), else create the relationship.
    let rel = ws.model.relationships.find(
      r => r.sourceId === sourceId && r.destinationId === destinationId,
    )
    let response = false
    if (!rel) {
      const reverse = ws.model.relationships.find(
        r => r.sourceId === destinationId && r.destinationId === sourceId,
      )
      if (reverse) {
        rel = reverse
        response = true
      }
    }
    if (!rel) {
      const created: Relationship = {
        id: nanoid(8),
        sourceId,
        destinationId,
        description,
        tags: ['Relationship'],
        properties: {},
      }
      ws.model.relationships.push(created)
      rel = created
      // Non-dynamic views that show both endpoints pick up the new
      // relationship, same as addRelationship. Dynamic views stay authored;
      // deployment views derive their edges from the topology.
      for (const v of allViewsOf(ws)) {
        if (v.type === 'dynamic' || v.type === 'deployment') continue
        const ids = new Set(v.elements.map(e => e.id))
        if (ids.has(sourceId) && ids.has(destinationId) && !v.relationships.some(r => r.id === rel!.id)) {
          v.relationships.push({ id: rel.id })
        }
      }
    }

    view.relationships.push({
      id: rel.id,
      sourceId,
      destinationId,
      response: response ? true : undefined,
      order: String(view.relationships.length + 1),
      // A description matching the relationship's own is not an override.
      description: description && description !== rel.description ? description : undefined,
    })
    for (const id of [sourceId, destinationId]) {
      if (!view.elements.some(e => e.id === id)) view.elements.push({ id })
    }
    normalizeDynamicView(ws, view)
    s.layoutVersion += 1
  }),

  updateDynamicStepDescription: (viewKey, stepIndex, description) => set((s) => {
    if (!s.workspace) return
    const view = findViewHelper(s.workspace, viewKey)
    if (!view || view.type !== 'dynamic') return
    const step = view.relationships[stepIndex]
    if (!step) return
    const rel = s.workspace.model.relationships.find(r => r.id === step.id)
    const trimmed = description.trim()
    // Clearing the override falls back to the relationship's description.
    const next = trimmed && trimmed !== rel?.description ? trimmed : undefined
    if (step.description === next) return
    pushUndoSnapshot(s)
    step.description = next
  }),

  moveDynamicStep: (viewKey, stepIndex, direction) => set((s) => {
    if (!s.workspace) return
    const view = findViewHelper(s.workspace, viewKey)
    if (!view || view.type !== 'dynamic') return
    const target = direction === 'up' ? stepIndex - 1 : stepIndex + 1
    if (stepIndex < 0 || stepIndex >= view.relationships.length) return
    if (target < 0 || target >= view.relationships.length) return
    pushUndoSnapshot(s)
    const steps = view.relationships
    ;[steps[stepIndex], steps[target]] = [steps[target], steps[stepIndex]]
    normalizeDynamicView(s.workspace, view)
  }),

  deleteDynamicStep: (viewKey, stepIndex) => set((s) => {
    if (!s.workspace) return
    const view = findViewHelper(s.workspace, viewKey)
    if (!view || view.type !== 'dynamic') return
    if (stepIndex < 0 || stepIndex >= view.relationships.length) return
    pushUndoSnapshot(s)
    view.relationships.splice(stepIndex, 1)
    normalizeDynamicView(s.workspace, view)
    s.layoutVersion += 1
  }),
})
