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
  const containerRef = useRef<HTMLDivElement>(null)

  const hasElement = !!workspace && selectedIds.length > 0 && getSelectedElement(workspace, selectedIds) !== undefined
  const hasRelationship = !!workspace && selectedRelId !== null && getRelationshipById(workspace, selectedRelId) !== undefined
  const hasGroup = !!workspace && selectedGroupId !== null && workspace.model.groups.some(g => g.id === selectedGroupId)

  // Only render when a node, relationship, or group is explicitly selected
  const visible = hasElement || hasRelationship || hasGroup

  // Dismiss on outside click. Clicks on canvas nodes/edges run their own
  // selection logic synchronously after this mousedown clears, so they end
  // up selected and the inspector re-shows with the new target.
  useEffect(() => {
    if (!visible) return
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
  }, [visible, clearSelection])

  if (!workspace || multiSelectMode) return null

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 72,
        right: 14,
        zIndex: 50,
        width: 260,
        maxHeight: 'calc(100dvh - 86px)',
        overflowY: 'auto',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'var(--glass-shadow)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
      }}
      aria-label="Element properties"
    >
      <RightPanel />
    </div>
  )
}
