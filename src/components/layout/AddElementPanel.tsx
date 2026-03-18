import { useState } from 'react'
import { useWorkspaceStore, getCreatableTypes, getActiveView, buildElementMap } from '@/store/workspace'
import type { ModelElement } from '@/types/model'
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
} from 'lucide-react'

const TYPE_ICONS: Record<string, React.ReactNode> = {
  person: <UserRound size={14} />,
  softwareSystem: <Globe size={14} />,
  container: <Box size={14} />,
  component: <Puzzle size={14} />,
}

const TYPE_COLORS: Record<string, string> = {
  person: 'var(--color-type-person)',
  softwareSystem: 'var(--color-type-system)',
  container: 'var(--color-type-container)',
  component: 'var(--color-type-component)',
}

const TYPE_LABELS: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}

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

  if (!workspace || !activeViewKey) return null

  const creatableTypes = getCreatableTypes(workspace, activeViewKey)
  const view = getActiveView(workspace, activeViewKey)
  const viewElementIds = new Set(view?.elements.map((e) => e.id) ?? [])

  // Determine which element types are allowed in this view
  const allowedTypes = new Set<string>()
  if (creatableTypes.canCreatePerson) allowedTypes.add('person')
  if (creatableTypes.canCreateSystem) allowedTypes.add('softwareSystem')
  if (creatableTypes.canCreateContainer !== null) allowedTypes.add('container')
  if (creatableTypes.canCreateComponent !== null) allowedTypes.add('component')

  // Filter existing elements: must be an allowed type AND not already in view
  const elementMap = buildElementMap(workspace)
  const allElements = Array.from(elementMap.values())
  const notInView = allElements.filter(
    (el) => allowedTypes.has(el.type) && !viewElementIds.has(el.id),
  )

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
      onClick: () => { useWorkspaceStore.getState().addPerson('New Person'); onClose() },
    },
    creatableTypes.canCreatePerson && {
      key: 'ext-person',
      icon: <UserRound size={20} />,
      label: 'External Person',
      color: 'var(--color-type-external)',
      dashed: true,
      onClick: () => { useWorkspaceStore.getState().addPerson('New External Person', undefined, 'External'); onClose() },
    },
    creatableTypes.canCreateSystem && {
      key: 'system',
      icon: <Globe size={20} />,
      label: 'System',
      color: 'var(--color-type-system)',
      onClick: () => { useWorkspaceStore.getState().addSoftwareSystem('New System'); onClose() },
    },
    creatableTypes.canCreateSystem && {
      key: 'ext-system',
      icon: <Globe size={20} />,
      label: 'External System',
      color: 'var(--color-type-external)',
      dashed: true,
      onClick: () => { useWorkspaceStore.getState().addSoftwareSystem('New External System', undefined, 'External'); onClose() },
    },
    creatableTypes.canCreateContainer !== null && {
      key: 'container',
      icon: <Box size={20} />,
      label: 'Container',
      color: 'var(--color-type-container)',
      onClick: () => {
        useWorkspaceStore.getState().addContainer(creatableTypes.canCreateContainer!, 'New Container')
        onClose()
      },
    },
    creatableTypes.canCreateComponent !== null && {
      key: 'component',
      icon: <Puzzle size={20} />,
      label: 'Component',
      color: 'var(--color-type-component)',
      onClick: () => {
        useWorkspaceStore.getState().addComponent(creatableTypes.canCreateComponent!, 'New Component')
        onClose()
      },
    },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string; color: string; dashed?: boolean; onClick: () => void }[]

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div
        className="glass-flyout"
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
        {/* Create new section */}
        <div style={{ padding: '10px 12px 8px' }}>
          <div
            className="flyout-label"
            style={{ marginBottom: 8 }}
          >
            Create new
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {createCards.map((card) => (
              <CreateChip
                key={card.key}
                icon={card.icon}
                label={card.label}
                color={card.color}
                dashed={card.dashed}
                onClick={card.onClick}
              />
            ))}
          </div>
          {creatableTypes.canCreateContainer !== null && (
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
                      onClose()
                    }}
                  />
                ))}
              </div>
            </div>
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
              onChange={(e) => setSearch(e.target.value)}
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
            <div style={{ padding: '12px 6px', fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center' }}>
              All elements are already in this view
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '12px 6px', fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center' }}>
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                      background: 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ color: TYPE_COLORS[el.type], display: 'flex', flexShrink: 0 }}>
                      {TYPE_ICONS[el.type]}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {el.name}
                    </span>
                    <Plus size={12} style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 6,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
        fontSize: 10,
        fontWeight: 500,
        color: 'var(--color-text-muted)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-3)'
        e.currentTarget.style.borderColor = 'var(--color-type-container)'
        e.currentTarget.style.color = 'var(--color-text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-2)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.color = 'var(--color-text-muted)'
      }}
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
  onClick,
}: {
  icon: React.ReactNode
  label: string
  color: string
  dashed?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 8,
        border: dashed ? '1px dashed var(--color-border)' : '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-3)'
        e.currentTarget.style.borderColor = color
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-2)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      <span style={{ color, display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}
