import { useEffect, useMemo, useRef, useState } from 'react'
import { Tag, Activity, Cpu, Users, X, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useWorkspaceStore, getActiveView, buildElementMap } from '@/store/workspace'
import type { ElementStatus } from '@/types/model'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: 'var(--color-status-live)',
  Planned: 'var(--color-status-planned)',
  Deprecated: 'var(--color-status-deprecated)',
  Removed: 'var(--color-status-removed)',
}

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

export default function SpotlightPanel() {
  const open = useWorkspaceStore((s) => s.spotlightPanelOpen)
  const setOpen = useWorkspaceStore((s) => s.setSpotlightPanelOpen)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const tags = useWorkspaceStore((s) => s.activeTagFilter)
  const statuses = useWorkspaceStore((s) => s.activeStatusFilter)
  const techs = useWorkspaceStore((s) => s.activeTechFilter)
  const teams = useWorkspaceStore((s) => s.activeTeamFilter)
  const toggleTag = useWorkspaceStore((s) => s.toggleActiveTagFilter)
  const toggleStatus = useWorkspaceStore((s) => s.toggleActiveStatusFilter)
  const toggleTech = useWorkspaceStore((s) => s.toggleActiveTechFilter)
  const toggleTeam = useWorkspaceStore((s) => s.toggleActiveTeamFilter)
  const setTags = useWorkspaceStore((s) => s.setActiveTagFilter)
  const setStatuses = useWorkspaceStore((s) => s.setActiveStatusFilter)
  const setTechs = useWorkspaceStore((s) => s.setActiveTechFilter)
  const setTeams = useWorkspaceStore((s) => s.setActiveTeamFilter)
  const clearAll = useWorkspaceStore((s) => s.clearAllSpotlightFilters)

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const elementMap = useMemo(() => (workspace ? buildElementMap(workspace) : new Map()), [workspace])

  const viewTags = useMemo(() => {
    if (!view) return []
    const set = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el) for (const t of el.tags) if (!DEFAULT_BUILTIN_TAGS.includes(t)) set.add(t)
    }
    return Array.from(set).sort()
  }, [view, elementMap])

  const viewStatuses = useMemo<ElementStatus[]>(() => {
    if (!view) return []
    const set = new Set<ElementStatus>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.status) set.add(el.status)
    }
    return (['Live', 'Planned', 'Deprecated', 'Removed'] as ElementStatus[]).filter((s) => set.has(s))
  }, [view, elementMap])

  const viewTechs = useMemo(() => {
    if (!view) return []
    const set = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id) as { technology?: string } | undefined
      const raw = el?.technology
      if (!raw) continue
      for (const t of raw.split(',').map((s) => s.trim()).filter(Boolean)) set.add(t)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [view, elementMap])

  const viewTeams = useMemo(() => {
    if (!view) return []
    const set = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.owner) set.add(el.owner)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [view, elementMap])

  const tagStyles = workspace?.views.configuration.styles.elements ?? []
  const tagColorFor = (tag: string) => tagStyles.find((s) => s.tag === tag)?.background

  const total = tags.length + statuses.length + techs.length + teams.length

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!workspace) return null

  return (
    <div
      ref={containerRef}
      data-canvas-chrome="spotlight-panel"
      style={{
        position: 'fixed',
        top: 72,
        right: 14,
        zIndex: 50,
        width: 280,
        maxHeight: 'calc(100dvh - 86px)',
        overflowY: 'auto',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'var(--glass-shadow)',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-8px)',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
      }}
      role="complementary"
      aria-label="Spotlight filters"
      aria-hidden={!open}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Filter
            {total > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'var(--color-accent-active)',
                  color: 'var(--color-accent)',
                }}
              >
                {total}
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Highlight on canvas
          </div>
        </div>
        {total > 0 && (
          <button
            type="button"
            onClick={clearAll}
            title="Clear all filters"
            aria-label="Clear all filters"
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 4 }}
          >
            <X size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Close filter panel"
          aria-label="Close filter panel"
          className="btn-icon"
          style={{ minWidth: 24, minHeight: 24, padding: 4 }}
        >
          <ChevronRight size={14} />
        </button>
      </header>

      <FacetSection
        label="Tags"
        icon={<Tag size={12} />}
        semantic="ANY"
        available={viewTags}
        selected={tags}
        onToggle={toggleTag}
        onClear={() => setTags([])}
        colorFor={tagColorFor}
        searchable={viewTags.length > 8}
      />
      <FacetSection
        label="Status"
        icon={<Activity size={12} />}
        semantic="ANY"
        available={viewStatuses}
        selected={statuses}
        onToggle={(v) => toggleStatus(v as ElementStatus)}
        onClear={() => setStatuses([])}
        colorFor={(v) => STATUS_COLORS[v as ElementStatus]}
      />
      <FacetSection
        label="Tech"
        icon={<Cpu size={12} />}
        semantic="AND"
        available={viewTechs}
        selected={techs}
        onToggle={toggleTech}
        onClear={() => setTechs([])}
        searchable={viewTechs.length > 8}
      />
      <FacetSection
        label="Teams"
        icon={<Users size={12} />}
        semantic="ANY"
        available={viewTeams}
        selected={teams}
        onToggle={toggleTeam}
        onClear={() => setTeams([])}
        searchable={viewTeams.length > 8}
      />
    </div>
  )
}

