import { useState } from 'react'
import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import type { View } from '@/types/model'
import { LayoutGrid, GitBranch, Search, ChevronRight, ChevronDown, Plus } from 'lucide-react'
import CreateViewDialog from '@/components/views/CreateViewDialog'

type Tab = 'views' | 'model' | 'search'

const VIEW_TYPE_LABELS: Record<string, string> = {
  systemLandscape: 'System Landscape',
  systemContext: 'System Context',
  container: 'Container',
  component: 'Component',
}

export default function LeftPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const [activeTab, setActiveTab] = useState<Tab>('views')
  const [showCreateView, setShowCreateView] = useState(false)

  if (!workspace) return null

  const views = getAllViews(workspace)

  const viewsByType = views.reduce<Record<string, View[]>>((acc, view) => {
    const type = view.type
    if (!acc[type]) acc[type] = []
    acc[type].push(view)
    return acc
  }, {})

  return (
    <div className="glass-panel-solid flex h-full w-64 shrink-0 flex-col border-r sm:w-60">
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
        {([
          { id: 'views' as Tab, icon: LayoutGrid, label: 'Views' },
          { id: 'model' as Tab, icon: GitBranch, label: 'Model' },
          { id: 'search' as Tab, icon: Search, label: 'Search' },
        ]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all duration-200"
            style={{
              color: activeTab === id ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderBottom: activeTab === id
                ? '2px solid var(--color-accent)'
                : '2px solid transparent',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {activeTab === 'views' && (
          <>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Views
              </span>
              <button
                onClick={() => setShowCreateView(true)}
                className="btn-icon !min-h-5 !min-w-5 !p-0.5"
                title="Create view"
              >
                <Plus size={12} />
              </button>
            </div>
            <ViewsList
              viewsByType={viewsByType}
              activeViewKey={activeViewKey}
              onSelect={setActiveView}
            />
          </>
        )}
        {activeTab === 'model' && <ModelTree />}
        {activeTab === 'search' && <SearchPanel />}
      </div>
      {showCreateView && <CreateViewDialog onClose={() => setShowCreateView(false)} />}
    </div>
  )
}

function ViewsList({
  viewsByType,
  activeViewKey,
  onSelect,
}: {
  viewsByType: Record<string, View[]>
  activeViewKey: string | null
  onSelect: (key: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.keys(viewsByType).reduce((acc, k) => ({ ...acc, [k]: true }), {}),
  )

  return (
    <div className="space-y-1">
      {Object.entries(viewsByType).map(([type, views]) => (
        <div key={type}>
          <button
            onClick={() => setExpanded((e) => ({ ...e, [type]: !e[type] }))}
            className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 hover:bg-[var(--color-surface-3)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {expanded[type] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {VIEW_TYPE_LABELS[type] ?? type}
            <span className="ml-auto text-[10px] font-normal opacity-40">{views.length}</span>
          </button>
          {expanded[type] && (
            <div className="ml-2 mt-0.5 space-y-0.5">
              {views.map((view) => (
                <button
                  key={view.key}
                  onClick={() => onSelect(view.key)}
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150"
                  style={{
                    background:
                      view.key === activeViewKey
                        ? 'var(--color-surface-3)'
                        : 'transparent',
                    color:
                      view.key === activeViewKey
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-muted)',
                    boxShadow:
                      view.key === activeViewKey
                        ? 'inset 2px 0 0 var(--color-accent)'
                        : 'none',
                  }}
                >
                  {view.title ?? view.key}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ModelTree() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  if (!workspace) return null

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }))

  return (
    <div className="space-y-0.5">
      {workspace.model.people.map((person) => (
        <div
          key={person.id}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-150 hover:bg-[var(--color-surface-3)]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: 'var(--color-type-person)' }}
          />
          <span className="truncate">{person.name}</span>
        </div>
      ))}
      {workspace.model.softwareSystems.map((system) => (
        <div key={system.id}>
          <button
            onClick={() => toggle(system.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-150 hover:bg-[var(--color-surface-3)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {system.containers.length > 0 ? (
              expanded[system.id] ? <ChevronDown size={10} /> : <ChevronRight size={10} />
            ) : (
              <span className="w-2.5" />
            )}
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded"
              style={{ background: 'var(--color-type-system)' }}
            />
            <span className="truncate">{system.name}</span>
          </button>
          {expanded[system.id] &&
            system.containers.map((container) => (
              <div key={container.id} className="ml-4">
                <button
                  onClick={() => toggle(container.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-150 hover:bg-[var(--color-surface-3)]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {container.components.length > 0 ? (
                    expanded[container.id] ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronRight size={10} />
                    )
                  ) : (
                    <span className="w-2.5" />
                  )}
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded"
                    style={{ background: 'var(--color-type-container)' }}
                  />
                  <span className="truncate">{container.name}</span>
                </button>
                {expanded[container.id] &&
                  container.components.map((comp) => (
                    <div
                      key={comp.id}
                      className="ml-4 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-150 hover:bg-[var(--color-surface-3)]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <span className="w-2.5" />
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded"
                        style={{ background: 'var(--color-type-component)' }}
                      />
                      <span className="truncate">{comp.name}</span>
                    </div>
                  ))}
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}

function SearchPanel() {
  return (
    <div>
      <input
        type="text"
        placeholder="Search elements..."
        className="w-full rounded-lg border px-3 py-2 text-xs transition-all duration-200 outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
        style={{
          background: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      <div className="mt-4 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Type to search across all elements
      </div>
    </div>
  )
}
