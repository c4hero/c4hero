import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, getCreatableTypes, getActiveView } from '@/store/workspace'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import { saveDSLFile, openDSLFile, writeSidecarToHandle } from '@/lib/fileIO'
import { parseSidecar, applySidecar, extractSidecar, serializeSidecar } from '@/lib/sidecar'

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
      const mod = e.metaKey || e.ctrlKey

      // ─── Global meta shortcuts (work even in inputs) ───
      if (mod && e.key === 'k') {
        e.preventDefault()
        store.setCommandPaletteOpen(!store.commandPaletteOpen)
        return
      }
      if (mod && e.key === 'f') {
        e.preventDefault()
        store.setSearchOpen(!store.searchOpen)
        return
      }

      // Don't handle remaining shortcuts when typing in inputs
      if (isInput) return

      // ─── Global shortcuts ─────────────────────────────
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        store.undo()
        return
      }
      if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        store.redo()
        return
      }
      if (mod && e.key === 'a') {
        e.preventDefault()
        if (store.workspace && store.activeViewKey) {
          const view = getActiveView(store.workspace, store.activeViewKey)
          if (view) store.selectElements(view.elements.map(el => el.id))
        }
        return
      }
      if (mod && e.key === 's') {
        e.preventDefault()
        if (store.workspace) {
          const dsl = serializeDSL(store.workspace)
          saveDSLFile(dsl, `${store.workspace.name ?? 'workspace'}.dsl`)
          // Also save sidecar
          const sidecar = extractSidecar(store.workspace)
          if (sidecar) writeSidecarToHandle(serializeSidecar(sidecar))
        }
        return
      }
      if (mod && e.key === 'o') {
        e.preventDefault()
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
        return
      }

      // ─── Presentation mode ────────────────────────────
      if (e.key === 'f' && !mod && store.workspace) {
        store.setPresentationMode(!store.presentationMode)
        return
      }
      if (e.key === 'Escape') {
        if (store.presentationMode) {
          store.setPresentationMode(false)
          return
        }
        if (store.commandPaletteOpen) {
          store.setCommandPaletteOpen(false)
          return
        }
        if (store.searchOpen) {
          store.setSearchOpen(false)
          return
        }
        if (store.selectedElementIds.length > 0 || store.selectedRelationshipId) {
          store.clearSelection()
          return
        }
        if (store.viewHistory.length > 0) {
          store.navigateBack()
          return
        }
        return
      }

      // ─── Navigation ───────────────────────────────────
      if (e.key === 'Backspace' && !mod && store.selectedElementIds.length === 0) {
        if (store.viewHistory.length > 0) {
          store.navigateBack()
          return
        }
      }
      if (e.key === 'Enter' && !mod && store.selectedElementIds.length === 1) {
        store.drillInto(store.selectedElementIds[0])
        return
      }

      // ─── Delete ───────────────────────────────────────
      if ((e.key === 'Delete' || (e.key === 'Backspace' && store.selectedElementIds.length > 0)) && !mod) {
        if (store.selectedRelationshipId) {
          store.deleteRelationship(store.selectedRelationshipId)
          return
        }
        store.deleteElements(store.selectedElementIds)
        return
      }

      // ─── Group shortcut ───────────────────────────────
      if (e.key === 'G' && e.shiftKey && !mod && store.selectedElementIds.length > 0) {
        e.preventDefault()
        store.addGroup('New Group', store.selectedElementIds)
        return
      }

      // ─── Element creation shortcuts ───────────────────
      if (!store.workspace) return
      const creatableTypes = getCreatableTypes(store.workspace, store.activeViewKey)

      if (e.key === 'P' && e.shiftKey && !mod) {
        e.preventDefault()
        if (creatableTypes.canCreatePerson) {
          store.addPerson('New Person')
        }
        return
      }
      if (e.key === 'S' && e.shiftKey && !mod) {
        e.preventDefault()
        if (creatableTypes.canCreateSystem) {
          store.addSoftwareSystem('New System')
        }
        return
      }
      if (e.key === 'C' && e.shiftKey && !mod) {
        e.preventDefault()
        if (creatableTypes.canCreateContainer) {
          store.addContainer(creatableTypes.canCreateContainer, 'New Container')
        }
        return
      }
      if (e.key === 'O' && e.shiftKey && !mod) {
        e.preventDefault()
        if (creatableTypes.canCreateComponent) {
          store.addComponent(creatableTypes.canCreateComponent, 'New Component')
        }
        return
      }

      // ─── Zoom shortcuts ───────────────────────────────
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        rf?.zoomIn({ duration: 200 })
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        rf?.zoomOut({ duration: 200 })
        return
      }
      if (e.key === '0' && !mod) {
        e.preventDefault()
        rf?.fitView({ duration: 300, padding: 0.2 })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // All state is read from getState() inside the handler — only rf is a closure dependency
  }, [rf])
}
