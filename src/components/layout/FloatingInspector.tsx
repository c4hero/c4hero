import { useEffect, useRef } from 'react'
import { useWorkspaceStore, getSelectedElement, getRelationshipById } from '@/store/workspace'
import RightPanel from '@/components/layout/RightPanel'

export default function FloatingInspector() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const selectedIds = useWorkspaceStore((s) => s.selectedElementIds)
  const selectedRelId = useWorkspaceStore((s) => s.selectedRelationshipId)
  const selectedGroupId = useWorkspaceStore((s) => s.selectedGroupId)
  const multiSelectMode = useWorkspaceStore((s) => s.multiSelectMode)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  // The assistant and inspector share the same top-right slot. While the
  // assistant is open it owns the slot, so the inspector yields — this lets a
  // mid-flow assistant survive a canvas selection without the two overlapping.
  const aiOpen = useWorkspaceStore((s) => s.aiPanelOpen || s.aiSettingsOpen)
  const containerRef = useRef<HTMLDivElement>(null)

  const hasElement = !!workspace && selectedIds.length > 0 && getSelectedElement(workspace, selectedIds) !== undefined
  const hasRelationship = !!workspace && selectedRelId !== null && getRelationshipById(workspace, selectedRelId) !== undefined
  const hasGroup = !!workspace && selectedGroupId !== null && workspace.model.groups.some(g => g.id === selectedGroupId)

  // Only render when a node, relationship, or group is explicitly selected.
  const visible = hasElement || hasRelationship || hasGroup
  // The single rendered/active condition — the outside-click effect must match it
  // exactly, or its document listener stays attached while the inspector div is
  // unmounted (e.g. the assistant is open) and dismisses selections from clicks
  // inside the panel.
  const shown = !!workspace && !multiSelectMode && !aiOpen && visible

  // Dismiss on outside click. Clicks on canvas nodes/edges run their own
  // selection logic synchronously after this mousedown clears, so they end
  // up selected and the inspector re-shows with the new target.
  useEffect(() => {
    if (!shown) return
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      // Don't dismiss when clicking inside the React Flow canvas — its own
      // pane / node handlers already manage selection.
      const inCanvas = (target as Element).closest?.('.react-flow, [data-canvas-chrome]')
      if (inCanvas) return
      clearSelection()
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
    }
  }, [shown, clearSelection])

  if (!shown) return null

  return (
    <div
      ref={containerRef}
      data-canvas-chrome="inspector"
      style={{
        // Frame matched to the AI assistant panel so the two read as a set.
        position: 'fixed',
        top: 64,
        right: 14,
        zIndex: 50,
        width: 'min(360px, calc(100vw - 28px))',
        maxHeight: 'calc(100dvh - 136px)',
        overflowY: 'auto',
        borderRadius: 12,
        border: '1px solid rgba(88,166,255,0.16)',
        background: 'var(--glass-bg-heavy)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
        // The panel mounts/unmounts (it must — the outside-click listener has to
        // match the rendered condition exactly, see `shown`), so a CSS transition
        // on style values never fires. Animate the entrance on mount instead.
        animation: 'inspector-in 0.18s ease both',
      }}
      aria-label="Element properties"
    >
      <RightPanel />
    </div>
  )
}
