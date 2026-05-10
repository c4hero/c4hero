import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, getCreatableTypes, getActiveView, isFocalScopeElement } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
import { serializeDSL } from '@/lib/dsl'
import { saveDSLFile, openDSLFile, writeSidecarToHandle } from '@/lib/fileIO'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { createLogger } from '@/lib/logger'
import { fitContentNodesToViewport } from '@/lib/fitViewport'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'

const log = createLogger('keyboard')

type KeyHandler = (store: ReturnType<typeof useWorkspaceStore.getState>, rf: ReturnType<typeof useReactFlow> | null) => void

/** Shortcuts that work even when focused inside an input/textarea */
const META_SHORTCUTS: Record<string, KeyHandler> = {
  'mod+k': (store) => {
    store.setCommandPaletteOpen(!store.commandPaletteOpen)
  },
  'mod+f': (store) => {
    store.setSearchOpen(!store.searchOpen)
  },
}

/**
 * Factory for Backspace/Delete handlers.
 * destructive=false → remove from view only (no confirm).
 * destructive=true  → impact-aware confirm, then deleteElements.
 * Focal-scope IDs are always filtered out; if only focal-scope IDs were
 * selected, the key is a no-op.
 */
function backspaceLikeHandler(destructive: boolean): KeyHandler {
  return (store) => {
    if (store.selectedRelationshipId) {
      // Relationships are not redesigned in this plan — keep current confirm + delete behavior
      // for both Backspace and Shift+Backspace on a selected relationship.
      store.confirmDelete('Delete this relationship?', () => store.deleteRelationship(store.selectedRelationshipId!))
      return
    }
    if (store.selectedElementIds.length === 0) {
      if (store.viewHistory.length > 0) store.navigateBack()
      return
    }
    if (!store.workspace || !store.activeViewKey) return

    // Filter focal-scope IDs from the operation either way.
    const ids = store.selectedElementIds.filter(
      (id) => !isFocalScopeElement(store.workspace!, store.activeViewKey!, id),
    )
    if (ids.length === 0) return // selection was *only* focal scope — no-op

    if (!destructive) {
      store.removeElementsFromView(store.activeViewKey, ids)
      return
    }

    const impact = computeCascadeImpact(store.workspace, ids)
    const message = formatImpactSummary(impact)
    store.confirmDelete({ message, impact }, () => store.deleteElements(ids))
  }
}

