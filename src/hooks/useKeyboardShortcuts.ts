import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, getCreatableTypes, getActiveView } from '@/store/workspace'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import { saveDSLFile, openDSLFile, writeSidecarToHandle } from '@/lib/fileIO'
import { parseSidecar, applySidecar, extractSidecar, serializeSidecar } from '@/lib/sidecar'

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
      const { workspace: ws, errors } = parseDSL(file.content)
      if (errors.length > 0) console.warn('DSL parse warnings:', errors)
      if (ws) {
        if (!ws.name) ws.name = file.name.replace(/\.dsl$/, '')
        if (file.sidecarJson) {
          const sidecar = parseSidecar(file.sidecarJson)
          if (sidecar) applySidecar(ws, sidecar)
        }
        store.loadWorkspace(ws)
      }
    })
  },
  'f': (store) => {
    if (store.workspace) store.setPresentationMode(!store.presentationMode)
  },
  'Escape': (store) => {
    if (store.presentationMode) { store.setPresentationMode(false); return }
    if (store.commandPaletteOpen) { store.setCommandPaletteOpen(false); return }
    if (store.searchOpen) { store.setSearchOpen(false); return }
    if (store.selectedElementIds.length > 0 || store.selectedRelationshipId || store.selectedGroupId) { store.clearSelection(); return }
    if (store.viewHistory.length > 0) { store.navigateBack() }
  },
  'Backspace': (store) => {
    if (store.selectedRelationshipId) {
      store.confirmDelete('Delete this relationship?', () => store.deleteRelationship(store.selectedRelationshipId!))
      return
    }
    if (store.selectedElementIds.length > 0) {
      const count = store.selectedElementIds.length
      store.confirmDelete(
        count === 1 ? 'Delete this element?' : `Delete ${count} elements?`,
        () => store.deleteElements(store.selectedElementIds)
      )
      return
    }
    if (store.viewHistory.length > 0) {
      store.navigateBack()
    }
  },
  'Enter': (store) => {
    if (store.selectedElementIds.length === 1) {
      store.drillInto(store.selectedElementIds[0])
    }
  },
  'Delete': (store) => {
    if (store.selectedRelationshipId) {
      store.confirmDelete('Delete this relationship?', () => store.deleteRelationship(store.selectedRelationshipId!))
      return
    }
    if (store.selectedElementIds.length > 0) {
      const count = store.selectedElementIds.length
      store.confirmDelete(
        count === 1 ? 'Delete this element?' : `Delete ${count} elements?`,
        () => store.deleteElements(store.selectedElementIds)
      )
    }
  },
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
  '?': (store) => store.setCommandPaletteOpen(true),
  '=': (_store, rf) => rf?.zoomIn({ duration: 200 }),
  '+': (_store, rf) => rf?.zoomIn({ duration: 200 }),
  '-': (_store, rf) => rf?.zoomOut({ duration: 200 }),
  '0': (_store, rf) => rf?.fitView({ duration: 300, padding: 0.2 }),
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
