import { useWorkspaceStore, getSelectedElement, getRelationshipById } from '@/store/workspace'
import RightPanel from '@/components/layout/RightPanel'

export default function FloatingInspector() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const selectedIds = useWorkspaceStore((s) => s.selectedElementIds)
  const selectedRelId = useWorkspaceStore((s) => s.selectedRelationshipId)
  const selectedGroupId = useWorkspaceStore((s) => s.selectedGroupId)

  if (!workspace) return null

  const hasElement = selectedIds.length > 0 && getSelectedElement(workspace, selectedIds) !== undefined
  const hasRelationship = selectedRelId !== null && getRelationshipById(workspace, selectedRelId) !== undefined
  const hasGroup = selectedGroupId !== null && workspace.model.groups.some(g => g.id === selectedGroupId)

  // Only render when a node, relationship, or group is explicitly selected
  const visible = hasElement || hasRelationship || hasGroup

  return (
    <div
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