/** Shortcuts that only fire when NOT typing in an input */
const GLOBAL_SHORTCUTS: Record<string, KeyHandler> = {
  'mod+z': (store) => store.undo(),
  'mod+shift+z': (store) => store.redo(),
  'mod+d': (store) => {
    if (store.selectedElementIds.length > 0) store.duplicateElements(store.selectedElementIds)
  },
  'mod+a': (store) => {
    if (store.workspace && store.activeViewKey) {
      const view = getActiveView(store.workspace, store.activeViewKey)
      if (view) store.selectElements(view.elements.map(el => el.id))
    }
  },
  'mod+s': (store) => {
    if (store.workspace) {
      const dsl = serializeDSL(store.workspace)
      saveDSLFile(dsl, `${store.workspace.name ?? 'workspace'}.dsl`)
      const sidecar = extractSidecar(store.workspace)
      if (sidecar) writeSidecarToHandle(serializeSidecar(sidecar))
    }
  },
  'mod+o': (store) => {
    openDSLFile().then(file => {
      if (!file) return
      const { workspace, errors } = parseWorkspaceDocument({
        content: file.content,
        fallbackName: file.name.replace(/\.dsl$/, ''),
        sidecarJson: file.sidecarJson,
      })
      if (errors.length > 0) log.warn('DSL parse warnings', errors)
      store.loadWorkspace(workspace)
    })
  },
  'p': (store) => {
    if (store.workspace) store.setPresentationMode(!store.presentationMode)
  },
  'Escape': (store) => {
    if (store.presentationMode) { store.setPresentationMode(false); return }
    if (store.commandPaletteOpen) { store.setCommandPaletteOpen(false); return }
    if (store.searchOpen) { store.setSearchOpen(false); return }
    if (store.addElementPanelOpen) { store.setAddElementPanelOpen(false); return }
    if (store.selectedElementIds.length > 0 || store.selectedRelationshipId || store.selectedGroupId) { store.clearSelection(); return }
    if (store.viewHistory.length > 0) { store.navigateBack() }
  },
  'Backspace': backspaceLikeHandler(false),
  'Enter': (store) => {
    if (store.selectedElementIds.length === 1) {
      store.drillInto(store.selectedElementIds[0])
    }
  },
  'Delete': backspaceLikeHandler(false),
  'shift+Backspace': backspaceLikeHandler(true),
  'shift+Delete': backspaceLikeHandler(true),
  'shift+G': (store) => {
    if (store.selectedElementIds.length > 0) store.addGroup('New Group', store.selectedElementIds)
  },
  'shift+P': (store) => {
    if (!store.workspace) return
    const ct = getCreatableTypes(store.workspace, store.activeViewKey)
    if (ct.canCreatePerson) store.addPerson('New Person')
  },
  'shift+S': (store) => {
    if (!store.workspace) return
    const ct = getCreatableTypes(store.workspace, store.activeViewKey)
    if (ct.canCreateSystem) store.addSoftwareSystem('New System')
  },
  'shift+C': (store) => {
    if (!store.workspace) return
    const ct = getCreatableTypes(store.workspace, store.activeViewKey)
    if (ct.canCreateContainer) store.addContainer(ct.canCreateContainer, 'New Container')
  },
  'shift+O': (store) => {
    if (!store.workspace) return
    const ct = getCreatableTypes(store.workspace, store.activeViewKey)
    if (ct.canCreateComponent) store.addComponent(ct.canCreateComponent, 'New Component')
  },
  'a': (store) => {
    if (store.workspace) store.setAddElementPanelOpen(!store.addElementPanelOpen)
  },
  'h': (store) => {
    if (store.workspace) store.setHighlighterOpenFacet(store.highlighterOpenFacet ? null : 'tags')
  },
  'm': (store) => {
    if (store.workspace) store.setMultiSelectMode(!store.multiSelectMode)
  },
  'mod+shift+l': (store) => {
    if (store.workspace && store.activeViewKey) store.resetAndRelayout(store.activeViewKey)
  },
  '?': (store) => store.setCommandPaletteOpen(true),
  '=': (_store, rf) => rf?.zoomIn({ duration: 200 }),
  '+': (_store, rf) => rf?.zoomIn({ duration: 200 }),
  '-': (_store, rf) => rf?.zoomOut({ duration: 200 }),
  '0': (_store, rf) => fitContentNodesToViewport(rf),
}

function getKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key)
  return parts.join('+')
}

export function useKeyboardShortcuts() {
  let reactFlow: ReturnType<typeof useReactFlow> | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useReactFlow is always called; the try/catch handles the throw when outside ReactFlowProvider, not a conditional call
    reactFlow = useReactFlow()
  } catch {
    // Not inside ReactFlowProvider (e.g. welcome screen)
  }

  const rf = reactFlow

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const store = useWorkspaceStore.getState()
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable

      // Meta shortcuts (work even in inputs)
      const combo = getKeyCombo(e)
      if (META_SHORTCUTS[combo]) {
        e.preventDefault()
        META_SHORTCUTS[combo](store, rf)
        return
      }

      // Don't handle remaining shortcuts when typing in inputs
      if (isInput) return

      // Global shortcuts
      const handler = GLOBAL_SHORTCUTS[combo]
      if (handler) {
        e.preventDefault()
        handler(store, rf)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // All state is read from getState() inside the handler — only rf is a closure dependency
  }, [rf])
}
