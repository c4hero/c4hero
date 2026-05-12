import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useWorkspaceStore, getCreatableTypes, getActiveView, getFocalScopeId, buildElementMap } from '@/store/workspace'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import type { ModelElement } from '@/types/model'
import { scopeAllowsContainers } from '@/lib/scopeValidation'
import { TYPE_ICONS, TYPE_COLORS, TYPE_LABELS } from '@/lib/elementMeta'
import {
  UserRound,
  Globe,
  Box,
  Puzzle,
  Plus,
  Search,
  Database,
  Zap,
  GitMerge,
  Smartphone,
  HardDrive,
  Monitor,
  ChevronDown,
} from 'lucide-react'

const CONTAINER_SUBTYPES = [
  { key: 'web-app',  label: 'Web App',  tag: 'Web Application', icon: <Monitor size={13} /> },
  { key: 'api',      label: 'API',       tag: 'Service',         icon: <Zap size={13} /> },
  { key: 'database', label: 'Database',  tag: 'Database',        icon: <Database size={13} /> },
  { key: 'queue',    label: 'Queue',     tag: 'Queue',           icon: <GitMerge size={13} /> },
  { key: 'mobile',   label: 'Mobile',   tag: 'Mobile App',      icon: <Smartphone size={13} /> },
  { key: 'files',    label: 'Files',     tag: 'File System',     icon: <HardDrive size={13} /> },
]

