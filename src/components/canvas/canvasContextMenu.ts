import type { LucideIcon } from 'lucide-react'
import { EyeOff, Lock, LockOpen, Plus, Trash2, ZoomIn } from 'lucide-react'
import type { Command } from '@/lib/commands'
import { editingView } from '@/lib/zoom/editing'
import { backspaceLikeHandler } from '@/hooks/useKeyboardShortcuts'
import { useWorkspaceStore, isFocalScopeElement } from '@/store/workspace'

/** What a right click landed on. Groups and scope boundaries count as the
 * canvas: their own actions live in the inspector. */
export type CanvasMenuTarget =
  | { kind: 'element'; id: string }
  | { kind: 'relationship'; id: string }
  | { kind: 'canvas' }

export interface CanvasMenuItem {
  id: string
  label: string
  shortcut?: string
  icon?: LucideIcon
  danger?: boolean
  run: () => void
}

export interface CanvasMenuLookup {
  /** True when the React Flow node with this id draws a model element. */
  isElement: (nodeId: string) => boolean
  /** The relationship a React Flow edge draws, if any. */
  relationshipOf: (edgeId: string) => string | undefined
}

export function menuTargetFor(target: Element, lookup: CanvasMenuLookup): CanvasMenuTarget {
  const nodeId = target.closest('.react-flow__node')?.getAttribute('data-id')
  if (nodeId && lookup.isElement(nodeId)) return { kind: 'element', id: nodeId }
  if (nodeId) return { kind: 'canvas' }
  const edgeId = target.closest('.react-flow__edge')?.getAttribute('data-id')
    ?? target.closest('[data-relationship-label]')?.getAttribute('data-relationship-label')
  const relationshipId = edgeId ? lookup.relationshipOf(edgeId) : undefined
  return relationshipId ? { kind: 'relationship', id: relationshipId } : { kind: 'canvas' }
}

/** Right clicking something outside the selection selects it alone, as in
 * Figma; right clicking inside a selection keeps all of it. */
export function selectForMenu(target: CanvasMenuTarget) {
  const s = useWorkspaceStore.getState()
  if (target.kind === 'element' && !s.selectedElementIds.includes(target.id)) s.selectElements([target.id])
  if (target.kind === 'relationship' && s.selectedRelationshipId !== target.id) s.selectRelationship(target.id)
}

export interface CanvasMenuContext {
  commands: Command[]
  canZoomInto: (id: string) => boolean
  zoomInto: (id: string) => void
}

/** The menu for a target, as sections drawn with a separator between them.
 * Items reuse the command palette's commands and the keyboard shortcuts'
 * handlers, so each does exactly what its shortcut does. Reads the store as it
 * is now, so select the target first. */
export function canvasMenuSections(target: CanvasMenuTarget, context: CanvasMenuContext): CanvasMenuItem[][] {
  const s = useWorkspaceStore.getState()
  const byId = new Map(context.commands.map(c => [c.id, c]))
  const command = (id: string, overrides: Partial<CanvasMenuItem> = {}): CanvasMenuItem | null => {
    const c = byId.get(id)
    if (!c || (c.when && !c.when())) return null
    return { id, label: c.label, shortcut: c.shortcut, icon: c.icon, run: () => void c.execute(), ...overrides }
  }
  const sections = (...groups: (CanvasMenuItem | null)[][]) =>
    groups.map(items => items.filter((item): item is CanvasMenuItem => !!item)).filter(items => items.length > 0)
  const zoomIn = (id: string): CanvasMenuItem | null => context.canZoomInto(id)
    ? { id: 'zoom-into', label: 'Zoom in', icon: ZoomIn, run: () => context.zoomInto(id) }
    : null

  if (target.kind === 'canvas') {
    if (s.presentationMode) return sections([command('zoom-to-fit')])
    return sections(
      [s.workspace ? { id: 'add-element', label: 'Add element…', shortcut: 'A', icon: Plus, run: () => s.setAddElementPanelOpen(true) } : null],
      [command('select-all'), command('zoom-to-fit'), command('auto-arrange')],
    )
  }

  if (target.kind === 'relationship') {
    if (s.presentationMode) return []
    return sections([
      command('remove-selected-from-view', { label: 'Remove from view' }),
      command('delete-selected', { label: 'Delete from model', danger: true }),
    ])
  }

  const ids = s.selectedElementIds
  if (s.presentationMode) return sections([ids.length === 1 ? zoomIn(ids[0]) : null])
  const ws = s.workspace, viewKey = s.activeViewKey
  const view = ws && viewKey ? editingView(ws, viewKey, s.rendererMode) : undefined
  // The view's own scope (the box a container view draws) can't be removed
  // from it; the shortcuts skip it the same way.
  const removable = ws && viewKey ? ids.filter(id => s.rendererMode === 'zoom' || !isFocalScopeElement(ws, viewKey, id)) : []
  let lock: CanvasMenuItem | null = null
  if (view && viewKey && !view.locked) {
    const selected = new Set(ids)
    const allLocked = view.elements.filter(e => selected.has(e.id) && e.locked).length === ids.length
    lock = allLocked
      ? { id: 'unlock', label: 'Unlock position', icon: LockOpen, run: () => s.setElementsLocked(viewKey, ids, false) }
      : { id: 'lock', label: 'Lock position', icon: Lock, run: () => s.setElementsLocked(viewKey, ids, true) }
  }
  const run = (destructive: boolean) => () => backspaceLikeHandler(destructive)(useWorkspaceStore.getState(), null)
  return sections(
    [ids.length === 1 ? zoomIn(ids[0]) : null],
    [command('duplicate-selected', { label: 'Duplicate' }), command('group-selected', { label: 'Group' }), lock, command('impact-of-removal')],
    removable.length ? [
      { id: 'remove-from-view', label: 'Remove from view', shortcut: '⌫', icon: EyeOff, run: run(false) },
      { id: 'delete-from-model', label: 'Delete from model', shortcut: '⇧⌫', icon: Trash2, danger: true, run: run(true) },
    ] : [],
  )
}
