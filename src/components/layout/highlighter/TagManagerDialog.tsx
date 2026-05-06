import { useMemo, useRef, useState } from 'react'
import { Plus, Tag as TagIcon, X } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, buildElementMap, BUILTIN_TAGS } from '@/store/workspace'
import type { ElementStyle } from '@/types/model'
import { ColorPicker } from '../tagStyleControls'
import {
  PRESET_COLORS as TAG_PRESET_COLORS,
  TAG_TEXT_PRESETS,
  STRUCTURIZR_SHAPES as TAG_SHAPES,
} from '../tagStyleConstants'

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

const COL_TEMPLATE = 'minmax(190px, 1.4fr) minmax(180px, 1.2fr) minmax(160px, 1.1fr) 130px 110px 150px 32px'

/** Modal-style tag manager. Replaces the old portal-style TagManagerPanel
 *  with a wide table layout — every style attribute (background, text,
 *  shape, border, opacity) is editable inline on a single row per tag. */
export default function TagManagerDialog({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const renameTag = useWorkspaceStore((s) => s.renameTag)
  const removeTagGlobal = useWorkspaceStore((s) => s.removeTagGlobal)
  const updateElementStyle = useWorkspaceStore((s) => s.updateElementStyle)

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  const tags = useMemo(() => {
    const tagSet = new Set<string>(['Person', 'Software System', 'Container', 'Component'])
    if (!workspace) return Array.from(tagSet)
    for (const el of elementMap.values()) {
      for (const tag of (el as { tags: string[] }).tags) {
        if (!DEFAULT_BUILTIN_TAGS.includes(tag)) tagSet.add(tag)
      }
    }
    for (const s of workspace.views.configuration.styles.elements) tagSet.add(s.tag)
    return Array.from(tagSet)
  }, [workspace, elementMap])

  const styleByTag = useMemo(() => {
    const map = new Map<string, ElementStyle>()
    const styles = workspace?.views.configuration.styles.elements ?? []
    for (const s of styles) map.set(s.tag, s)
    return map
  }, [workspace])

  // Show built-in type tags first (in canonical order), then everything else alphabetically.
  const orderedTags = useMemo(() => {
    const typeOrder = ['Person', 'Software System', 'Container', 'Component']
    const types = typeOrder.filter((t) => tags.includes(t))
    const rest = tags.filter((t) => !typeOrder.includes(t)).sort((a, b) => a.localeCompare(b))
    return [...types, ...rest]
  }, [tags])

  const [newTagDraft, setNewTagDraft] = useState('')
  const newTagInputRef = useRef<HTMLInputElement>(null)

  function handleAddTag() {
    const v = newTagDraft.trim()
    if (!v) return
    if (tags.includes(v)) {
      newTagInputRef.current?.focus()
      return
    }
    // A tag exists once any element references it OR a style entry is created
    // for it. Seeding an empty style row is the simplest way to make the new
    // tag immediately appear and become editable here.
    updateElementStyle({ tag: v })
    setNewTagDraft('')
    newTagInputRef.current?.focus()
  }

  if (!workspace) return null

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="Manage tags"
      style={{
        width: 'min(1080px, calc(100vw - 32px))',
        maxHeight: 'min(82vh, 760px)',
        display: 'flex',
        flexDirection: 'column',
        // DialogShell ships no default background — without these the modal
        // body sits transparent over the dimmed canvas backdrop. Match the
        // surface tones used by SearchDialog / ExportDialog for consistency.
        background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <TagIcon size={16} style={{ color: 'var(--color-accent)' }} />
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.005em',
          }}
        >
          Manage tags
        </h2>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
        </span>
        <button
          type="button"
          onClick={() => newTagInputRef.current?.focus()}
          className="hover-lift"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-accent)',
            background: 'transparent',
            color: 'var(--color-accent)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          New tag
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn-icon"
          aria-label="Close tag manager"
          title="Close"
          style={{ minWidth: 26, minHeight: 26, padding: 4 }}
        >
          <X size={14} />
        </button>
      </header>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COL_TEMPLATE,
          gap: 10,
          padding: '10px 18px 8px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          minWidth: 920,
        }}
      >
        <span>Tag</span>
        <span>Background</span>
        <span>Text</span>
        <span>Shape</span>
        <span>Border</span>
        <span>Opacity</span>
        <span></span>
      </div>

      {/* Body — scrollable rows */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '6px 18px',
        }}
      >
        {orderedTags.length === 0 && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            No tags yet. Add one below or tag an element to start.
          </div>
        )}
        {orderedTags.map((tag) => (
          <TagRow
            key={tag}
            tag={tag}
            style={styleByTag.get(tag)}
            builtIn={BUILTIN_TAGS.has(tag)}
            onUpdate={(patch) => updateElementStyle({ tag, ...patch })}
            onRename={(next) => renameTag(tag, next)}
            onRemove={() => removeTagGlobal(tag)}
          />
        ))}
      </div>

      {/* Footer: add new tag */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <input
          ref={newTagInputRef}
          type="text"
          value={newTagDraft}
          onChange={(e) => setNewTagDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
          placeholder="New tag name…"
          style={{
            flex: 1,
            height: 32,
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-xs)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleAddTag}
          disabled={!newTagDraft.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-accent)',
            background: newTagDraft.trim() ? 'var(--color-accent)' : 'transparent',
            color: newTagDraft.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            cursor: newTagDraft.trim() ? 'pointer' : 'not-allowed',
            opacity: newTagDraft.trim() ? 1 : 0.6,
          }}
        >
          <Plus size={12} />
          Add
        </button>
      </footer>
    </DialogShell>
  )
}

