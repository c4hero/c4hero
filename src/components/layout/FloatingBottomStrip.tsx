import { useMemo, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspaceStore, getActiveView, buildElementMap, BUILTIN_TAGS } from '@/store/workspace'
import type { ElementStatus, ElementStyle } from '@/types/model'
import { Tag, Activity, X, Palette, Pencil, Plus, Check, AlertTriangle } from 'lucide-react'
import type { ScopeViolation } from '@/lib/scopeValidation'

type Mode = 'tags' | 'status'

const STATUS_OPTIONS: { value: ElementStatus; label: string; color: string }[] = [
  { value: 'Live', label: 'Live', color: 'var(--color-status-live)' },
  { value: 'Deprecated', label: 'Deprecated', color: 'var(--color-status-deprecated)' },
  { value: 'Planned', label: 'Planned', color: 'var(--color-status-planned)' },
  { value: 'Removed', label: 'Removed', color: 'var(--color-status-removed)' },
]

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

export default function FloatingBottomStrip() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const setActiveTagFilter = useWorkspaceStore((s) => s.setActiveTagFilter)
  const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
  const setActiveStatusFilter = useWorkspaceStore((s) => s.setActiveStatusFilter)
  const scopeViolations = useWorkspaceStore((s) => s.scopeViolations)


  const [mode, setMode] = useState<Mode>('tags')
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  // All custom tags across entire workspace
  const allWorkspaceTags = useMemo(() => {
    if (!workspace) return []
    const tags = new Set<string>()
    const elementMap = buildElementMap(workspace)
    for (const el of elementMap.values()) {
      for (const tag of el.tags) {
        if (!DEFAULT_BUILTIN_TAGS.includes(tag)) tags.add(tag)
      }
    }
    for (const s of workspace.views.configuration.styles.elements) {
      tags.add(s.tag)
    }
    return Array.from(tags).sort()
  }, [workspace])

  // Tags visible in current view (for filter pills)
  const viewTags = useMemo(() => {
    if (!view || !workspace) return []
    const tags = new Set<string>()
    const elementMap = buildElementMap(workspace)
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el) for (const tag of el.tags) {
        if (!DEFAULT_BUILTIN_TAGS.includes(tag)) tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [workspace, view])

  const viewStatuses = useMemo(() => {
    if (!view || !workspace) return []
    const statuses = new Set<ElementStatus>()
    const elementMap = buildElementMap(workspace)
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.status) statuses.add(el.status)
    }
    return Array.from(statuses)
  }, [workspace, view])

  if (!workspace) return null

  const elementStyles = workspace.views.configuration.styles.elements
  const getStyleForTag = (tag: string) => elementStyles.find((s) => s.tag === tag)

  return (
    <>
      {scopeViolations.length > 0 && (
        <ScopeViolationBanner violations={scopeViolations} />
      )}
      <div
        style={{
          position: 'fixed',
          bottom: 'max(14px, calc(env(safe-area-inset-bottom, 0px) + 8px))',
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 14px',
          pointerEvents: 'none',
        }}
      >
      <div
        className="glass-panel"
        style={{
          pointerEvents: 'auto',
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          height: 44,
          whiteSpace: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
        }}
      >
        {/* Mode tabs */}
        <ModeTab icon={<Tag size={13} />} label="Tags" active={mode === 'tags'} onClick={() => setMode('tags')} isFirst />
        <ModeTab icon={<Activity size={13} />} label="Status" active={mode === 'status'} onClick={() => setMode('status')} />

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />

        {/* Tags mode */}
        {mode === 'tags' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px' }}>
            {viewTags.length === 0 && (
              <span style={{ padding: '0 8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                No custom tags
              </span>
            )}
            {viewTags.map((tag) => {
              const tagStyle = getStyleForTag(tag)
              const isActive = activeTagFilter === tag
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTagFilter(isActive ? null : tag)}
                  className="hover-lift-inactive"
                  data-active={isActive ? 'true' : undefined}
                  style={{
                    height: 30,
                    padding: '0 10px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: isActive ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                    ...(isActive ? { background: tagStyle?.background ?? 'var(--color-accent)' } : {}),
                    cursor: 'pointer',
                    transition: 'background 0.12s, color 0.12s',
                    border: 'none',
                  }}
                >
                  {tagStyle?.background && !isActive && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagStyle.background, flexShrink: 0 }} />
                  )}
                  {tag}
                </button>
              )
            })}

            {/* Edit button */}
            <button
              onClick={() => setTagManagerOpen((o) => !o)}
              className="hover-lift-inactive"
              data-active={tagManagerOpen ? 'true' : undefined}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                ...(tagManagerOpen ? { background: 'rgba(88,166,255,0.12)' } : {}),
                color: tagManagerOpen ? 'var(--color-accent)' : 'var(--color-text-muted)',
                cursor: 'pointer', border: 'none', transition: 'background 0.1s, color 0.1s',
              }}
              title="Manage tags"
            >
              <Pencil size={12} />
            </button>
          </div>
        )}

        {/* Status mode */}
        {mode === 'status' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px' }}>
            {STATUS_OPTIONS.map((opt) => {
              const isActive = activeStatusFilter === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setActiveStatusFilter(isActive ? null : opt.value)}
                  className="hover-lift-inactive"
                  data-active={isActive ? 'true' : undefined}
                  style={{
                    height: 30, padding: '0 10px', borderRadius: 'var(--radius-sm)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 'var(--text-xs)', fontWeight: 600,
                    color: isActive ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                    ...(isActive ? { background: opt.color } : {}),
                    cursor: 'pointer', transition: 'background 0.12s, color 0.12s', border: 'none',
                    opacity: viewStatuses.includes(opt.value) || isActive ? 1 : 0.4,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: isActive ? 'var(--glass-bg)' : opt.color,
                    flexShrink: 0,
                  }} />
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      </div>

      {/* Tag Manager Panel */}
      {tagManagerOpen && (
        <TagManagerPanel
          tags={allWorkspaceTags}
          getStyleForTag={getStyleForTag}
          onClose={() => setTagManagerOpen(false)}
        />
      )}
    </>
  )
}

// ─── Tag Manager Panel ────────────────────────────────────────────────

function TagManagerPanel({
  tags,
  getStyleForTag,
  onClose,
}: {
  tags: string[]
  getStyleForTag: (tag: string) => ElementStyle | undefined
  onClose: () => void
}) {
  const renameTag = useWorkspaceStore((s) => s.renameTag)
  const removeTagGlobal = useWorkspaceStore((s) => s.removeTagGlobal)
  const updateElementStyle = useWorkspaceStore((s) => s.updateElementStyle)
  const [editingStyleFor, setEditingStyleFor] = useState<string | null>(null)
  const [newTagValue, setNewTagValue] = useState('')
  const newTagInputRef = useRef<HTMLInputElement>(null)

  function handleAddTag() {
    const trimmed = newTagValue.trim()
    if (!trimmed) return
    updateElementStyle({ tag: trimmed })
    setNewTagValue('')
    newTagInputRef.current?.focus()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        className="glass-panel-solid"
        style={{
          position: 'fixed',
          bottom: 68,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          width: 340,
          maxHeight: 440,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Manage Tags
          </div>
          <button onClick={onClose} className="btn-icon" style={{ minWidth: 24, minHeight: 24, padding: 4 }}>
            <X size={12} />
          </button>
        </div>

        {/* Tag list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {tags.length === 0 && (
            <div style={{ padding: '16px 8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              No custom tags yet
            </div>
          )}
          {tags.map((tag) => (
            <TagRow
              key={tag}
              tag={tag}
              style={getStyleForTag(tag)}
              editingStyle={editingStyleFor === tag}
              onEditStyle={() => setEditingStyleFor(editingStyleFor === tag ? null : tag)}
              onCloseStyle={() => setEditingStyleFor(null)}
              onRename={(newName) => { renameTag(tag, newName) }}
              onDelete={() => removeTagGlobal(tag)}
            />
          ))}
        </div>

        {/* Add tag */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <input
            ref={newTagInputRef}
            type="text"
            value={newTagValue}
            onChange={(e) => setNewTagValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }
              if (e.key === 'Escape') setNewTagValue('')
            }}
            placeholder="New tag name..."
            style={{
              flex: 1, height: 30, padding: '0 10px',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)', color: 'var(--color-text-primary)',
              fontSize: 'var(--text-xs)', outline: 'none',
            }}
          />
          <button
            onClick={handleAddTag}
            disabled={!newTagValue.trim()}
            style={{
              height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: newTagValue.trim() ? 'var(--color-accent)' : 'var(--color-surface-2)',
              color: newTagValue.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
              fontSize: 'var(--text-xs)', fontWeight: 600, cursor: newTagValue.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 4, transition: 'background 0.12s',
            }}
          >
            <Plus size={11} />
            Add
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Tag Row ──────────────────────────────────────────────────────────

function TagRow({
  tag, style, editingStyle,
  onEditStyle, onCloseStyle, onRename, onDelete,
}: {
  tag: string
  style: ElementStyle | undefined
  editingStyle: boolean
  onEditStyle: () => void
  onCloseStyle: () => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(tag)
  const [focused, setFocused] = useState(false)

  // Sync if tag name changes externally (after rename)
  if (!focused && draft !== tag) setDraft(tag)

  function commitRename() {
    setFocused(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== tag) onRename(trimmed)
    else setDraft(tag)
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 4px', borderRadius: 'var(--radius-sm)',
        transition: 'background 0.1s',
      }}>
        {/* Color swatch */}
        <div style={{
          width: 12, height: 12, borderRadius: 3, flexShrink: 0,
          background: style?.background ?? 'var(--color-border)',
          border: '1px solid rgba(255,255,255,0.1)',
        }} />

        {/* Rename input */}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() }
            if (e.key === 'Escape') { setDraft(tag); (e.target as HTMLElement).blur() }
          }}
          style={{
            flex: 1, height: 26, padding: '0 7px',
            borderRadius: 'var(--radius-sm)',
            border: focused ? '1px solid var(--color-accent)' : '1px solid transparent',
            background: focused ? 'var(--color-surface-3)' : 'transparent',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-sm)', fontWeight: 500, outline: 'none',
            transition: 'border-color 0.12s, background 0.12s',
          }}
        />

        {/* Confirm rename (when focused and changed) */}
        {focused && draft.trim() !== tag && (
          <button
            onMouseDown={(e) => { e.preventDefault(); commitRename() }}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)', border: 'none', background: 'rgba(88,166,255,0.15)', color: 'var(--color-accent)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Check size={11} />
          </button>
        )}

        {/* Style button */}
        <button
          onClick={onEditStyle}
          className="hover-surface-inactive"
          data-active={editingStyle ? 'true' : undefined}
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: editingStyle ? 'rgba(88,166,255,0.12)' : 'transparent',
            color: editingStyle ? 'var(--color-accent)' : 'var(--color-text-muted)',
            cursor: 'pointer', flexShrink: 0, transition: 'background 0.1s',
          }}
          title="Edit style"
        >
          <Palette size={11} />
        </button>

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="hover-danger"
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent',
            color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.1s, color 0.1s',
          }}
          title="Remove tag globally"
        >
          <X size={11} />
        </button>
      </div>

      {/* Inline style editor */}
      {editingStyle && (
        <TagStyleEditor
          tag={tag}
          style={style}
          onClose={onCloseStyle}
        />
      )}
    </>
  )
}

