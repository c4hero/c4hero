import { useState, useCallback } from 'react'
import { useWorkspaceStore, getSelectedElement, getActiveView, getRelationshipById, buildElementMap, getAllViews } from '@/store/workspace'
import type { ModelElement, Container, Component, Relationship, ElementStatus, LineStyle } from '@/types/model'
import { X, MoreHorizontal, Plus, ArrowRight, ExternalLink, Sparkles, Loader2, Eye } from 'lucide-react'
import { generateDescription, getAIConfig } from '@/lib/ai'

const TYPE_LABELS: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}

const TYPE_COLORS: Record<string, string> = {
  person: 'var(--color-type-person)',
  softwareSystem: 'var(--color-type-system)',
  container: 'var(--color-type-container)',
  component: 'var(--color-type-component)',
}

const STATUS_OPTIONS: ElementStatus[] = ['Live', 'Planned', 'Deprecated', 'Removed']

const LINE_STYLE_OPTIONS: LineStyle[] = ['Curved', 'Straight', 'Orthogonal']

type PanelTab = 'properties' | 'relations' | 'tags'

export default function RightPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const selectedIds = useWorkspaceStore((s) => s.selectedElementIds)
  const selectedRelId = useWorkspaceStore((s) => s.selectedRelationshipId)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)

  if (!workspace) return null

  const element = getSelectedElement(workspace, selectedIds)
  const relationship = selectedRelId ? getRelationshipById(workspace, selectedRelId) : undefined
  const view = activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  return (
    <div className="glass-panel-solid flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-lg shadow-black/20">
      {element ? (
        <ElementProperties element={element} onClose={clearSelection} />
      ) : relationship ? (
        <RelationshipProperties relationship={relationship} onClose={clearSelection} />
      ) : view ? (
        <ViewProperties />
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <p className="text-center text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Select an element or relationship to edit
      </p>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </label>
  )
}

function EditableField({ value, placeholder, onCommit, multiline }: {
  value: string
  placeholder?: string
  onCommit: (val: string) => void
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  const handleBlur = () => {
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    }
    if (e.key === 'Escape') {
      setDraft(value)
      ;(e.target as HTMLElement).blur()
    }
  }

  // Sync external changes
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
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
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
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
      style={style}
    />
  )
}

// ─── Element Properties ──────────────────────────────────────────────

