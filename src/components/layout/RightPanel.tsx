import { useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore, getSelectedElement, getRelationshipById, buildElementMap, getAllViews, isFocalScopeElement } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
import type { ModelElement, Container, Component, Person, SoftwareSystem, Relationship, ElementStatus, Location } from '@/types/model'
import { X, Plus, ArrowRight, ExternalLink, Eye, EyeOff, ChevronRight, Trash2 } from 'lucide-react'
import { TYPE_COLORS, getElementTypeLabel } from '@/lib/elementMeta'
import { normalizeSafeExternalUrl } from '@/lib/safeUrl'
import { FieldLabel, EditableField, TechnologyField, OwnerField } from './right-panel/fields'
import GroupProperties from './right-panel/GroupProperties'

const STATUS_OPTIONS: { value: ElementStatus | undefined; label: string; color: string | null }[] = [
  { value: undefined, label: 'Not set', color: null },
  { value: 'Live', label: 'Live', color: 'var(--color-status-live)' },
  { value: 'Planned', label: 'Planned', color: 'var(--color-status-planned)' },
  { value: 'Deprecated', label: 'Deprecated', color: 'var(--color-status-deprecated)' },
  { value: 'Removed', label: 'Removed', color: 'var(--color-status-removed)' },
]

const INTERACTION_STYLE_OPTIONS = [
  { value: undefined, label: 'Default', shortLabel: 'Auto' },
  { value: 'Synchronous' as const, label: 'Synchronous', shortLabel: 'Sync' },
  { value: 'Asynchronous' as const, label: 'Asynchronous', shortLabel: 'Async' },
]

const LINE_STYLE_OPTIONS = [
  { value: undefined, label: 'Default', shortLabel: 'Auto' },
  { value: 'Curved' as const, label: 'Curved', shortLabel: 'Curved' },
  { value: 'Straight' as const, label: 'Straight', shortLabel: 'Straight' },
  { value: 'Orthogonal' as const, label: 'Orthogonal', shortLabel: 'Orthogonal' },
]

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

// ─── Element Properties ──────────────────────────────────────────────

