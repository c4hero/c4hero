import { useMemo, useRef, useState } from 'react'
import { useWorkspaceStore, buildElementMap, BUILTIN_TAGS } from '@/store/workspace'
import type { ElementStyle } from '@/types/model'
import { X, Palette, Plus, Check, AlertTriangle } from 'lucide-react'
import type { ScopeViolation } from '@/lib/scopeValidation'
import { ColorPicker } from './tagStyleControls'
import { STRUCTURIZR_SHAPES, PRESET_COLORS } from './tagStyleConstants'

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

// FloatingBottomStrip now only surfaces orphan scope violations. The manage-tags
// pencil moved into the Highlighter panel's Tags tab; the highlighter bar moved
// into the right-side panel.
export default function FloatingBottomStrip() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const scopeViolations = useWorkspaceStore((s) => s.scopeViolations)
  if (!workspace) return null
  const orphans = scopeViolations.filter((v) => !v.elementId && !v.relationshipId)
  if (orphans.length === 0) return null
  return <ScopeViolationBanner violations={orphans} />
}

// ─── Tag Manager Panel ────────────────────────────────────────────────

export function TagManagerPanel({
  onClose,
}: {
  onClose: () => void
}) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const renameTag = useWorkspaceStore((s) => s.renameTag)
  const removeTagGlobal = useWorkspaceStore((s) => s.removeTagGlobal)
  const updateElementStyle = useWorkspaceStore((s) => s.updateElementStyle)
  const [editingStyleFor, setEditingStyleFor] = useState<string | null>(null)
  const [newTagValue, setNewTagValue] = useState('')
  const newTagInputRef = useRef<HTMLInputElement>(null)

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  const tags = useMemo(() => {
    const tagSet = new Set<string>(['Person', 'Software System', 'Container', 'Component'])
    if (!workspace) return Array.from(tagSet)
    for (const el of elementMap.values()) {
      for (const tag of (el as { tags: string[] }).tags) {
        if (!DEFAULT_BUILTIN_TAGS.includes(tag)) tagSet.add(tag)
      }
    }
    for (const s of workspace.views.configuration.styles.elements) {
      tagSet.add(s.tag)
    }
    return Array.from(tagSet).sort()
  }, [workspace, elementMap])

  const elementStyles = workspace?.views.configuration.styles.elements ?? []
  function getStyleForTag(tag: string): ElementStyle | undefined {
    return elementStyles.find((s) => s.tag === tag)
  }

  function handleAddTag() {
    const trimmed = newTagValue.trim()
    if (!trimmed) return
    updateElementStyle({ tag: trimmed })
    setNewTagValue('')
    newTagInputRef.current?.focus()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'transparent', border: 'none', padding: 0, cursor: 'default',
        }}
      />
      <div
        className="glass-panel-solid"
        data-canvas-chrome="tag-manager"
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
          <button onClick={onClose} className="btn-icon" aria-label="Close tag manager" style={{ minWidth: 24, minHeight: 24, padding: 4 }}>
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
          {(() => {
            const typeTags = tags.filter((t) => BUILTIN_TAGS.has(t))
            const customTags = tags.filter((t) => !BUILTIN_TAGS.has(t))
            return (
              <>
                {typeTags.length > 0 && (
                  <>
                    <div style={{ padding: '6px 7px 2px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.03em' }}>Type</div>
                    {typeTags.map((tag) => (
                      <TagRow
                        key={tag}
                        tag={tag}
                        style={getStyleForTag(tag)}
                        builtIn
                        editingStyle={editingStyleFor === tag}
                        onEditStyle={() => setEditingStyleFor(editingStyleFor === tag ? null : tag)}
                        onCloseStyle={() => setEditingStyleFor(null)}
                        onRename={(newName) => { renameTag(tag, newName) }}
                        onDelete={() => removeTagGlobal(tag)}
                      />
                    ))}
                  </>
                )}
                {customTags.length > 0 && (
                  <>
                    <div style={{ padding: `${typeTags.length > 0 ? '10px' : '6px'} 7px 2px`, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.03em' }}>Custom</div>
                    {customTags.map((tag) => (
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
                  </>
                )}
              </>
            )
          })()}
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
  tag, style, builtIn, editingStyle,
  onEditStyle, onCloseStyle, onRename, onDelete,
}: {
  tag: string
  style: ElementStyle | undefined
  builtIn?: boolean
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
          border: '1px solid var(--glass-overlay-md)',
        }} />

        {/* Tag name: read-only label for built-in, editable input for custom */}
        {builtIn ? (
          <span style={{
            flex: 1, height: 26, padding: '0 7px',
            display: 'flex', alignItems: 'center',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-sm)', fontWeight: 500,
          }}>
            {tag}
          </span>
        ) : (
          <>
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
                aria-label="Confirm rename"
                style={{
                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent-glow)', color: 'var(--color-accent)',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Check size={11} />
              </button>
            )}
          </>
        )}

        {/* Style button */}
        <button
          onClick={onEditStyle}
          className="hover-surface-inactive"
          data-active={editingStyle ? 'true' : undefined}
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: editingStyle ? 'var(--color-accent-active)' : 'transparent',
            color: editingStyle ? 'var(--color-accent)' : 'var(--color-text-muted)',
            cursor: 'pointer', flexShrink: 0, transition: 'background 0.1s',
          }}
          title="Edit style"
          aria-label="Edit style"
        >
          <Palette size={11} />
        </button>

        {/* Delete button (hidden for built-in type tags) */}
        {!builtIn && (
          <button
            onClick={onDelete}
            className="hover-danger"
            style={{
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent',
              color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.1s, color 0.1s',
            }}
            title="Remove tag globally"
            aria-label={`Remove tag "${tag}" globally`}
          >
            <X size={11} />
          </button>
        )}
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

// ─── Tag Style Editor (inline in manager) ────────────────────────────

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
      background: 'var(--glass-overlay-xxs)',
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
      {style && (
        <button
          onClick={() => { removeElementStyle(tag); onClose() }}
          className="hover-danger-text"
          style={{
            marginTop: 10, width: '100%', padding: '5px 0', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-error)', background: 'transparent',
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

function ScopeViolationBanner({ violations }: { violations: ScopeViolation[] }) {
  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
      background: 'var(--color-tint-error)', border: '1px solid var(--color-border-error)',
      borderRadius: 10, padding: '8px 16px', fontSize: 12, color: 'var(--color-error-text)',
      display: 'flex', alignItems: 'center', gap: 8, maxWidth: 500, pointerEvents: 'auto',
    }}>
      <AlertTriangle size={14} />
      <span>{violations[0].message}</span>
      {violations.length > 1 && <span style={{ opacity: 0.7 }}>+{violations.length - 1} more</span>}
    </div>
  )
}
