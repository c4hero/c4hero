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
import { isCanvasRoute } from '@/lib/routes'

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
    const ws = store.workspace
    const viewKey = store.activeViewKey
    const ids = store.selectedElementIds.filter(
      (id) => !isFocalScopeElement(ws, viewKey, id),
    )
    if (ids.length === 0) return // selection was *only* focal scope — no-op

    if (!destructive) {
      store.removeElementsFromView(viewKey, ids)
      return
    }

    const impact = computeCascadeImpact(ws, ids)
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
  'i': (store) => {
    // The AI panel only renders on a diagram route (see App.tsx `onCanvas`).
    // Toggling it elsewhere would clear the selection and pop the panel open
    // later when a diagram is finally opened, so gate it on the same condition.
    if (!store.workspace) return
    if (!isCanvasRoute(window.location.pathname)) return
    if (store.aiPanelOpen) {
      store.setAiPanelOpen(false)
      store.setAiSettingsOpen(false)
    } else {
      store.setAiPanelOpen(true)
      // aiSettingsOpen without aiPanelOpen is a stale state (setAiSettingsOpen
      // normally forces both together) — normalize it instead of leaving a
      // dangling settings flag armed under the freshly opened panel.
      if (store.aiSettingsOpen) store.setAiSettingsOpen(false)
    }
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

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''])

/** True when Backspace on this target would NOT actually delete text — i.e.
 *  an empty text input, a non-text input (button/checkbox/radio), or anything
 *  else where Backspace is a no-op for the user but might still cause the
 *  browser to navigate back in history (Safari, legacy Firefox). */
export function shouldSuppressBackspaceNavigation(target: HTMLElement): boolean {
  if (target.tagName === 'TEXTAREA') return (target as HTMLTextAreaElement).value === ''
  // contentEditable check: prefer the standard isContentEditable property, but
  // also fall back to the attribute (jsdom and detached elements report false
  // for isContentEditable even when contentEditable="true").
  if (target.isContentEditable || target.contentEditable === 'true') {
    return (target.textContent ?? '') === ''
  }
  if (target.tagName === 'INPUT') {
    const input = target as HTMLInputElement
    if (!TEXT_INPUT_TYPES.has(input.type)) return true
    return input.value === ''
  }
  // SELECT or anything else routed here by isInput — Backspace can't edit it.
  return true
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

      // Don't handle remaining shortcuts when typing in inputs.
      // BUT: Backspace in input contexts can still trigger browser-history-back
      // on Safari (and legacy Firefox builds) when the input is empty or not a
      // text-editable type. Suppress that — the app should never get unmounted
      // by a stray Backspace.
      if (isInput) {
        if (e.key === 'Backspace' && shouldSuppressBackspaceNavigation(target)) {
          e.preventDefault()
        }
        return
      }

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
