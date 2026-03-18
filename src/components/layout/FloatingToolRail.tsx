import { useState } from 'react'
import CanvasSettingsDialog from '@/components/settings/CanvasSettingsDialog'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, getCreatableTypes, getActiveView, buildElementMap } from '@/store/workspace'
import type { LayoutDirection, ModelElement } from '@/types/model'
import {
  UserRound,
  Globe,
  Box,
  Puzzle,
  LayoutDashboard,
  Plus,
  Search,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  Database,
  Zap,
  GitMerge,
  Smartphone,
  HardDrive,
  Monitor,
  Maximize2,
  Layers,
  Trash2,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  Settings,
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

const DIRECTION_ICONS: Record<LayoutDirection, React.ReactNode> = {
  TB: <ArrowDown size={14} />,
  BT: <ArrowUp size={14} />,
  LR: <ArrowRight size={14} />,
  RL: <ArrowLeft size={14} />,
}

const DIRECTION_LABELS: Record<LayoutDirection, string> = {
  TB: 'Top to bottom',
  BT: 'Bottom to top',
  LR: 'Left to right',
  RL: 'Right to left',
}

export default function FloatingToolRail() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setLayoutDirection = useWorkspaceStore((s) => s.setLayoutDirection)
  const selectedElementIds = useWorkspaceStore((s) => s.selectedElementIds)
  const addGroup = useWorkspaceStore((s) => s.addGroup)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const deleteElement = useWorkspaceStore((s) => s.deleteElement)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const reactFlow = useReactFlow()
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [arrangePanelOpen, setArrangePanelOpen] = useState(false)
  const [alignPanelOpen, setAlignPanelOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  if (!workspace) return null

  const view = activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const currentDirection = view?.autoLayout?.direction ?? 'TB'

  function handleAlign(mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
    if (selectedElementIds.length < 2) return
    const rfNodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id))
    if (rfNodes.length < 2) return

    switch (mode) {
      case 'left': {
        const minX = Math.min(...rfNodes.map(n => n.position.x))
        for (const n of rfNodes) updateNodePosition(n.id, minX, n.position.y)
        break
      }
      case 'center-x': {
        const avgX = rfNodes.reduce((sum, n) => sum + n.position.x + (n.measured?.width ?? 200) / 2, 0) / rfNodes.length
        for (const n of rfNodes) updateNodePosition(n.id, avgX - (n.measured?.width ?? 200) / 2, n.position.y)
        break
      }
      case 'right': {
        const maxRight = Math.max(...rfNodes.map(n => n.position.x + (n.measured?.width ?? 200)))
        for (const n of rfNodes) updateNodePosition(n.id, maxRight - (n.measured?.width ?? 200), n.position.y)
        break
      }
      case 'top': {
        const minY = Math.min(...rfNodes.map(n => n.position.y))
        for (const n of rfNodes) updateNodePosition(n.id, n.position.x, minY)
        break
      }
      case 'center-y': {
        const avgY = rfNodes.reduce((sum, n) => sum + n.position.y + (n.measured?.height ?? 100) / 2, 0) / rfNodes.length
        for (const n of rfNodes) updateNodePosition(n.id, n.position.x, avgY - (n.measured?.height ?? 100) / 2)
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...rfNodes.map(n => n.position.y + (n.measured?.height ?? 100)))
        for (const n of rfNodes) updateNodePosition(n.id, n.position.x, maxBottom - (n.measured?.height ?? 100))
        break
      }
    }
  }

  function handleAutoArrange(direction?: LayoutDirection) {
    const store = useWorkspaceStore.getState()
    if (!store.workspace || !store.activeViewKey) return
    const ws = structuredClone(store.workspace)
    const allViews = [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ]
    const v = allViews.find((v) => v.key === store.activeViewKey)
    if (v) {
      for (const el of v.elements) {
        el.x = undefined
        el.y = undefined
        el.pinned = undefined
      }
      useWorkspaceStore.setState({ workspace: ws })
    }
    if (direction && activeViewKey) {
      setLayoutDirection(activeViewKey, direction)
    }
    setArrangePanelOpen(false)
  }

  return (
    <>
    <div
      className="glass-panel"
      role="toolbar"
      aria-label="Canvas tools"
      style={{
        position: 'fixed',
        left: 14,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        borderRadius: 'var(--radius-xl)',
      }}
    >
      {/* Add element */}
      <div style={{ position: 'relative' }}>
        <RailBtn
          icon={<Plus size={16} />}
          label="Add element"
          active={addPanelOpen}
          expanded={addPanelOpen}
          onClick={() => { setAddPanelOpen((o) => !o); setArrangePanelOpen(false) }}
        />
        {addPanelOpen && <AddElementPanel onClose={() => setAddPanelOpen(false)} />}
      </div>

      {/* Auto-arrange */}
      <RailSep />
      <div style={{ position: 'relative' }}>
        <RailBtn
          icon={<LayoutDashboard size={16} />}
          label="Auto-arrange"
          active={arrangePanelOpen}
          expanded={arrangePanelOpen}
          onClick={() => { setArrangePanelOpen((o) => !o); setAddPanelOpen(false) }}
        />
        {arrangePanelOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 49 }}
              onClick={() => setArrangePanelOpen(false)}
            />
            <div
              className="glass-flyout"
              style={{
                position: 'absolute',
                left: 56,
                top: 0,
                zIndex: 50,
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                minWidth: 160,
              }}
            >
              <div className="flyout-label">
                Auto-arrange
              </div>
              {(['TB', 'LR', 'BT', 'RL'] as LayoutDirection[]).map((dir) => (
                <button
                  key={dir}
                  className="flyout-item"
                  data-active={currentDirection === dir}
                  onClick={() => handleAutoArrange(dir)}
                >
                  <span style={{ color: currentDirection === dir ? 'var(--color-accent)' : 'var(--color-text-muted)', display: 'flex' }}>
                    {DIRECTION_ICONS[dir]}
                  </span>
                  {DIRECTION_LABELS[dir]}
                  {currentDirection === dir && (
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-accent)' }}>
                      current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Multi-select actions */}
      {selectedElementIds.length >= 2 && (
        <>
          <RailSep />

          {/* Align */}
          <div style={{ position: 'relative' }}>
            <RailBtn
              icon={<AlignCenterVertical size={16} />}
              label="Align"
              active={alignPanelOpen}
              expanded={alignPanelOpen}
              onClick={() => { setAlignPanelOpen((o) => !o); setAddPanelOpen(false); setArrangePanelOpen(false) }}
            />
            {alignPanelOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  onClick={() => setAlignPanelOpen(false)}
                />
                <div
                  className="glass-flyout"
                  style={{
                    position: 'absolute',
                    left: 56,
                    top: 0,
                    zIndex: 50,
                    padding: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    minWidth: 170,
                  }}
                >
                  <div className="flyout-label">
                    Align {selectedElementIds.length} elements
                  </div>
                  <AlignMenuItem icon={<AlignStartVertical size={14} />} label="Align left" onClick={() => { handleAlign('left'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignCenterVertical size={14} />} label="Align center (X)" onClick={() => { handleAlign('center-x'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignEndVertical size={14} />} label="Align right" onClick={() => { handleAlign('right'); setAlignPanelOpen(false) }} />
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '2px 6px' }} />
                  <AlignMenuItem icon={<AlignStartHorizontal size={14} />} label="Align top" onClick={() => { handleAlign('top'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignCenterHorizontal size={14} />} label="Align middle (Y)" onClick={() => { handleAlign('center-y'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignEndHorizontal size={14} />} label="Align bottom" onClick={() => { handleAlign('bottom'); setAlignPanelOpen(false) }} />
                </div>
              </>
            )}
          </div>

          {/* Group */}
          <RailBtn
            icon={<Layers size={16} />}
            label={`Group ${selectedElementIds.length} elements`}
            onClick={() => {
              const id = addGroup('New Group', selectedElementIds)
              selectGroup(id)
            }}
          />

          {/* Delete */}
          <RailBtn
            icon={<Trash2 size={16} />}
            label={`Delete ${selectedElementIds.length} elements`}
            color="var(--color-error)"
            onClick={() => {
              for (const id of selectedElementIds) deleteElement(id)
            }}
          />
        </>
      )}

      {/* Zoom to fit */}
      <RailSep />
      <RailBtn
        icon={<Maximize2 size={16} />}
        label="Zoom to fit"
        onClick={() => reactFlow.fitView({ duration: 300, padding: 0.2 })}
      />
      <RailSep />
      <RailBtn
        icon={<Settings size={16} />}
        label="Canvas settings"
        onClick={() => setShowSettings(true)}
      />
    </div>
    {showSettings && <CanvasSettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  )
}

// ─── Add Element Panel ────────────────────────────────────────────────

function AddElementPanel({ onClose }: { onClose: () => void }) {
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

  const CONTAINER_SUBTYPES = [
    { key: 'web-app',  label: 'Web App',  tag: 'Web Application', icon: <Monitor size={13} /> },
    { key: 'api',      label: 'API',       tag: 'Service',         icon: <Zap size={13} /> },
    { key: 'database', label: 'Database',  tag: 'Database',        icon: <Database size={13} /> },
    { key: 'queue',    label: 'Queue',     tag: 'Queue',           icon: <GitMerge size={13} /> },
    { key: 'mobile',   label: 'Mobile',   tag: 'Mobile App',      icon: <Smartphone size={13} /> },
    { key: 'files',    label: 'Files',     tag: 'File System',     icon: <HardDrive size={13} /> },
  ]

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
        style={{
          position: 'absolute',
          left: 56,
          top: 0,
          zIndex: 50,
          width: 280,
          maxHeight: 420,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(13,17,23,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* Create new section */}
        <div style={{ padding: '10px 12px 8px' }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-text-muted)',
              marginBottom: 8,
            }}
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
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-text-muted)',
                  marginBottom: 5,
                }}
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
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-text-muted)',
              marginBottom: 6,
            }}
          >
            Add existing to view
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 7,
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
                fontSize: 12,
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
                  style={{
                    padding: '4px 8px 2px',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
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

// ─── Align menu item ──────────────────────────────────────────────────

function AlignMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flyout-item" onClick={onClick}>
      <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}

// ─── Rail primitives ──────────────────────────────────────────────────

function RailSep() {
  return (
    <div
      style={{
        width: 28,
        height: 1,
        background: 'var(--color-border)',
        margin: '4px 8px',
      }}
    />
  )
}

function RailBtn({
  icon,
  label,
  color,
  active,
  expanded,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  color?: string
  active?: boolean
  expanded?: boolean
  onClick?: () => void
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={expanded !== undefined ? 'true' : undefined}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        margin: '1px 4px',
        background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
        color: active ? 'var(--color-accent)' : color ?? 'var(--color-text-muted)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.12s, color 0.12s',
        border: 'none',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = color ?? 'var(--color-text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = color ?? 'var(--color-text-muted)'
        }
      }}
    >
      {icon}
    </button>
  )
}
