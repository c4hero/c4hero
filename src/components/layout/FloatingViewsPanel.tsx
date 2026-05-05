import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import type { View } from '@/types/model'
import { X, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import LoadingDot from '@/components/shared/LoadingDot'

const CreateViewDialog = lazy(() => import('@/components/views/CreateViewDialog'))

const VIEW_TYPE_LABELS: Record<string, string> = {
  systemLandscape: 'System Landscape',
  systemContext: 'System Context',
  container: 'Container',
  component: 'Component',
}

export default function FloatingViewsPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const viewsPanelOpen = useWorkspaceStore((s) => s.viewsPanelOpen)
  const setViewsPanelOpen = useWorkspaceStore((s) => s.setViewsPanelOpen)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const showCreateView = useWorkspaceStore((s) => s.createViewDialogOpen)
  const setShowCreateView = useWorkspaceStore((s) => s.setCreateViewDialogOpen)

  if (!workspace || !viewsPanelOpen) return null

  const views = getAllViews(workspace)

  const viewsByType = views.reduce<Record<string, View[]>>((acc, view) => {
    if (!acc[view.type]) acc[view.type] = []
    acc[view.type].push(view)
    return acc
  }, {})

  return (
    <>
      {/* Backdrop — click outside to close */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 48 }}
        onClick={() => setViewsPanelOpen(false)}
      />
      <div
        className="glass-panel-solid"
        style={{
          position: 'fixed',
          left: 70,
          top: 14,
          zIndex: 49,
          width: 220,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              color: 'var(--color-text-muted)',
            }}
          >
            Views
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => setShowCreateView(true)}
              className="btn-icon"
              style={{ minWidth: 24, minHeight: 24, padding: 3 }}
              title="New view"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => setViewsPanelOpen(false)}
              className="btn-icon"
              style={{ minWidth: 24, minHeight: 24, padding: 3 }}
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Views list */}
        <div style={{ padding: '6px 6px', maxHeight: 400, overflowY: 'auto' }}>
          <ViewsList
            viewsByType={viewsByType}
            activeViewKey={activeViewKey}
            onSelect={(key) => {
              setActiveView(key)
            }}
          />
        </div>
      </div>

      {showCreateView && (
        <Suspense fallback={<LoadingDot />}>
          <CreateViewDialog onClose={() => setShowCreateView(false)} />
        </Suspense>
      )}
    </>
  )
}

function ViewsList({
  viewsByType,
  activeViewKey,
  onSelect,
}: {
  viewsByType: Record<string, View[]>
  activeViewKey: string | null
  onSelect: (key: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.keys(viewsByType).reduce((acc, k) => ({ ...acc, [k]: true }), {}),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Object.entries(viewsByType).map(([type, views]) => (
        <div key={type}>
          <button
            onClick={() => setExpanded((e) => ({ ...e, [type]: !e[type] }))}
            className="hover-surface"
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-muted)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background 0.12s',
              border: 'none',
            }}
          >
            {expanded[type] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {VIEW_TYPE_LABELS[type] ?? type}
            <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xxs)', fontWeight: 400, opacity: 0.4 }}>
              {views.length}
            </span>
          </button>

          {expanded[type] && (
            <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
              {views.map((view) => (
                <button
                  key={view.key}
                  onClick={() => onSelect(view.key)}
                  className="hover-surface-2-inactive"
                  data-active={view.key === activeViewKey ? 'true' : undefined}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-sm)',
                    textAlign: 'left',
                    background:
                      view.key === activeViewKey ? 'var(--color-surface-3)' : 'transparent',
                    color:
                      view.key === activeViewKey
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-muted)',
                    boxShadow:
                      view.key === activeViewKey
                        ? 'inset 2px 0 0 var(--color-accent)'
                        : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.12s, color 0.12s',
                    border: 'none',
                  }}
                >
                  {view.title ?? view.key}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
