import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import { pushUndoSnapshot } from '../internals'
import { forEachElementHelper } from '../workspace-helpers'
import { BUILTIN_TAGS } from '../builtin-tags'

export type TagStyleSlice = Pick<WorkspaceState,
  | 'updateElementStyle' | 'removeElementStyle'
  | 'renameTag' | 'removeTagGlobal'
>

export const createTagStyleSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  TagStyleSlice
> = (set) => ({
  updateElementStyle: (style) => set((s) => {
    if (!s.workspace) return
    const styles = s.workspace.views.configuration.styles.elements
    const idx = styles.findIndex((es) => es.tag === style.tag)
    if (idx >= 0) {
      // No-op guard: if every incoming field already matches, skip the undo push
      const existing = styles[idx]
      const keys = Object.keys(style) as (keyof typeof style)[]
      const changed = keys.some(k => k !== 'tag' && style[k] !== existing[k])
      if (!changed) return
      pushUndoSnapshot(s)
      styles[idx] = { ...existing, ...style }
    } else {
      pushUndoSnapshot(s)
      styles.push(style)
    }
  }),

  removeElementStyle: (tag) => set((s) => {
    // Built-in tag styles CAN be removed — the theme provides the fallback.
    if (!s.workspace) return
    const styles = s.workspace.views.configuration.styles.elements
    if (!styles.some((es) => es.tag === tag)) return
    pushUndoSnapshot(s)
    s.workspace.views.configuration.styles.elements = styles.filter((es) => es.tag !== tag)
  }),

  renameTag: (oldTag, newTag) => set((s) => {
    if (!newTag.trim() || oldTag === newTag) return
    if (BUILTIN_TAGS.has(oldTag)) return // Built-in tags cannot be renamed
    if (BUILTIN_TAGS.has(newTag.trim())) return // Cannot rename a custom tag to a built-in name
    if (!s.workspace) return
    const ws = s.workspace
    // Quick existence check before doing any mutation
    let exists = ws.views.configuration.styles.elements.some(es => es.tag === oldTag)
      || ws.views.configuration.styles.relationships.some(rs => rs.tag === oldTag)
      || ws.model.relationships.some(r => r.tags.includes(oldTag))
    if (!exists) forEachElementHelper(ws, (el) => { if (el.tags.includes(oldTag)) { exists = true; return true } })
    if (!exists) return
    pushUndoSnapshot(s)
    forEachElementHelper(ws, (el) => { el.tags = el.tags.map(t => t === oldTag ? newTag : t) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.map(t => t === oldTag ? newTag : t) }
    const elStyle = ws.views.configuration.styles.elements.find(es => es.tag === oldTag)
    if (elStyle) elStyle.tag = newTag
    const relStyle = ws.views.configuration.styles.relationships.find(rs => rs.tag === oldTag)
    if (relStyle) relStyle.tag = newTag
    s.activeTagFilter = s.activeTagFilter.map((t) => (t === oldTag ? newTag : t))
  }),

  removeTagGlobal: (tag) => set((s) => {
    if (BUILTIN_TAGS.has(tag)) return // Built-in tags cannot be removed
    if (!s.workspace) return
    const ws = s.workspace
    let exists = ws.views.configuration.styles.elements.some(es => es.tag === tag)
      || ws.views.configuration.styles.relationships.some(rs => rs.tag === tag)
      || ws.model.relationships.some(r => r.tags.includes(tag))
    if (!exists) forEachElementHelper(ws, (el) => { if (el.tags.includes(tag)) { exists = true; return true } })
    if (!exists) return
    pushUndoSnapshot(s)
    forEachElementHelper(ws, (el) => { el.tags = el.tags.filter(t => t !== tag) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.filter(t => t !== tag) }
    ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter(es => es.tag !== tag)
    ws.views.configuration.styles.relationships = ws.views.configuration.styles.relationships.filter(rs => rs.tag !== tag)
    s.activeTagFilter = s.activeTagFilter.filter((t) => t !== tag)
  }),
})
