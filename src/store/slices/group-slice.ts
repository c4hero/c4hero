import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { Group } from '@/types/model'
import { nanoid, pushUndoSnapshot } from '../internals'

export type GroupSlice = Pick<WorkspaceState, 'addGroup' | 'updateGroup' | 'deleteGroup'>

export const createGroupSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  GroupSlice
> = (set) => ({
  addGroup: (name, elementIds = []) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const group: Group = { id, name, elementIds }
      s.workspace.model.groups.push(group)
    })
    return id
  },

  updateGroup: (id, patch) => set((s) => {
    if (!s.workspace) return
    const group = s.workspace.model.groups.find(g => g.id === id)
    if (!group) return
    let changed = false
    if (patch.name !== undefined && group.name !== patch.name) { group.name = patch.name; changed = true }
    if (patch.elementIds !== undefined) { group.elementIds = patch.elementIds; changed = true } // array, always treat as a change
    if (!changed) return
    pushUndoSnapshot(s)
  }),

  deleteGroup: (id) => set((s) => {
    if (!s.workspace) return
    if (!s.workspace.model.groups.some(g => g.id === id)) return
    pushUndoSnapshot(s)
    s.workspace.model.groups = s.workspace.model.groups.filter(g => g.id !== id)
    if (s.selectedGroupId === id) s.selectedGroupId = null
  }),
})
