import { ZoomIn, Plus } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import type { ModelElement, View } from '@/types/model'

interface Props {
  element: ModelElement
  typeColor: string
}

function getChildViews(element: ModelElement): View[] {
  const workspace = useWorkspaceStore.getState().workspace
  if (!workspace) return []
  if (element.type === 'softwareSystem') {
    return workspace.views.containerViews.filter(v => v.softwareSystemId === element.id)
  }
  if (element.type === 'container') {
    return workspace.views.componentViews.filter(v => v.containerId === element.id)
  }
  return []
}

function getLevelLabel(element: ModelElement): { level: number; label: string; viewType: string } {
  if (element.type === 'softwareSystem') {
    return { level: 2, label: 'Container diagram', viewType: 'container' }
  }
  return { level: 3, label: 'Component diagram', viewType: 'component' }
}

export default function ZoomHoverCard({ element, typeColor }: Props) {
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const childViews = getChildViews(element)
  const { level, label, viewType } = getLevelLabel(element)

  const navigateToView = (viewKey: string) => {
    const s = useWorkspaceStore.getState()
    if (!s.activeViewKey || viewKey === s.activeViewKey) return
    useWorkspaceStore.setState({
      activeViewKey: viewKey,
      viewHistory: [...s.viewHistory, s.activeViewKey],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
    })
  }

  const createNewDiagram = () => {
    const target = element.type === 'softwareSystem' ? 'container' as const : 'component' as const
    useWorkspaceStore.setState({
      pendingZoomConfirm: { elementId: element.id, elementName: element.name, targetType: target },
    })
  }

  return (
    <div
      className="nodrag nowheel nopan"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 6,
        width: 240,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <div
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ZoomIn size={11} style={{ color: typeColor }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Level {level} &ndash; {label}
        </span>
      </div>

      {/* Child views list */}
      {childViews.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
          No {viewType} diagrams for this object
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
          {childViews.map(v => (
            <button
              key={v.key}
              onClick={() => navigateToView(v.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '5px 8px', borderRadius: 6,
                fontSize: 11, fontWeight: 500,
                color: v.key === activeViewKey ? typeColor : 'var(--color-text-primary)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <ZoomIn size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
              {v.title ?? v.key}
            </button>
          ))}
        </div>
      )}

      {/* New diagram button */}
      <button
        onClick={createNewDiagram}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '6px 8px', borderRadius: 7,
          fontSize: 11, fontWeight: 600,
          color: 'var(--color-text-primary)',
          background: 'var(--color-surface-3)',
          border: 'none', cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
      >
        <Plus size={12} />
        New diagram
      </button>
    </div>
  )
}
