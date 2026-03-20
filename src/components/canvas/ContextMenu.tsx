import { useWorkspaceStore, canDrillInto, getCreatableTypes } from '@/store/workspace'
import { Trash2, ZoomIn, UserRound, Globe, Box, Puzzle } from 'lucide-react'
import { scopeAllowsContainers } from '@/lib/scopeValidation'

interface ContextMenuProps {
  x: number
  y: number
  nodeId?: string
  onClose: () => void
}

export default function ContextMenu({ x, y, nodeId, onClose }: ContextMenuProps) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const deleteElement = useWorkspaceStore((s) => s.deleteElement)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const drillInto = useWorkspaceStore((s) => s.drillInto)
  const addPerson = useWorkspaceStore((s) => s.addPerson)
  const addSoftwareSystem = useWorkspaceStore((s) => s.addSoftwareSystem)
  const addContainer = useWorkspaceStore((s) => s.addContainer)
  const addComponent = useWorkspaceStore((s) => s.addComponent)

  if (!workspace) return null

  const canDrill = nodeId ? canDrillInto(workspace, nodeId) : false
  const creatableTypes = getCreatableTypes(workspace, activeViewKey)
  const containersAllowed = scopeAllowsContainers(workspace.scope)

  return (
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        role="menu"
        className="fixed z-[90] w-48 rounded-lg border py-1 shadow-xl"
        style={{
          left: x,
          top: y,
          background: 'var(--color-surface-1)',
          borderColor: 'var(--color-border)',
        }}
      >
        {nodeId ? (
          <>
            {canDrill && (
              <MenuItem icon={<ZoomIn size={14} />} label="Drill into" onClick={() => { drillInto(nodeId); onClose() }} />
            )}
            <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
            <MenuItem icon={<Trash2 size={14} />} label="Delete" danger onClick={() => { onClose(); confirmDelete('Delete this element?', () => deleteElement(nodeId)) }} />
          </>
        ) : (
          <>
            {creatableTypes.canCreatePerson && (
              <MenuItem icon={<UserRound size={14} />} label="Add Person" onClick={() => { addPerson('New Person'); onClose() }} />
            )}
            {creatableTypes.canCreateSystem && (
              <MenuItem icon={<Globe size={14} />} label="Add System" onClick={() => { addSoftwareSystem('New System'); onClose() }} />
            )}
            {creatableTypes.canCreateContainer && (
              <MenuItem
                icon={<Box size={14} />}
                label="Add Container"
                disabled={!containersAllowed}
                title={!containersAllowed ? 'Not available in landscape-scoped workspaces' : undefined}
                onClick={() => { if (containersAllowed) { addContainer(creatableTypes.canCreateContainer!, 'New Container'); onClose() } }}
              />
            )}
            {creatableTypes.canCreateComponent && (
              <MenuItem
                icon={<Puzzle size={14} />}
                label="Add Component"
                disabled={!containersAllowed}
                title={!containersAllowed ? 'Not available in landscape-scoped workspaces' : undefined}
                onClick={() => { if (containersAllowed) { addComponent(creatableTypes.canCreateComponent!, 'New Component'); onClose() } }}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}

function MenuItem({ icon, label, danger, disabled, title, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-3)]"
      style={{ color: disabled ? 'var(--color-text-muted)' : danger ? 'var(--color-error)' : 'var(--color-text-primary)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {icon}
      {label}
    </button>
  )
}