// ─── Mode Tab ─────────────────────────────────────────────────────────

function ModeTab({ icon, label, active, onClick, isFirst }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; isFirst?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="hover-subtle-inactive"
      data-active={active ? 'true' : undefined}
      style={{
        height: '100%', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 'var(--text-xs)', fontWeight: 600,
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        ...(active ? { background: 'rgba(255,255,255,0.06)' } : {}),
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        cursor: 'pointer', border: 'none', transition: 'color 0.12s, background 0.12s',
        borderRadius: isFirst ? 'var(--radius-lg) 0 0 var(--radius-lg)' : 0,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Tag Style Editor (inline in manager) ────────────────────────────

const STRUCTURIZR_SHAPES = [
  'Box', 'RoundedBox', 'Circle', 'Ellipse', 'Hexagon',
  'Cylinder', 'Pipe', 'Person', 'Robot', 'Folder',
  'WebBrowser', 'MobileDevicePortrait', 'MobileDeviceLandscape', 'Component',
]

const PRESET_COLORS = [
  '#2dd4bf', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6',
  '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#8b5cf6',
  '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#64748b',
]

function TagStyleEditor({ tag, style, onClose }: {
  tag: string; style: ElementStyle | undefined; onClose: () => void
}) {
  const updateElementStyle = useWorkspaceStore((s) => s.updateElementStyle)
  const removeElementStyle = useWorkspaceStore((s) => s.removeElementStyle)

  const bg = style?.background ?? ''
  const fg = style?.color ?? ''
  const shape = style?.shape ?? ''
  const border = style?.border ?? ''
  const opacity = style?.opacity
  const fontSize = style?.fontSize

  function update(patch: Partial<ElementStyle>) {
    updateElementStyle({ tag, ...patch })
  }

  return (
    <div style={{
      margin: '2px 4px 6px 22px',
      padding: 12,
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      background: 'rgba(255,255,255,0.03)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StyleField label="Background">
          <ColorPicker value={bg} onChange={(v) => update({ background: v || undefined })} presets={PRESET_COLORS} />
        </StyleField>
        <StyleField label="Color (text)">
          <ColorPicker value={fg} onChange={(v) => update({ color: v || undefined })} presets={['#ffffff', '#e2e8f0', '#0b1219', '#1e293b', ...PRESET_COLORS.slice(0, 6)]} />
        </StyleField>
        <StyleField label="Shape">
          <select
            value={shape}
            onChange={(e) => update({ shape: e.target.value || undefined })}
            style={{ flex: 1, height: 26, padding: '0 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', outline: 'none' }}
          >
            <option value="">Default</option>
            {STRUCTURIZR_SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </StyleField>
        <StyleField label="Border">
          <select
            value={border}
            onChange={(e) => update({ border: e.target.value || undefined })}
            style={{ flex: 1, height: 26, padding: '0 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', outline: 'none' }}
          >
            <option value="">Default</option>
            <option value="Solid">Solid</option>
            <option value="Dashed">Dashed</option>
            <option value="Dotted">Dotted</option>
          </select>
        </StyleField>
        <StyleField label="Opacity">
          <input
            type="range" min={0} max={100} step={5}
            value={opacity ?? 100}
            onChange={(e) => { const val = Number(e.target.value); update({ opacity: val < 100 ? val : undefined }) }}
            style={{ flex: 1, accentColor: 'var(--color-accent)' }}
          />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', width: 30, textAlign: 'right' }}>
            {opacity ?? 100}%
          </span>
        </StyleField>
        <StyleField label="Font size">
          <input
            type="number" min={8} max={40}
            value={fontSize ?? ''}
            placeholder="Default"
            onChange={(e) => update({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: 60, height: 26, padding: '0 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', outline: 'none' }}
          />
        </StyleField>
      </div>
      {style && !BUILTIN_TAGS.has(tag) && (
        <button
          onClick={() => { removeElementStyle(tag); onClose() }}
          className="hover-danger-text"
          style={{
            marginTop: 10, width: '100%', padding: '5px 0', borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
            color: 'var(--color-error)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s',
          }}
        >
          Remove style
        </button>
      )}
    </div>
  )
}

function StyleField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', width: 70, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange, presets }: {
  value: string; onChange: (value: string) => void; presets: string[]
}) {
  const [showPresets, setShowPresets] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)

  // Popup dimensions: 6 items per row × 22px + gaps + padding
  const POPUP_W = 158
  const POPUP_H = 64

  useEffect(() => {
    if (!showPresets || !swatchRef.current) return
    const rect = swatchRef.current.getBoundingClientRect()
    // Prefer above the swatch; if not enough room, flip below
    const roomAbove = rect.top
    const preferAbove = roomAbove >= POPUP_H + 8
    const top = preferAbove ? rect.top - POPUP_H - 4 : rect.bottom + 4
    // Align left edge to swatch, but keep within viewport
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_W - 8))
    setPopupPos({ top, left })
  }, [showPresets])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#hex or name"
        style={{ flex: 1, height: 26, padding: '0 8px', paddingLeft: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', outline: 'none' }}
      />
      <button
        ref={swatchRef}
        onClick={() => setShowPresets((o) => !o)}
        style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: 3, border: '1px solid var(--color-border)', background: value || 'transparent', cursor: 'pointer', padding: 0 }}
      />
      {showPresets && popupPos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowPresets(false)} />
          <div style={{
            position: 'fixed',
            top: popupPos.top,
            left: popupPos.left,
            zIndex: 9999,
            padding: 6,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 22px)',
            gap: 4,
          }}>
            {presets.map((c) => (
              <button key={c} onClick={() => { onChange(c); setShowPresets(false) }}
                style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', border: value === c ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', background: c, cursor: 'pointer', padding: 0 }}
              />
            ))}
            <button onClick={() => { onChange(''); setShowPresets(false) }}
              style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={10} />
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}


function ScopeViolationBanner({ violations }: { violations: ScopeViolation[] }) {
  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
      borderRadius: 10, padding: '8px 16px', fontSize: 12, color: '#fca5a5',
      display: 'flex', alignItems: 'center', gap: 8, maxWidth: 500, pointerEvents: 'auto',
    }}>
      <AlertTriangle size={14} />
      <span>{violations[0].message}</span>
      {violations.length > 1 && <span style={{ opacity: 0.7 }}>+{violations.length - 1} more</span>}
    </div>
  )
}