export default function AddElementPanel({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const toggleElementInView = useWorkspaceStore((s) => s.toggleElementInView)
  const [search, setSearch] = useState('')
  const [createExpanded, setCreateExpanded] = useState(true)
  const isMobile = useBreakpoint() === 'mobile'
  const panelRef = useRef<HTMLDivElement>(null)

  // ArrowUp/ArrowDown cycle through every focusable control in the panel
  // (search input + chips + element-list buttons). Tab/Shift+Tab still work
  // natively; ArrowLeft/Right and Home/End are left alone so they keep doing
  // text-cursor moves inside the search input.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const items = Array.from(
        panel!.querySelectorAll<HTMLElement>('button:not([disabled]), input[type="text"]'),
      )
      if (items.length === 0) return
      const idx = items.indexOf(document.activeElement as HTMLElement)
      let next: number
      if (e.key === 'ArrowDown') next = idx === -1 ? 0 : (idx + 1) % items.length
      else next = idx <= 0 ? items.length - 1 : idx - 1
      e.preventDefault()
      items[next]?.focus()
    }
    panel.addEventListener('keydown', handleKeyDown)
    return () => panel.removeEventListener('keydown', handleKeyDown)
  }, [])

  // On mobile, clear selection after adding so the inspector doesn't auto-open
  const afterAdd = useCallback(() => {
    if (isMobile) useWorkspaceStore.getState().clearSelection()
    onClose()
  }, [isMobile, onClose])

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  // Count how many model relationships each out-of-view element has to in-view elements.
  // Elements with a count > 0 will auto-wire those connections on add.
  const connectionCountMap = useMemo(() => {
    const counts = new Map<string, number>()
    if (!workspace || !activeViewKey) return counts
    const v = getActiveView(workspace, activeViewKey)
    if (!v) return counts
    const viewIds = new Set(v.elements.map(e => e.id))
    for (const rel of workspace.model.relationships) {
      const srcIn = viewIds.has(rel.sourceId)
      const dstIn = viewIds.has(rel.destinationId)
      if (srcIn && !dstIn) counts.set(rel.destinationId, (counts.get(rel.destinationId) ?? 0) + 1)
      if (dstIn && !srcIn) counts.set(rel.sourceId, (counts.get(rel.sourceId) ?? 0) + 1)
    }
    return counts
  }, [workspace, activeViewKey])

  if (!workspace || !activeViewKey) return null

  const creatableTypes = getCreatableTypes(workspace, activeViewKey)
  const containersAllowed = scopeAllowsContainers(workspace.scope)
  const view = getActiveView(workspace, activeViewKey)
  const viewElementIds = new Set(view?.elements.map((e) => e.id) ?? [])

  // Determine which element types are allowed in this view
  const allowedTypes = new Set<string>()
  if (creatableTypes.canCreatePerson) allowedTypes.add('person')
  if (creatableTypes.canCreateSystem) allowedTypes.add('softwareSystem')
  if (creatableTypes.canCreateContainer !== null) allowedTypes.add('container')
  if (creatableTypes.canCreateComponent !== null) allowedTypes.add('component')

  // A scoped view's focal element decomposes *into* the view; it must never
  // appear as a sibling. Adding it would let the user delete the system from
  // its own L2 view, which cascades through every container, component,
  // relationship, and scoped view underneath it.
  const focalScopeId = getFocalScopeId(view)

  // Filter existing elements: must be an allowed type AND not already in view AND not the focal scope.
  // Sort alphabetically so the list is predictable regardless of creation order.
  const allElements = Array.from(elementMap.values())
  const notInView = allElements
    .filter((el) => allowedTypes.has(el.type) && !viewElementIds.has(el.id) && el.id !== focalScopeId)
    .sort((a, b) => a.name.localeCompare(b.name))

  const query = search.toLowerCase().trim()
  const filtered = query
    ? notInView.filter(
        (el) =>
          el.name.toLowerCase().includes(query) ||
          el.type.toLowerCase().includes(query),
      )
    : notInView

  // Group by type
  const grouped = filtered.reduce<Record<string, ModelElement[]>>((acc, el) => {
    if (!acc[el.type]) acc[el.type] = []
    acc[el.type].push(el)
    return acc
  }, {})

  // New element cards
  const createCards = [
    creatableTypes.canCreatePerson && {
      key: 'person',
      icon: <UserRound size={20} />,
      label: 'Person',
      color: 'var(--color-type-person)',
      onClick: () => { useWorkspaceStore.getState().addPerson('New Person'); afterAdd() },
    },
    creatableTypes.canCreatePerson && {
      key: 'ext-person',
      icon: <UserRound size={20} />,
      label: 'External Person',
      color: 'var(--color-type-external)',
      dashed: true,
      onClick: () => { useWorkspaceStore.getState().addPerson('New External Person', undefined, 'External'); afterAdd() },
    },
    creatableTypes.canCreateSystem && {
      key: 'system',
      icon: <Globe size={20} />,
      label: 'System',
      color: 'var(--color-type-system)',
      onClick: () => { useWorkspaceStore.getState().addSoftwareSystem('New System'); afterAdd() },
    },
    creatableTypes.canCreateSystem && {
      key: 'ext-system',
      icon: <Globe size={20} />,
      label: 'External System',
      color: 'var(--color-type-external)',
      dashed: true,
      onClick: () => { useWorkspaceStore.getState().addSoftwareSystem('New External System', undefined, 'External'); afterAdd() },
    },
    creatableTypes.canCreateContainer !== null && {
      key: 'container',
      icon: <Box size={20} />,
      label: 'Container',
      color: 'var(--color-type-container)',
      disabled: !containersAllowed,
      disabledTitle: 'Not available in landscape-scoped workspaces',
      onClick: () => {
        if (!containersAllowed) return
        useWorkspaceStore.getState().addContainer(creatableTypes.canCreateContainer!, 'New Container')
        afterAdd()
      },
    },
    creatableTypes.canCreateComponent !== null && {
      key: 'component',
      icon: <Puzzle size={20} />,
      label: 'Component',
      color: 'var(--color-type-component)',
      disabled: !containersAllowed,
      disabledTitle: 'Not available in landscape-scoped workspaces',
      onClick: () => {
        if (!containersAllowed) return
        useWorkspaceStore.getState().addComponent(creatableTypes.canCreateComponent!, 'New Component')
        afterAdd()
      },
    },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string; color: string; dashed?: boolean; disabled?: boolean; disabledTitle?: string; onClick: () => void }[]

  return (
    <div
      ref={panelRef}
      className="glass-flyout"
      data-flyout="add-element"
      style={{
        position: 'absolute',
        left: 56,
        top: 0,
        zIndex: 50,
        width: 280,
        maxHeight: 420,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
        {/* Create new section (collapsible) */}
        <div style={{ padding: '10px 12px 8px' }}>
          <button
            onClick={() => setCreateExpanded((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              width: '100%',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              marginBottom: createExpanded ? 8 : 0,
            }}
          >
            <ChevronDown
              size={12}
              style={{
                color: 'var(--color-text-muted)',
                transition: 'transform 0.15s ease',
                transform: createExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
            <span className="flyout-label" style={{ margin: 0 }}>Create new</span>
          </button>
          {createExpanded && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {createCards.map((card) => (
                  <CreateChip
                    key={card.key}
                    icon={card.icon}
                    label={card.label}
                    color={card.color}
                    dashed={card.dashed}
                    disabled={card.disabled}
                    disabledTitle={card.disabledTitle}
                    onClick={card.onClick}
                  />
                ))}
              </div>
              {creatableTypes.canCreateContainer !== null && containersAllowed && (
                <div style={{ marginTop: 8 }}>
                  <div
                    className="flyout-label"
                    style={{ marginBottom: 5 }}
                  >
                    Common containers
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {CONTAINER_SUBTYPES.map((sub) => (
                      <SubtypeChip
                        key={sub.key}
                        icon={sub.icon}
                        label={sub.label}
                        onClick={() => {
                          useWorkspaceStore.getState().addContainer(
                            creatableTypes.canCreateContainer!,
                            `New ${sub.label}`,
                            undefined,
                            sub.tag,
                          )
                          afterAdd()
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 12px' }} />

        {/* Add existing section */}
        <div style={{ padding: '8px 12px 6px' }}>
          <div
            className="flyout-label"
            style={{ marginBottom: 6 }}
          >
            Add existing to view
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              marginBottom: 4,
            }}
          >
            <Search size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                const val = e.target.value
                setSearch(val)
                if (val.trim()) setCreateExpanded(false)
                else setCreateExpanded(true)
              }}
              placeholder="Filter elements..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
              autoFocus
            />
          </div>
        </div>

        {/* Element list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 8px' }}>
          {notInView.length === 0 ? (
            <div style={{ padding: '12px 6px', fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              All elements are already in this view
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '12px 6px', fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              No matching elements
            </div>
          ) : (
            Object.entries(grouped).map(([type, elements]) => (
              <div key={type}>
                <div
                  className="flyout-label"
                  style={{
                    padding: '4px 8px 2px',
                    color: TYPE_COLORS[type] ?? 'var(--color-text-muted)',
                  }}
                >
                  {TYPE_LABELS[type] ?? type}
                </div>
                {elements.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => {
                      toggleElementInView(activeViewKey, el.id)
                      // Don't close — user may want to add multiple
                    }}
                    className="flyout-item"
                    style={{ padding: '5px 8px' }}
                    title={connectionCountMap.has(el.id)
                      ? `Auto-wires ${connectionCountMap.get(el.id)} connection${connectionCountMap.get(el.id) !== 1 ? 's' : ''} to existing view elements`
                      : el.name}
                  >
                    <span style={{ color: TYPE_COLORS[el.type], display: 'flex', flexShrink: 0 }}>
                      {TYPE_ICONS[el.type]}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {el.name}
                    </span>
                    {(connectionCountMap.get(el.id) ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: 'var(--text-xxs)',
                          fontWeight: 700,
                          color: 'var(--color-accent)',
                          background: 'var(--color-accent-glow)',
                          borderRadius: 99,
                          padding: '1px 5px',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ↔{connectionCountMap.get(el.id)}
                      </span>
                    )}
                    <Plus size={12} style={{ flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.6 }} />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
    </div>
  )
}

function SubtypeChip({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="hover-chip"
      style={{
        '--hover-border-color': 'var(--color-type-container)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        color: 'var(--color-text-muted)',
      } as React.CSSProperties}
    >
      <span style={{ color: 'var(--color-type-container)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}

function CreateChip({
  icon,
  label,
  color,
  dashed,
  disabled,
  disabledTitle,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  color: string
  dashed?: boolean
  disabled?: boolean
  disabledTitle?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      className="hover-chip"
      style={{
        '--hover-border-color': color,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        border: dashed ? '1px dashed var(--color-border)' : '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
        fontSize: 'var(--text-xs-plus)',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        opacity: disabled ? 0.4 : 1,
      } as React.CSSProperties}
    >
      <span style={{ color, display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}
