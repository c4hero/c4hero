import { useState } from 'react'
import { useWorkspaceStore, getAllViews, getBreadcrumb } from '@/store/workspace'
import type { View } from '@/types/model'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react'

const VIEW_TYPE_LABELS: Record<string, string> = {
  systemLandscape: 'System Landscape',
  systemContext: 'System Context',
  container: 'Container',
  component: 'Component',
}

const LEVEL_BADGE: Record<string, string> = {
  systemLandscape: 'L1',
  systemContext: 'L2',
  container: 'L3',
  component: 'L4',
}

interface ViewSwitcherProps {
  isMobile: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  onShowCreateView: () => void
}

export { VIEW_TYPE_LABELS, LEVEL_BADGE }

export default function ViewSwitcher({ isMobile, open, onToggle, onClose }: ViewSwitcherProps) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const viewHistory = useWorkspaceStore((s) => s.viewHistory)
  const navigateBack = useWorkspaceStore((s) => s.navigateBack)

  if (!workspace) return null

  const views = getAllViews(workspace)
  const breadcrumb = activeViewKey
    ? getBreadcrumb(workspace, viewHistory, activeViewKey)
    : []
  const activeView = views.find((v) => v.key === activeViewKey)

  return (
    <>
      {/* Trigger button */}
      <div style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'visible' }}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label="Switch view"
          className="hover-subtle"
          style={{
            padding: '0 12px',
            height: 44,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderRight: '1px solid var(--color-border)',
            fontSize: 'var(--text-base)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'background 0.12s',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {breadcrumb.length > 1 && (
            <>
              {breadcrumb.slice(0, -1).map((crumb, i) => (
                <span key={crumb.key} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {i > 0 && <ChevronRight size={10} style={{ color: 'var(--color-text-muted)' }} />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const steps = breadcrumb.length - 1 - i
                      for (let s = 0; s < steps; s++) navigateBack()
                      onClose()
                    }}
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-muted)',
                      background: 'transparent',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
              <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            </>
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isMobile ? 80 : 120,
              minWidth: 0,
            }}
          >
            {activeView?.title ?? activeViewKey ?? 'No view'}
          </span>
          {activeView && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-accent-glow)',
                color: 'var(--color-accent)',
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              {LEVEL_BADGE[activeView.type] ?? ''}
            </span>
          )}
          <ChevronDown size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        </button>
      </div>
    </>
  )
}

/** The slide-down panel shown when the view switcher is open */
export function ViewSwitcherPanel({ onClose, onShowCreateView }: { onClose: () => void; onShowCreateView: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const deleteView = useWorkspaceStore((s) => s.deleteView)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const renameView = useWorkspaceStore((s) => s.renameView)

  const [renamingViewKey, setRenamingViewKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  if (!workspace) return null

  const views = getAllViews(workspace)

  const viewsByType = views.reduce<Record<string, View[]>>((acc, view) => {
    if (!acc[view.type]) acc[view.type] = []
    acc[view.type].push(view)
    return acc
  }, {})

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 48, pointerEvents: 'auto' }} onClick={() => { onClose(); setRenamingViewKey(null) }} />
      <div
        className="shade-panel"
        style={{
          zIndex: 49,
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
        }}>
        {/* Views grouped by type */}
        <div style={{ padding: '12px 0' }}>
          {Object.entries(viewsByType).map(([type, typeViews]) => (
            <div key={type}>
              <div className="flyout-label" style={{ padding: '4px 16px 6px', letterSpacing: '0.12em' }}>
                {VIEW_TYPE_LABELS[type] ?? type}
              </div>
              {typeViews.map((v) => {
                const isActive = v.key === activeViewKey
                const isRenaming = renamingViewKey === v.key
                return (
                  <div
                    key={v.key}
                    className="group hover-subtle-inactive"
                    data-active={isActive ? 'true' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0,
                      padding: '0 8px',
                      background: isActive ? 'rgba(88,166,255,0.08)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    {/* Level badge */}
                    <span style={{ fontSize: 'var(--text-xxs)', fontWeight: 800, padding: '2px 5px', borderRadius: 'var(--radius-sm)', background: isActive ? 'rgba(88,166,255,0.2)' : 'var(--color-surface-3)', color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)', letterSpacing: '0.05em', flexShrink: 0, marginRight: 10 }}>
                      {LEVEL_BADGE[v.type] ?? v.type.slice(0,2).toUpperCase()}
                    </span>

                    {/* Title / rename input */}
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameView(v.key, renameValue.trim() || v.title || v.key); setRenamingViewKey(null) }
                          if (e.key === 'Escape') setRenamingViewKey(null)
                          e.stopPropagation()
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, fontSize: 'var(--text-base)', background: 'var(--color-surface-2)', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', color: 'var(--color-text-primary)', outline: 'none', minWidth: 0, margin: '4px 0' }}
                      />
                    ) : (
                      <button
                        onClick={() => { setActiveView(v.key); onClose(); setRenamingViewKey(null) }}
                        style={{ flex: 1, textAlign: 'left', padding: '10px 0', fontSize: 'var(--text-base)', fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, border: 'none' }}
                      >
                        {v.title ?? v.key}
                      </button>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 6, opacity: 0, transition: 'opacity 0.1s' }}
                      className="view-row-actions"
                    >
                      {isRenaming ? (
                        <button onClick={e => { e.stopPropagation(); renameView(v.key, renameValue.trim() || v.title || v.key); setRenamingViewKey(null) }}
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'rgba(34,197,94,0.15)', border: 'none', cursor: 'pointer', color: 'var(--color-success)' }} title="Save">
                          <Check size={13} />
                        </button>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setRenamingViewKey(v.key); setRenameValue(v.title ?? v.key) }}
                          className="hover-lift"
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', transition: 'background 0.12s, color 0.12s' }}
                          title="Rename">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); if (views.length > 1) confirmDelete(`Delete view "${v.title || v.key}"?`, () => deleteView(v.key)) }}
                        disabled={views.length <= 1}
                        className="hover-danger"
                        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', cursor: views.length > 1 ? 'pointer' : 'default', color: 'var(--color-text-muted)', opacity: views.length <= 1 ? 0.3 : 1, transition: 'background 0.12s, color 0.12s' }}
                        title={views.length <= 1 ? 'Cannot delete last view' : 'Delete view'}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
              <div style={{ height: 8 }} />
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => { onClose(); onShowCreateView() }}
            className="hover-accent-subtle"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', fontSize: 'var(--text-base)', color: 'var(--color-accent)', background: 'transparent', cursor: 'pointer', transition: 'background 0.1s', border: 'none' }}
          >
            <Plus size={14} /> New view
          </button>
        </div>
      </div>
    </>
  )
}
