import { useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore, getSelectedElement, getRelationshipById, buildElementMap, getAllViews } from '@/store/workspace'
import type { ModelElement, Container, Component, Person, SoftwareSystem, Relationship, ElementStatus, LineStyle, Location, Group } from '@/types/model'
import { X, Plus, ArrowRight, ExternalLink, Sparkles, Loader2, Eye, Layers, Trash2, ChevronRight } from 'lucide-react'
import { generateDescription, getAIConfig } from '@/lib/ai'
import { TYPE_LABELS, TYPE_COLORS } from '@/lib/elementMeta'

/** Returns the URL if it uses a safe protocol (http, https, or protocol-relative), otherwise null. */
function getSafeUrl(raw: string): string | null {
  try {
    if (raw.startsWith('//')) return raw
    const parsed = new URL(raw)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return raw
    return null
  } catch {
    return null
  }
}

const STATUS_OPTIONS: ElementStatus[] = ['Live', 'Planned', 'Deprecated', 'Removed']

const LINE_STYLE_OPTIONS: LineStyle[] = ['Curved', 'Straight', 'Orthogonal']

type PanelTab = 'properties' | 'relations' | 'tags'

const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'relations', label: 'Relations' },
  { id: 'tags', label: 'Tags' },
]

export default function RightPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const selectedIds = useWorkspaceStore((s) => s.selectedElementIds)
  const selectedRelId = useWorkspaceStore((s) => s.selectedRelationshipId)
  const selectedGroupId = useWorkspaceStore((s) => s.selectedGroupId)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)

  if (!workspace) return null

  const element = getSelectedElement(workspace, selectedIds)
  const relationship = selectedRelId ? getRelationshipById(workspace, selectedRelId) : undefined
  const group = selectedGroupId ? workspace.model.groups.find(g => g.id === selectedGroupId) : undefined

  return (
    <div className="glass-panel-solid flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-lg shadow-black/20">
      {element ? (
        <ElementProperties element={element} onClose={clearSelection} />
      ) : relationship ? (
        <RelationshipProperties relationship={relationship} onClose={clearSelection} />
      ) : group ? (
        <GroupProperties group={group} onClose={clearSelection} />
      ) : null}
    </div>
  )
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </label>
  )
}

function EditableField({ value, placeholder, onCommit, onLiveChange, multiline, 'aria-label': ariaLabel }: {
  value: string
  placeholder?: string
  onCommit: (val: string) => void
  onLiveChange?: (val: string) => void
  multiline?: boolean
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  const handleChange = (newVal: string) => {
    setDraft(newVal)
    onLiveChange?.(newVal)
  }

  const handleBlur = () => {
    setFocused(false)
    onCommit(draft)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      onCommit(draft)
    }
    if (e.key === 'Escape') {
      setDraft(value)
      onLiveChange?.(value)
      ;(e.target as HTMLElement).blur()
    }
  }

  // Sync external changes only when not focused
  if (!focused && draft !== value) setDraft(value)

  const style = {
    background: focused ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
    borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)',
    color: 'var(--color-text-primary)',
  }

  if (multiline) {
    return (
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={3}
        className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
        style={style}
      />
    )
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
      style={style}
    />
  )
}

// ─── Element Properties ──────────────────────────────────────────────