// ─── Row ───────────────────────────────────────────────────────────────

function TagRow({
  tag, style, builtIn,
  onUpdate, onRename, onRemove,
}: {
  tag: string
  style: ElementStyle | undefined
  builtIn: boolean
  onUpdate: (patch: Partial<ElementStyle>) => void
  onRename: (next: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(tag)
  const [focused, setFocused] = useState(false)
  if (!focused && draft !== tag) setDraft(tag)

  function commitRename() {
    setFocused(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== tag) onRename(trimmed)
    else setDraft(tag)
  }

  // Chip preview — uses the live style values so the chip mirrors what the
  // node will look like. Falls back to neutral surface tones when unset.
  const chipBg = style?.background || 'var(--color-surface-3)'
  const chipFg = style?.color || 'var(--color-text-primary)'
  const chipBorder = style?.stroke
    ? `1px solid ${style.stroke}`
    : '1px solid var(--color-border)'
  const chipShape = (style?.shape ?? '').toLowerCase()
  const chipRadius = chipShape === 'roundedbox' || chipShape === 'pill' ? 999 : 4

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COL_TEMPLATE,
        gap: 10,
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        minWidth: 920,
      }}
    >
      {/* TAG: chip preview + editable name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: chipRadius,
            background: chipBg,
            color: chipFg,
            border: chipBorder,
            fontSize: 11,
            fontWeight: 600,
            maxWidth: 110,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            opacity: style?.opacity != null ? style.opacity / 100 : 1,
          }}
        >
          {tag}
        </span>
        {builtIn ? (
          <span
            style={{
              flex: 1,
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title="Built-in tag — name not editable"
          >
            {tag}
          </span>
        ) : (
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
            aria-label={`Rename tag ${tag}`}
            style={{
              flex: 1,
              minWidth: 0,
              height: 26,
              padding: '0 7px',
              borderRadius: 'var(--radius-sm)',
              border: focused ? '1px solid var(--color-accent)' : '1px solid transparent',
              background: focused ? 'var(--color-surface-3)' : 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-xs)',
              outline: 'none',
              transition: 'border-color 0.12s, background 0.12s',
            }}
          />
        )}
      </div>

      {/* BACKGROUND */}
      <div>
        <ColorPicker
          value={style?.background ?? ''}
          onChange={(v) => onUpdate({ background: v || undefined })}
          presets={TAG_PRESET_COLORS}
        />
      </div>

      {/* TEXT */}
      <div>
        <ColorPicker
          value={style?.color ?? ''}
          onChange={(v) => onUpdate({ color: v || undefined })}
          presets={TAG_TEXT_PRESETS}
        />
      </div>

      {/* SHAPE */}
      <div>
        <select
          value={style?.shape ?? ''}
          onChange={(e) => onUpdate({ shape: e.target.value || undefined })}
          aria-label={`Shape for ${tag}`}
          style={selectStyle}
        >
          <option value="">default</option>
          {TAG_SHAPES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
      </div>

      {/* BORDER */}
      <div>
        <select
          value={style?.border ?? ''}
          onChange={(e) => onUpdate({ border: e.target.value || undefined })}
          aria-label={`Border for ${tag}`}
          style={selectStyle}
        >
          <option value="">none</option>
          <option value="Solid">solid</option>
          <option value="Dashed">dashed</option>
          <option value="Dotted">dotted</option>
        </select>
      </div>

      {/* OPACITY */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={style?.opacity ?? 100}
          onChange={(e) => {
            const v = Number(e.target.value)
            onUpdate({ opacity: v < 100 ? v : undefined })
          }}
          aria-label={`Opacity for ${tag}`}
          style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        />
        <span
          style={{
            fontSize: 10,
            color: 'var(--color-text-muted)',
            width: 32,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {style?.opacity ?? 100}%
        </span>
      </div>

      {/* REMOVE */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {!builtIn ? (
          <button
            type="button"
            onClick={onRemove}
            className="hover-danger"
            aria-label={`Remove tag ${tag}`}
            title="Remove tag"
            style={{
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 26,
  padding: '0 6px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-xs)',
  outline: 'none',
}