interface FacetSectionProps {
  label: string
  icon: React.ReactNode
  semantic: 'AND' | 'ANY'
  available: string[]
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
  colorFor?: (value: string) => string | undefined
  searchable?: boolean
}

function FacetSection({ label, icon, semantic, available, selected, onToggle, onClear, colorFor, searchable }: FacetSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((v) => v.toLowerCase().includes(q))
  }, [available, query])

  const ordered = useMemo(() => {
    const sel = filtered.filter((v) => selected.includes(v))
    const unsel = filtered.filter((v) => !selected.includes(v))
    return [...sel, ...unsel]
  }, [filtered, selected])

  const matchedInView = selected.filter((v) => available.includes(v)).length
  const stale = selected.length > 0 && matchedInView === 0
  const isEmpty = available.length === 0 && selected.length === 0

  return (
    <section
      style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '10px 14px',
        opacity: isEmpty ? 0.55 : 1,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 700,
          color: 'var(--color-text-muted)',
          cursor: isEmpty ? 'default' : 'pointer',
          userSelect: 'none',
          marginBottom: collapsed ? 0 : 8,
        }}
        onClick={() => { if (!isEmpty) setCollapsed((c) => !c) }}
        role="button"
        aria-expanded={!collapsed}
        aria-disabled={isEmpty}
      >
        <span style={{ display: 'inline-flex', color: 'var(--color-text-muted)' }}>{icon}</span>
        <span>{label}</span>
        {selected.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 999,
              background: stale ? 'var(--color-surface-2)' : 'var(--color-accent-active)',
              color: stale ? 'var(--color-text-muted)' : 'var(--color-accent)',
            }}
          >
            {stale ? `${selected.length} (0)` : selected.length}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
          {semantic === 'AND' ? 'all of' : 'any of'}
        </span>
        {!isEmpty && (
          <span style={{ display: 'inline-flex', color: 'var(--color-text-muted)' }}>
            <ChevronDown size={12} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 0.12s' }} />
          </span>
        )}
      </header>

      {!collapsed && !isEmpty && (
        <>
          {searchable && (
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder={`Search ${label.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px 5px 24px',
                  fontSize: 'var(--text-xs)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ordered.length === 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>No matches</span>
            )}
            {ordered.map((value) => {
              const isSel = selected.includes(value)
              const swatch = colorFor?.(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggle(value)}
                  aria-pressed={isSel}
                  style={{
                    height: 24,
                    padding: '0 8px',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    background: isSel ? (swatch ?? 'var(--color-accent)') : 'var(--color-surface-2)',
                    color: isSel ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                    border: isSel ? 'none' : '1px solid var(--color-border)',
                    cursor: 'pointer',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {swatch && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: isSel ? 'var(--glass-bg)' : swatch,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
                </button>
              )
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                marginTop: 6,
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </>
      )}
    </section>
  )
}