function ElementProperties({ element, onClose }: { element: ModelElement; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<PanelTab>('properties')
  const updateElement = useWorkspaceStore((s) => s.updateElement)
  const updateElementLive = useWorkspaceStore((s) => s.updateElementLive)
  const updateTech = useWorkspaceStore((s) => s.updateElementTechnology)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const tech = (element as Container | Component).technology
  const hasTech = element.type === 'container' || element.type === 'component'
  const hasLocation = element.type === 'person' || element.type === 'softwareSystem'
  const location = (element as Person | SoftwareSystem).location
  const typeColor = TYPE_COLORS[element.type] ?? 'var(--color-accent)'

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const handleGenerateDescription = async () => {
    if (!getAIConfig()) return
    setAiLoading(true)
    setAiError(null)
    try {
      const desc = await generateDescription(
        element.name,
        TYPE_LABELS[element.type],
        hasTech ? tech : undefined,
        workspace?.name,
      )
      if (desc) updateElement(element.id, { description: desc })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI description generation failed'
      setAiError(msg)
    } finally {
      setAiLoading(false)
    }
  }

  // Find which views contain this element
  const appearsInViews = workspace ? getAllViews(workspace).filter(v =>
    v.elements.some(e => e.id === element.id)
  ) : []

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="text-sm font-semibold">{element.name}</div>
          <div className="text-[11px]" style={{ color: typeColor }}>{TYPE_LABELS[element.type]}</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close panel"><X size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-1" style={{ borderColor: 'var(--color-border)' }} role="tablist" aria-label="Element details">
        {PANEL_TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150"
            style={{
              color: activeTab === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderBottom: activeTab === id ? '2px solid var(--color-accent)' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4" role="tabpanel" aria-label={activeTab}>
        {activeTab === 'properties' && (
          <div className="space-y-4">
            <div>
              <FieldLabel>Name</FieldLabel>
              <EditableField value={element.name} placeholder="Element name" aria-label="Element name" onLiveChange={(v) => updateElementLive(element.id, { name: v })} onCommit={(v) => updateElement(element.id, { name: v })} />
            </div>
            {hasLocation && (
              <div>
                <FieldLabel htmlFor="el-location">Location</FieldLabel>
                <select
                  id="el-location"
                  value={location ?? 'Internal'}
                  onChange={(e) => updateElement(element.id, { location: e.target.value as Location })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-2)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <option value="Internal">Internal</option>
                  <option value="External">External</option>
                  <option value="Unspecified">Unspecified</option>
                </select>
              </div>
            )}
            {hasTech && (
              <div>
                <FieldLabel>Technology</FieldLabel>
                <EditableField value={tech ?? ''} placeholder="e.g. React, PostgreSQL..." aria-label="Technology" onLiveChange={(v) => updateElementLive(element.id, { technology: v })} onCommit={(v) => updateTech(element.id, v)} />
              </div>
            )}
            <div>
              <FieldLabel>Description</FieldLabel>
              <EditableField value={element.description ?? ''} placeholder="Describe this element..." aria-label="Description" onLiveChange={(v) => updateElementLive(element.id, { description: v || undefined })} onCommit={(v) => updateElement(element.id, { description: v || undefined })} multiline />
              {getAIConfig() && (
                <>
                  <button
                    onClick={handleGenerateDescription}
                    disabled={aiLoading}
                    className="mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors hover:bg-[var(--color-surface-3)]"
                    style={{ color: 'var(--color-accent)' }}
                    data-testid="ai-generate-description"
                  >
                    {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {aiLoading ? 'Generating...' : 'Generate with AI'}
                  </button>
                  {aiError && (
                    <div className="mt-1 rounded px-2 py-1 text-[10px]" style={{ color: 'var(--color-error)', background: 'var(--color-tint-error)' }}>
                      {aiError}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Status */}
            <div>
              <FieldLabel htmlFor="el-status">Status</FieldLabel>
              <select
                id="el-status"
                value={element.status ?? ''}
                onChange={(e) => updateElement(element.id, { status: (e.target.value || undefined) as ElementStatus | undefined })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{
                  background: 'var(--color-surface-2)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
                data-testid="element-status"
              >
                <option value="">Not set</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Owner */}
            <div>
              <FieldLabel>Owner</FieldLabel>
              <EditableField value={element.owner ?? ''} placeholder="e.g. Team Alpha" aria-label="Owner" onLiveChange={(v) => updateElementLive(element.id, { owner: v || undefined })} onCommit={(v) => updateElement(element.id, { owner: v || undefined })} />
            </div>

            {/* URL */}
            <div>
              <FieldLabel>URL</FieldLabel>
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <EditableField value={element.url ?? ''} placeholder="https://..." aria-label="URL" onLiveChange={(v) => updateElementLive(element.id, { url: v || undefined })} onCommit={(v) => updateElement(element.id, { url: v || undefined })} />
                </div>
                {element.url && getSafeUrl(element.url) && (
                  <a
                    href={getSafeUrl(element.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-icon !min-h-8 !min-w-8 !p-1.5 shrink-0"
                    title="Open URL"
                    aria-label="Open URL in new tab"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>

            {/* Appears in views */}
            {appearsInViews.length > 0 && (
              <AppearsInViews views={appearsInViews} />
            )}
          </div>
        )}

        {activeTab === 'relations' && <ElementRelationsTab elementId={element.id} />}

        {activeTab === 'tags' && <TagsTab tags={element.tags} onUpdate={(tags) => updateElement(element.id, { tags })} />}
      </div>
    </div>
  )
}

function AppearsInViews({ views }: { views: { key: string; title?: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 mb-1"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <ChevronRight
          size={12}
          style={{
            color: 'var(--color-text-muted)',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          Appears in views
        </span>
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>
          {views.length}
        </span>
      </button>
      {open && (
        <div className="space-y-0.5">
          {views.map(v => (
            <ViewLink key={v.key} viewKey={v.key} title={v.title ?? v.key} />
          ))}
        </div>
      )}
    </div>
  )
}

function ViewLink({ viewKey, title }: { viewKey: string; title: string }) {
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  return (
    <button
      onClick={() => setActiveView(viewKey)}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-3)]"
      style={{ color: 'var(--color-text-secondary)', textAlign: 'left' }}
    >
      <Eye size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
      <span>{title}</span>
    </button>
  )
}

// ─── Relationship Properties ─────────────────────────────────────────

function RelationshipProperties({ relationship, onClose }: { relationship: Relationship; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const updateRelationship = useWorkspaceStore((s) => s.updateRelationship)

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])
  const source = elementMap.get(relationship.sourceId)
  const dest = elementMap.get(relationship.destinationId)

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate max-w-[80px]">{source?.name ?? '?'}</span>
            <ArrowRight size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <span className="truncate max-w-[80px]">{dest?.name ?? '?'}</span>
          </div>
          <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Relationship</div>
        </div>
        <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close panel"><X size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <FieldLabel>Description</FieldLabel>
          <EditableField value={relationship.description ?? ''} placeholder="e.g. Makes API calls to..." aria-label="Description" onCommit={(v) => updateRelationship(relationship.id, { description: v || undefined })} />
        </div>
        <div>
          <FieldLabel>Technology</FieldLabel>
          <EditableField value={relationship.technology ?? ''} placeholder="e.g. REST/HTTP, gRPC..." aria-label="Technology" onCommit={(v) => updateRelationship(relationship.id, { technology: v || undefined })} />
        </div>
        <div>
          <FieldLabel>Interaction Style</FieldLabel>
          <div className="flex gap-1.5">
            {(['Synchronous', 'Asynchronous'] as const).map(is => {
              const active = (relationship.interactionStyle ?? 'Synchronous') === is
              return (
                <button
                  key={is}
                  onClick={() => updateRelationship(relationship.id, { interactionStyle: is })}
                  title={is}
                  aria-label={`Interaction style: ${is}`}
                  className="flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-[10px] font-medium transition-colors"
                  style={{
                    flex: 1,
                    background: active ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                    borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
                    {is === 'Synchronous' ? (
                      <>
                        <line x1="2" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" />
                        <polyline points="28,3 34,8 28,13" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </>
                    ) : (
                      <>
                        <line x1="2" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <polyline points="28,3 34,8 28,13" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </>
                    )}
                  </svg>
                  {is === 'Synchronous' ? 'Sync' : 'Async'}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <FieldLabel>Line Style</FieldLabel>
          <div className="flex gap-1.5" data-testid="line-style">
            {LINE_STYLE_OPTIONS.map(ls => {
              const active = (relationship.lineStyle ?? 'Curved') === ls
              return (
                <button
                  key={ls}
                  onClick={() => updateRelationship(relationship.id, { lineStyle: ls })}
                  title={ls}
                  aria-label={`Line style: ${ls}`}
                  className="flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-[10px] font-medium transition-colors"
                  style={{
                    flex: 1,
                    background: active ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                    borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
                    {ls === 'Curved' && (
                      <path d="M2 14 C12 14, 12 2, 18 2 S24 14, 34 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    )}
                    {ls === 'Straight' && (
                      <line x1="2" y1="14" x2="34" y2="2" stroke="currentColor" strokeWidth="1.5" />
                    )}
                    {ls === 'Orthogonal' && (
                      <polyline points="2,14 2,2 34,2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    )}
                  </svg>
                  {ls}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <FieldLabel>URL</FieldLabel>
          <div className="flex items-center gap-1.5">
            <div className="flex-1">
              <EditableField value={relationship.url ?? ''} placeholder="https://..." aria-label="URL" onCommit={(v) => updateRelationship(relationship.id, { url: v || undefined })} />
            </div>
            {relationship.url && getSafeUrl(relationship.url) && (
              <a
                href={getSafeUrl(relationship.url)!}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon !min-h-8 !min-w-8 !p-1.5 shrink-0"
                title="Open URL"
                aria-label="Open URL in new tab"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
        <div>
          <FieldLabel>Tags</FieldLabel>
          <TagsTab tags={relationship.tags} onUpdate={(tags) => updateRelationship(relationship.id, { tags })} />
        </div>
      </div>
    </div>
  )
}

// ─── Element Relations Tab ───────────────────────────────────────────

function ElementRelationsTab({ elementId }: { elementId: string }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const selectRelationship = useWorkspaceStore((s) => s.selectRelationship)

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  if (!workspace) return null
  const rels = workspace.model.relationships.filter(
    (r) => r.sourceId === elementId || r.destinationId === elementId,
  )

  if (rels.length === 0) {
    return <div className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>No relationships</div>
  }

  return (
    <div className="space-y-1.5">
      {rels.map((rel) => {
        const isSource = rel.sourceId === elementId
        const otherId = isSource ? rel.destinationId : rel.sourceId
        const other = elementMap.get(otherId)
        return (
          <button
            key={rel.id}
            onClick={() => selectRelationship(rel.id)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <ArrowRight
              size={10}
              style={{
                color: 'var(--color-text-muted)',
                flexShrink: 0,
                transform: isSource ? 'none' : 'rotate(180deg)',
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {other?.name ?? otherId}
              </div>
              {rel.description && (
                <div className="truncate" style={{ color: 'var(--color-text-muted)' }}>{rel.description}</div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Tags Tab ────────────────────────────────────────────────────────

const BUILT_IN_TAGS = new Set(['Element', 'Person', 'Software System', 'Container', 'Component', 'Database', 'Relationship'])

function TagsTab({ tags, onUpdate }: { tags: string[]; onUpdate: (tags: string[]) => void }) {
  const [newTag, setNewTag] = useState('')

  const addTag = useCallback(() => {
    const trimmed = newTag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onUpdate([...tags, trimmed])
      setNewTag('')
    }
  }, [newTag, tags, onUpdate])

  const removeTag = (tag: string) => {
    if (BUILT_IN_TAGS.has(tag)) return
    onUpdate(tags.filter((t) => t !== tag))
  }

  return (
    <div className="space-y-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const isBuiltIn = BUILT_IN_TAGS.has(tag)
            return (
              <span
                key={tag}
                className={isBuiltIn ? undefined : 'group'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: 'var(--text-xs-plus)',
                  fontWeight: 500,
                  background: isBuiltIn ? 'transparent' : 'var(--color-surface-3)',
                  border: isBuiltIn ? '1px dashed var(--color-border)' : '1px solid var(--color-border)',
                  color: isBuiltIn ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                  cursor: isBuiltIn ? 'default' : undefined,
                  opacity: isBuiltIn ? 0.6 : 1,
                }}
                title={isBuiltIn ? 'Built-in type tag — cannot be removed' : undefined}
              >
                {tag}
                {!isBuiltIn && (
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--color-text-muted)', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
          placeholder="Add tag..."
          className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
          style={{
            background: 'var(--color-surface-2)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          onClick={addTag}
          disabled={!newTag.trim()}
          className="btn-icon !min-h-7 !min-w-7 !p-1 disabled:opacity-30"
          aria-label="Add tag"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Group Properties ─────────────────────────────────────────────────

function GroupProperties({ group, onClose }: { group: Group; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const updateGroup = useWorkspaceStore((s) => s.updateGroup)
  const deleteGroup = useWorkspaceStore((s) => s.deleteGroup)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const [addSearch, setAddSearch] = useState('')

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  if (!workspace) return null

  // Elements currently in the group
  const members = group.elementIds
    .map(id => elementMap.get(id))
    .filter(Boolean) as ModelElement[]

  // Elements NOT in the group (candidates to add)
  const memberSet = new Set(group.elementIds)
  const q = addSearch.toLowerCase().trim()
  const candidates = Array.from(elementMap.values()).filter(el =>
    !memberSet.has(el.id) &&
    (q === '' || el.name.toLowerCase().includes(q) || el.type.toLowerCase().includes(q))
  )

  function removeMember(id: string) {
    updateGroup(group.id, { elementIds: group.elementIds.filter(eid => eid !== id) })
  }

  function addMember(id: string) {
    updateGroup(group.id, { elementIds: [...group.elementIds, id] })
    setAddSearch('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <Layers size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent)', flex: 1 }}>
          Group
        </span>
        <button
          onClick={() => confirmDelete(`Delete group "${group.name}"?`, () => { deleteGroup(group.id); onClose() })}
          className="btn-icon !min-h-6 !min-w-6 !p-1"
          title="Delete group"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Trash2 size={12} />
        </button>
        <button onClick={onClose} className="btn-icon !min-h-6 !min-w-6 !p-1" title="Close" aria-label="Close panel">
          <X size={12} />
        </button>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name */}
        <div>
          <FieldLabel>Name</FieldLabel>
          <EditableField
            value={group.name}
            placeholder="Group name"
            aria-label="Group name"
            onCommit={(val) => updateGroup(group.id, { name: val })}
          />
        </div>

        {/* Members */}
        <div>
          <FieldLabel>Members ({members.length})</FieldLabel>
          {members.length === 0 ? (
            <p style={{ fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No members yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {members.map(el => (
                <div key={el.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-2)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[el.type] ?? 'var(--color-accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {el.name}
                  </span>
                  <button
                    onClick={() => removeMember(el.id)}
                    style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}
                    title="Remove from group"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add members */}
        <div>
          <FieldLabel>Add member</FieldLabel>
          <input
            type="text"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Search elements..."
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
              marginBottom: candidates.length > 0 ? 6 : 0,
            }}
          />
          {candidates.length > 0 && (
            <div style={{
              maxHeight: 160,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-1)',
              padding: 4,
            }}>
              {candidates.slice(0, 20).map(el => (
                <button
                  key={el.id}
                  onClick={() => addMember(el.id)}
                  className="hover-surface-2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 5,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[el.type] ?? 'var(--color-accent)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.name}</span>
                  <Plus size={11} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--color-text-muted)' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