function ElementProperties({ element, onClose }: { element: ModelElement; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<PanelTab>('properties')
  const updateElement = useWorkspaceStore((s) => s.updateElement)
  const updateTech = useWorkspaceStore((s) => s.updateElementTechnology)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const tech = (element as Container | Component).technology
  const hasTech = element.type === 'container' || element.type === 'component'
  const typeColor = TYPE_COLORS[element.type] ?? 'var(--color-accent)'

  const [aiLoading, setAiLoading] = useState(false)

  const handleGenerateDescription = async () => {
    if (!getAIConfig()) return
    setAiLoading(true)
    try {
      const desc = await generateDescription(
        element.name,
        TYPE_LABELS[element.type],
        hasTech ? tech : undefined,
        workspace?.name,
      )
      if (desc) updateElement(element.id, { description: desc })
    } catch (err) {
      console.error('AI description generation failed:', err)
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
          <button className="btn-icon !min-h-7 !min-w-7 !p-1"><MoreHorizontal size={14} /></button>
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1"><X size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-1" style={{ borderColor: 'var(--color-border)' }}>
        {([
          { id: 'properties' as PanelTab, label: 'Properties' },
          { id: 'relations' as PanelTab, label: 'Relations' },
          { id: 'tags' as PanelTab, label: 'Tags' },
        ]).map(({ id, label }) => (
          <button
            key={id}
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
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'properties' && (
          <div className="space-y-4">
            <div>
              <FieldLabel>Name</FieldLabel>
              <EditableField value={element.name} placeholder="Element name" onCommit={(v) => updateElement(element.id, { name: v })} />
            </div>
            {hasTech && (
              <div>
                <FieldLabel>Technology</FieldLabel>
                <EditableField value={tech ?? ''} placeholder="e.g. React, PostgreSQL..." onCommit={(v) => updateTech(element.id, v)} />
              </div>
            )}
            <div>
              <FieldLabel>Description</FieldLabel>
              <EditableField value={element.description ?? ''} placeholder="Describe this element..." onCommit={(v) => updateElement(element.id, { description: v || undefined })} multiline />
              {getAIConfig() && (
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
              )}
            </div>

            {/* Status */}
            <div>
              <FieldLabel>Status</FieldLabel>
              <select
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
              <EditableField value={element.owner ?? ''} placeholder="e.g. Team Alpha" onCommit={(v) => updateElement(element.id, { owner: v || undefined })} />
            </div>

            {/* URL */}
            <div>
              <FieldLabel>URL</FieldLabel>
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <EditableField value={element.url ?? ''} placeholder="https://..." onCommit={(v) => updateElement(element.id, { url: v || undefined })} />
                </div>
                {element.url && (
                  <a
                    href={element.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-icon !min-h-8 !min-w-8 !p-1.5 shrink-0"
                    title="Open URL"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>

            {/* Appears in views */}
            {appearsInViews.length > 0 && (
              <div>
                <FieldLabel>Appears in views</FieldLabel>
                <div className="space-y-1">
                  {appearsInViews.map(v => (
                    <ViewLink key={v.key} viewKey={v.key} title={v.title ?? v.key} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'relations' && <ElementRelationsTab elementId={element.id} />}

        {activeTab === 'tags' && <TagsTab tags={element.tags} onUpdate={(tags) => updateElement(element.id, { tags })} />}
      </div>
    </div>
  )
}

function ViewLink({ viewKey, title }: { viewKey: string; title: string }) {
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  return (
    <button
      onClick={() => setActiveView(viewKey)}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-3)]"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <Eye size={11} style={{ color: 'var(--color-text-muted)' }} />
      {title}
    </button>
  )
}

// ─── Relationship Properties ─────────────────────────────────────────

function RelationshipProperties({ relationship, onClose }: { relationship: Relationship; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const updateRelationship = useWorkspaceStore((s) => s.updateRelationship)

  const elementMap = workspace ? buildElementMap(workspace) : new Map()
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
        <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1"><X size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <FieldLabel>Description</FieldLabel>
          <EditableField value={relationship.description ?? ''} placeholder="e.g. Makes API calls to..." onCommit={(v) => updateRelationship(relationship.id, { description: v || undefined })} />
        </div>
        <div>
          <FieldLabel>Technology</FieldLabel>
          <EditableField value={relationship.technology ?? ''} placeholder="e.g. REST/HTTP, gRPC..." onCommit={(v) => updateRelationship(relationship.id, { technology: v || undefined })} />
        </div>
        <div>
          <FieldLabel>Interaction Style</FieldLabel>
          <select
            value={relationship.interactionStyle ?? 'Synchronous'}
            onChange={(e) => updateRelationship(relationship.id, { interactionStyle: e.target.value as 'Synchronous' | 'Asynchronous' })}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            <option value="Synchronous">Synchronous</option>
            <option value="Asynchronous">Asynchronous</option>
          </select>
        </div>
        <div>
          <FieldLabel>Line Style</FieldLabel>
          <select
            value={relationship.lineStyle ?? 'Curved'}
            onChange={(e) => updateRelationship(relationship.id, { lineStyle: e.target.value as LineStyle })}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            data-testid="line-style"
            style={{
              background: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            {LINE_STYLE_OPTIONS.map(ls => <option key={ls} value={ls}>{ls}</option>)}
          </select>
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

  if (!workspace) return null

  const elementMap = buildElementMap(workspace)
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
    onUpdate(tags.filter((t) => t !== tag))
  }

  return (
    <div className="space-y-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="group flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: 'var(--color-surface-3)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}
              >
                x
              </button>
            </span>
          ))}
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
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── View Properties ─────────────────────────────────────────────────

function ViewProperties() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const toggleElementInView = useWorkspaceStore((s) => s.toggleElementInView)
  if (!workspace || !activeViewKey) return null

  const view = getActiveView(workspace, activeViewKey)
  if (!view) return null

  const elementMap = buildElementMap(workspace)
  const allElements = Array.from(elementMap.values())
  const viewElementIds = new Set(view.elements.map(e => e.id))

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="text-sm font-semibold">{view.title ?? view.key}</div>
        <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>View</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {view.description && (
          <div>
            <FieldLabel>Description</FieldLabel>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{view.description}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Elements</FieldLabel>
            <div className="text-lg font-semibold">{view.elements.length}</div>
          </div>
          <div>
            <FieldLabel>Relationships</FieldLabel>
            <div className="text-lg font-semibold">{view.relationships.length}</div>
          </div>
        </div>

        {/* Include/exclude elements */}
        {allElements.length > 0 && (
          <div>
            <FieldLabel>Elements in view</FieldLabel>
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {allElements.map(el => (
                <label
                  key={el.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer hover:bg-[var(--color-surface-3)]"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <input
                    type="checkbox"
                    checked={viewElementIds.has(el.id)}
                    onChange={() => toggleElementInView(activeViewKey, el.id)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: TYPE_COLORS[el.type] ?? 'var(--color-accent)' }}
                  />
                  <span className="truncate">{el.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
