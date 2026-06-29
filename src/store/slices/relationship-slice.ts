import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { Relationship } from '@/types/model'
import { nanoid, pushUndoSnapshot } from '../internals'
import { allViewsOf, elementExists, forEachView, closeAiSurfaces } from '../workspace-helpers'

export type RelationshipSlice = Pick<WorkspaceState,
  | 'addRelationship' | 'updateRelationship'
  | 'reconnectRelationship' | 'deleteRelationship'
>

export const createRelationshipSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  RelationshipSlice
> = (set) => ({
  addRelationship: (sourceId, destinationId, description, technology) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      if (!s.workspace) return
      if (sourceId === destinationId) return
      const ws = s.workspace
      if (!elementExists(ws, sourceId) || !elementExists(ws, destinationId)) return
      pushUndoSnapshot(s)
      const rel: Relationship = {
        id,
        sourceId,
        destinationId,
        description,
        technology,
        tags: ['Relationship'],
        properties: {},
      }
      ws.model.relationships.push(rel)
      created = true
      // For systemContext views: if one endpoint is the scoped system, auto-add
      // the other endpoint (external actor) to the view so the context diagram stays
      // consistent — a person/system related to the scope should appear in its context view.
      for (const v of ws.views.systemContextViews) {
        if (!v.softwareSystemId) continue
        const scopeId = v.softwareSystemId
        const sourceIsScope = sourceId === scopeId
        const destIsScope = destinationId === scopeId
        if (sourceIsScope || destIsScope) {
          const actorId = sourceIsScope ? destinationId : sourceId
          if (!v.elements.some(e => e.id === actorId)) {
            v.elements.push({ id: actorId })
          }
        }
      }
      // Add relationship ref to every view that now has both endpoints
      for (const view of allViewsOf(ws)) {
        const viewElIds = new Set(view.elements.map(e => e.id))
        if (viewElIds.has(sourceId) && viewElIds.has(destinationId)) {
          if (!view.relationships.some(r => r.id === id)) {
            view.relationships.push({ id })
          }
        }
      }
      s.selectedRelationshipId = id
      s.selectedElementIds = []
      s.selectedGroupId = null
      // Match the add-node methods: opening the inspector for the new
      // relationship closes the assistant — but not during an AI batch apply
      // (keep it for the results) or while the assistant is mid-flow (aiPanelBusy).
      if (!s.batchApplying && !s.aiPanelBusy) closeAiSurfaces(s)
    })
    return created ? id : ''
  },

  updateRelationship: (id, patch) => set((s) => {
    if (!s.workspace) return
    const rel = s.workspace.model.relationships.find(r => r.id === id)
    if (!rel) return
    // Use 'key in patch' for optional fields that the UI may legitimately clear by passing
    // undefined (e.g. empty text field → { description: undefined }). Only push undo if at
    // least one field actually changed.
    let changed = false
    if ('description' in patch && rel.description !== patch.description) { rel.description = patch.description; changed = true }
    if ('technology' in patch && rel.technology !== patch.technology) { rel.technology = patch.technology; changed = true }
    if ('interactionStyle' in patch && rel.interactionStyle !== patch.interactionStyle) { rel.interactionStyle = patch.interactionStyle; changed = true }
    if ('lineStyle' in patch && rel.lineStyle !== patch.lineStyle) { rel.lineStyle = patch.lineStyle; changed = true }
    if ('url' in patch && rel.url !== patch.url) { rel.url = patch.url; changed = true }
    if (patch.tags !== undefined) {
      const tagsChanged = patch.tags.length !== rel.tags.length || patch.tags.some((t, i) => t !== rel.tags[i])
      if (tagsChanged) { rel.tags = patch.tags; changed = true }
    }
    if (!changed) return
    pushUndoSnapshot(s)
  }),

  reconnectRelationship: (id, newSourceId, newTargetId) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    const rel = ws.model.relationships.find(r => r.id === id)
    if (!rel) return
    if (rel.sourceId === newSourceId && rel.destinationId === newTargetId) return
    if (newSourceId === newTargetId) return
    if (!elementExists(ws, newSourceId) || !elementExists(ws, newTargetId)) return
    pushUndoSnapshot(s)
    rel.sourceId = newSourceId
    rel.destinationId = newTargetId

    // Mirror addRelationship semantics for system context views: when one endpoint
    // is the scoped system, ensure the other endpoint is visible so the context
    // diagram still expresses the relationship after reconnecting.
    for (const v of ws.views.systemContextViews) {
      if (!v.softwareSystemId) continue
      const scopeId = v.softwareSystemId
      const sourceIsScope = newSourceId === scopeId
      const destIsScope = newTargetId === scopeId
      if (sourceIsScope || destIsScope) {
        const actorId = sourceIsScope ? newTargetId : newSourceId
        if (!v.elements.some(e => e.id === actorId)) {
          v.elements.push({ id: actorId })
        }
      }
    }

    // Sync view.relationships: keep only in views where both new endpoints exist
    forEachView(ws, (v) => {
      const elIds = new Set(v.elements.map(e => e.id))
      const hasRel = v.relationships.some(r => r.id === id)
      const bothPresent = elIds.has(newSourceId) && elIds.has(newTargetId)
      if (hasRel && !bothPresent) {
        v.relationships = v.relationships.filter(r => r.id !== id)
      } else if (!hasRel && bothPresent) {
        v.relationships.push({ id })
      }
    })
  }),

  deleteRelationship: (id) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    if (!ws.model.relationships.some(r => r.id === id)) return
    pushUndoSnapshot(s)
    ws.model.relationships = ws.model.relationships.filter(r => r.id !== id)
    forEachView(ws, (v) => {
      v.relationships = v.relationships.filter(r => r.id !== id)
    })
    if (s.selectedRelationshipId === id) s.selectedRelationshipId = null
  }),
})