function ElementProperties({ element, onClose }: { element: ModelElement; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<PanelTab>('properties')
  const updateElement = useWorkspaceStore((s) => s.updateElement)
  const updateElementLive = useWorkspaceStore((s) => s.updateElementLive)
  const updateTech = useWorkspaceStore((s) => s.updateElementTechnology)
  const deleteElement = useWorkspaceStore((s) => s.deleteElement)
  const removeElementsFromView = useWorkspaceStore((s) => s.removeElementsFromView)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const isFocal = useMemo(
    () => workspace && activeViewKey ? isFocalScopeElement(workspace, activeViewKey, element.id) : false,
    [workspace, activeViewKey, element.id],
  )
  const tech = (element as Container | Component).technology
  const hasTech = element.type === 'container' || element.type === 'component'
  const hasLocation = element.type === 'person' || element.type === 'softwareSystem'
  const location = (element as Person | SoftwareSystem).location
  const typeColor = TYPE_COLORS[element.type] ?? 'var(--color-accent)'
  const safeUrl = element.url ? normalizeSafeExternalUrl(element.url) : null

  // Find which views contain this element
  const appearsInViews = workspace ? getAllViews(workspace).filter(v =>
    v.elements.some(e => e.id === element.id)
  ) : []
  const appearsInActiveView = activeViewKey
    ? appearsInViews.some(v => v.key === activeViewKey)
    : false

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="text-sm font-semibold">{element.name}</div>
          <div className="text-[11px]" style={{ color: typeColor }}>{getElementTypeLabel(element)}</div>
        </div>
        <div className="flex items-center gap-1">
          {/* Remove from view — touch-friendly parity with Backspace; hidden on the
             focal-scope element (can't unproject the element a view is defined by)
             and when the element isn't actually in the active view. */}
          {!isFocal && activeViewKey && appearsInActiveView && (
            <button
              onClick={() => {
                if (!activeViewKey) return
                removeElementsFromView(activeViewKey, [element.id])
              }}
              className="btn-icon !min-h-7 !min-w-7 !p-1"
              aria-label="Remove from view"
              title="Remove from this view (model unchanged)"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <EyeOff size={14} />
            </button>
          )}
          {isFocal ? (
            <button
              disabled
              aria-label="Delete from model (disabled — focal scope)"
              title="This element scopes the current view. Open the parent view to delete it."
              className="btn-icon !min-h-7 !min-w-7 !p-1"
              style={{ color: 'var(--color-text-muted)', opacity: 0.5, cursor: 'not-allowed' }}
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <button
              onClick={() => {
                if (!workspace) return
                const impact = computeCascadeImpact(workspace, [element.id])
                confirmDelete({ message: formatImpactSummary(impact), impact }, () => deleteElement(element.id))
              }}
              className="btn-icon !min-h-7 !min-w-7 !p-1"
              aria-label="Delete from model"
              title="Delete from model"
              style={{ color: 'var(--color-error-text)' }}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close panel"><X size={14} /></button>
        </div>
      </div>

      {/* Focal-scope hint banner */}
      {isFocal && (
        <div
          className="px-4 py-2 text-[11px]"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-muted)',
            borderBottom: '1px solid var(--color-border)',
            lineHeight: 1.4,
          }}
        >
          Scopes the current view — open the parent view to delete this element.
        </div>
      )}

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
                <FieldLabel>Location</FieldLabel>
                <div className="flex gap-1" data-testid="location" role="radiogroup" aria-label="Location">
                  {(['Internal', 'External', 'Unspecified'] as const).map((opt) => {
                    const current = location ?? 'Internal'
                    const active = current === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => updateElement(element.id, { location: opt as Location })}
                        className="rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors"
                        style={{
                          flex: 1,
                          background: active ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                          borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                          color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {hasTech && (
              <div>
                <FieldLabel>Technology</FieldLabel>
                <TechnologyField value={tech ?? ''} scope="element" placeholder="e.g. React, PostgreSQL..." aria-label="Technology" onLiveChange={(v) => updateElementLive(element.id, { technology: v })} onCommit={(v) => updateTech(element.id, v)} />
              </div>
            )}
            <div>
              <FieldLabel>Description</FieldLabel>
              <EditableField value={element.description ?? ''} placeholder="Describe this element..." aria-label="Description" onLiveChange={(v) => updateElementLive(element.id, { description: v || undefined })} onCommit={(v) => updateElement(element.id, { description: v || undefined })} multiline />
            </div>

            {/* Status */}
            <div>
              <FieldLabel>Status</FieldLabel>
              <div className="flex flex-wrap gap-1" data-testid="element-status">
                {STATUS_OPTIONS.map((opt) => {
                  const active = (element.status ?? undefined) === opt.value
                  return (
                    <button
                      key={opt.label}
                      onClick={() => updateElement(element.id, { status: opt.value })}
                      aria-pressed={active}
                      aria-label={`Status: ${opt.label}`}
                      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
                      style={{
                        background: active ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                        borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: opt.color ?? 'transparent',
                          border: opt.color ? '1px solid rgba(255,255,255,0.2)' : '1px dashed var(--color-border)',
                          flexShrink: 0,
                        }}
                      />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Owner */}
            <div>
              <FieldLabel>Owner</FieldLabel>
              <OwnerField value={element.owner ?? ''} placeholder="e.g. Team Alpha" aria-label="Owner" onLiveChange={(v) => updateElementLive(element.id, { owner: v || undefined })} onCommit={(v) => updateElement(element.id, { owner: v || undefined })} />
            </div>

            {/* URL */}
            <div>
              <FieldLabel>URL</FieldLabel>
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <EditableField
                    value={element.url ?? ''}
                    placeholder="https://..."
                    aria-label="URL"
                    aria-invalid={!!element.url && !safeUrl}
                    aria-describedby={element.url && !safeUrl ? `url-error-${element.id}` : undefined}
                    onLiveChange={(v) => updateElementLive(element.id, { url: v || undefined })}
                    onCommit={(v) => updateElement(element.id, { url: v || undefined })}
                  />
                </div>
                {safeUrl && (
                  <a
                    href={safeUrl}
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
              {element.url && !safeUrl && (
                <div
                  id={`url-error-${element.id}`}
                  role="alert"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error-text)', marginTop: 4 }}
                >
                  URL must start with http:// or https://
                </div>
              )}
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
  const panelId = 'appears-in-views-panel'
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
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
        <div id={panelId} className="space-y-0.5">
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
  const deleteRelationship = useWorkspaceStore((s) => s.deleteRelationship)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])
  const source = elementMap.get(relationship.sourceId)
  const dest = elementMap.get(relationship.destinationId)
  const safeUrl = relationship.url ? normalizeSafeExternalUrl(relationship.url) : null

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
        <div className="flex items-center gap-1">
          <button
            onClick={() => confirmDelete('Delete this relationship?', () => deleteRelationship(relationship.id))}
            className="btn-icon !min-h-7 !min-w-7 !p-1"
            aria-label="Delete relationship"
            title="Delete relationship"
            style={{ color: 'var(--color-error-text)' }}
          >
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close panel"><X size={14} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <FieldLabel>Description</FieldLabel>
          <EditableField value={relationship.description ?? ''} placeholder="e.g. Makes API calls to..." aria-label="Description" onCommit={(v) => updateRelationship(relationship.id, { description: v || undefined })} />
        </div>
        <div>
          <FieldLabel>Technology</FieldLabel>
          <TechnologyField value={relationship.technology ?? ''} scope="relationship" placeholder="e.g. REST/HTTP, gRPC..." aria-label="Technology" onCommit={(v) => updateRelationship(relationship.id, { technology: v || undefined })} />
        </div>
        <div>
          <FieldLabel>Interaction Style</FieldLabel>
          <div className="flex gap-1" data-testid="interaction-style">
            {INTERACTION_STYLE_OPTIONS.map((option) => {
              const active = relationship.interactionStyle === option.value
              return (
                <button
                  key={option.label}
                  onClick={() => updateRelationship(relationship.id, { interactionStyle: option.value })}
                  title={option.label}
                  aria-label={`Interaction style: ${option.label}`}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-[9px] font-medium transition-colors"
                  style={{
                    flex: 1,
                    background: active ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                    borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="28" height="12" viewBox="0 0 36 16" fill="none">
                    {option.value === undefined && (
                      <>
                        <line x1="2" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
                        <circle cx="18" cy="8" r="2" fill="currentColor" opacity="0.7" />
                      </>
                    )}
                    {option.value === 'Synchronous' && (
                      <>
                        <line x1="2" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" />
                        <polyline points="28,3 34,8 28,13" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </>
                    )}
                    {option.value === 'Asynchronous' && (
                      <>
                        <line x1="2" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <polyline points="28,3 34,8 28,13" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </>
                    )}
                  </svg>
                  {option.shortLabel}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <FieldLabel>Line Style</FieldLabel>
          <div className="flex gap-1" data-testid="line-style">
            {LINE_STYLE_OPTIONS.map((option) => {
              const active = relationship.lineStyle === option.value
              return (
                <button
                  key={option.label}
                  onClick={() => updateRelationship(relationship.id, { lineStyle: option.value })}
                  title={option.label}
                  aria-label={`Line style: ${option.label}`}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-[9px] font-medium transition-colors"
                  style={{
                    flex: 1,
                    background: active ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                    borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="28" height="12" viewBox="0 0 36 16" fill="none">
                    {option.value === undefined && (
                      <>
                        <line x1="2" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
                        <circle cx="18" cy="8" r="2" fill="currentColor" opacity="0.7" />
                      </>
                    )}
                    {option.value === 'Curved' && (
                      <path d="M2 14 C12 14, 12 2, 18 2 S24 14, 34 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    )}
                    {option.value === 'Straight' && (
                      <line x1="2" y1="14" x2="34" y2="2" stroke="currentColor" strokeWidth="1.5" />
                    )}
                    {option.value === 'Orthogonal' && (
                      <polyline points="2,14 2,2 34,2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    )}
                  </svg>
                  {option.shortLabel}
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
            {safeUrl && (
              <a
                href={safeUrl}
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
                    aria-label={`Remove tag ${tag}`}
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
