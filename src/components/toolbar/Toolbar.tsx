import { useWorkspaceStore, getCreatableTypes, getActiveView } from '@/store/workspace'
import type { LayoutDirection } from '@/types/model'
import { UserRound, Globe, Box, Puzzle, MousePointer2, Workflow, AlignVerticalSpaceAround, ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from 'lucide-react'

const DIRECTION_ICONS: Record<LayoutDirection, React.ReactNode> = {
  TB: <ArrowDown size={12} />,
  BT: <ArrowUp size={12} />,
  LR: <ArrowRight size={12} />,
  RL: <ArrowLeft size={12} />,
}

export default function Toolbar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setLayoutDirection = useWorkspaceStore((s) => s.setLayoutDirection)

  if (!workspace) return null

  const creatableTypes = getCreatableTypes(workspace, activeViewKey)
  const view = activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const currentDirection = view?.autoLayout?.direction ?? 'TB'

  return (
    <div
      className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-xl border p-1.5"
      style={{
        background: 'rgba(15, 25, 35, 0.9)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--color-border)',
      }}
    >
      <ToolbarButton icon={<MousePointer2 size={16} />} label="Select (V)" active />
      <Sep />

      {creatableTypes.canCreatePerson && (
        <ToolbarButton
          icon={<UserRound size={16} />}
          label="Person (Shift+P)"
          color="var(--color-type-person)"
          onClick={() => useWorkspaceStore.getState().addPerson('New Person')}
        />
      )}
      {creatableTypes.canCreateSystem && (
        <ToolbarButton
          icon={<Globe size={16} />}
          label="System (Shift+S)"
          color="var(--color-type-system)"
          onClick={() => useWorkspaceStore.getState().addSoftwareSystem('New System')}
        />
      )}
      {creatableTypes.canCreateContainer && (
        <ToolbarButton
          icon={<Box size={16} />}
          label="Container (Shift+C)"
          color="var(--color-type-container)"
          onClick={() => useWorkspaceStore.getState().addContainer(creatableTypes.canCreateContainer!, 'New Container')}
        />
      )}
      {creatableTypes.canCreateComponent && (
        <ToolbarButton
          icon={<Puzzle size={16} />}
          label="Component (Shift+O)"
          color="var(--color-type-component)"
          onClick={() => useWorkspaceStore.getState().addComponent(creatableTypes.canCreateComponent!, 'New Component')}
        />
      )}

      <Sep />
      <ToolbarButton
        icon={<Workflow size={16} />}
        label="Auto-connect (drag handles)"
      />
      <ToolbarButton
        icon={<AlignVerticalSpaceAround size={16} />}
        label="Tidy layout"
        onClick={() => {
          // Trigger re-layout by clearing positions in the current view
          const store = useWorkspaceStore.getState()
          if (!store.workspace || !store.activeViewKey) return
          const ws = structuredClone(store.workspace)
          const allViews = [
            ...ws.views.systemLandscapeViews,
            ...ws.views.systemContextViews,
            ...ws.views.containerViews,
            ...ws.views.componentViews,
          ]
          const v = allViews.find(v => v.key === store.activeViewKey)
          if (v) {
            for (const el of v.elements) { el.x = undefined; el.y = undefined; el.pinned = undefined }
            store.loadWorkspace(ws)
          }
        }}
      />

      {/* Layout direction */}
      <Sep />
      <div className="flex gap-0.5">
        {(['TB', 'BT', 'LR', 'RL'] as LayoutDirection[]).map(dir => (
          <button
            key={dir}
            className="btn-icon !rounded-md !min-h-6 !min-w-6 !p-0.5"
            style={{
              color: currentDirection === dir ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              background: currentDirection === dir ? 'var(--color-surface-3)' : undefined,
            }}
            title={`Layout: ${dir}`}
            onClick={() => activeViewKey && setLayoutDirection(activeViewKey, dir)}
          >
            {DIRECTION_ICONS[dir]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Sep() {
  return <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
}

function ToolbarButton({ icon, label, color, active, onClick }: {
  icon: React.ReactNode
  label: string
  color?: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className="btn-icon relative !rounded-lg"
      style={{
        color: active ? 'var(--color-text-primary)' : color ?? 'var(--color-text-secondary)',
        background: active ? 'var(--color-surface-3)' : undefined,
      }}
      title={label}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
