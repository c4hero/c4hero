import { useEffect, useMemo, useRef, useState } from 'react'
import { Tag, Activity, Cpu, Users, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useWorkspaceStore, getActiveView, buildElementMap } from '@/store/workspace'
import type { ElementStatus } from '@/types/model'
import FacetControl from './FacetControl'
import { useSpotlightCollapsed } from './useSpotlightCollapsed'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: 'var(--color-status-live)',
  Planned: 'var(--color-status-planned)',
  Deprecated: 'var(--color-status-deprecated)',
  Removed: 'var(--color-status-removed)',
}

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

export default function SpotlightBar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
  const activeTechFilter = useWorkspaceStore((s) => s.activeTechFilter)
  const activeTeamFilter = useWorkspaceStore((s) => s.activeTeamFilter)
  const toggleTag = useWorkspaceStore((s) => s.toggleActiveTagFilter)
  const setTags = useWorkspaceStore((s) => s.setActiveTagFilter)
  const toggleStatus = useWorkspaceStore((s) => s.toggleActiveStatusFilter)
  const setStatuses = useWorkspaceStore((s) => s.setActiveStatusFilter)
  const toggleTech = useWorkspaceStore((s) => s.toggleActiveTechFilter)
  const setTechs = useWorkspaceStore((s) => s.setActiveTechFilter)
  const toggleTeam = useWorkspaceStore((s) => s.toggleActiveTeamFilter)
  const setTeams = useWorkspaceStore((s) => s.setActiveTeamFilter)
  const clearAll = useWorkspaceStore((s) => s.clearAllSpotlightFilters)

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const elementMap = useMemo(() => (workspace ? buildElementMap(workspace) : new Map()), [workspace])

  const viewTags = useMemo(() => {
    if (!view) return []
    const tags = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el) for (const tag of el.tags) {
        if (!DEFAULT_BUILTIN_TAGS.includes(tag)) tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [view, elementMap])

  const viewStatuses = useMemo<ElementStatus[]>(() => {
    if (!view) return []
    const statuses = new Set<ElementStatus>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.status) statuses.add(el.status as ElementStatus)
    }
    return (['Live', 'Planned', 'Deprecated', 'Removed'] as ElementStatus[]).filter((s) => statuses.has(s))
  }, [view, elementMap])

  const viewTechs = useMemo(() => {
    if (!view) return []
    const techs = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id) as { technology?: string } | undefined
      const raw = el?.technology
      if (!raw) continue
      for (const t of raw.split(',').map((s) => s.trim()).filter(Boolean)) techs.add(t)
    }
    return Array.from(techs).sort((a, b) => a.localeCompare(b))
  }, [view, elementMap])

  const viewTeams = useMemo(() => {
    if (!view) return []
    const teams = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.owner) teams.add(el.owner)
    }
    return Array.from(teams).sort((a, b) => a.localeCompare(b))
  }, [view, elementMap])

  const tagStyles = workspace?.views.configuration.styles.elements ?? []
  const tagColorFor = (tag: string) => tagStyles.find((s) => s.tag === tag)?.background

  const [manuallyCollapsed, setManuallyCollapsed] = useSpotlightCollapsed()
  const [autoCollapsed, setAutoCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const ro = new ResizeObserver(() => {
      if (manuallyCollapsed) { setAutoCollapsed(false); return }
      setAutoCollapsed(content.scrollWidth > content.clientWidth + 2)
    })
    ro.observe(container)
    ro.observe(content)
    return () => ro.disconnect()
  }, [manuallyCollapsed])

  const collapsed = manuallyCollapsed || autoCollapsed
  const totalSelected =
    activeTagFilter.length + activeStatusFilter.length + activeTechFilter.length + activeTeamFilter.length

  const facetDots = [
    { lit: activeTagFilter.length > 0, label: 'Tags' },
    { lit: activeStatusFilter.length > 0, label: 'Status' },
    { lit: activeTechFilter.length > 0, label: 'Tech' },
    { lit: activeTeamFilter.length > 0, label: 'Teams' },
  ]

  if (!workspace) return null

  return (
    <div
      ref={containerRef}
      data-canvas-chrome="bottom-spotlight"
      className="glass-panel"
      style={{
        pointerEvents: 'auto',
        maxWidth: '100%',
        display: 'flex',
        alignItems: 'center',
        height: 44,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => { setManuallyCollapsed(false); setAutoCollapsed(false) }}
          title={
            totalSelected === 0
              ? 'Spotlight (no filters)'
              : `Spotlight: ${totalSelected} filter${totalSelected === 1 ? '' : 's'} active`
          }
          style={{
            height: '100%', padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {facetDots.map((d) => (
              <span
                key={d.label}
                aria-label={`${d.label}${d.lit ? ' active' : ''}`}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: d.lit ? 'var(--color-accent)' : 'var(--color-border)',
                }}
              />
            ))}
          </span>
          <span>{totalSelected === 0 ? 'Spotlight' : `${totalSelected} active`}</span>
          <ChevronUp size={12} />
        </button>
      ) : (
        <div
          ref={contentRef}
          style={{
            display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, height: '100%', overflow: 'hidden',
          }}
        >
          <FacetControl
            label="Tags"
            icon={<Tag size={13} />}
            withinSemantic="ANY"
            available={viewTags}
            selected={activeTagFilter}
            onToggle={toggleTag}
            onClear={() => setTags([])}
            colorFor={tagColorFor}
            emptyHint="No custom tags in this view"
          />
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <FacetControl
            label="Status"
            icon={<Activity size={13} />}
            withinSemantic="ANY"
            available={viewStatuses}
            selected={activeStatusFilter}
            onToggle={(v) => toggleStatus(v as ElementStatus)}
            onClear={() => setStatuses([])}
            colorFor={(v) => STATUS_COLORS[v as ElementStatus]}
            emptyHint="No statuses in this view"
          />
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <FacetControl
            label="Tech"
            icon={<Cpu size={13} />}
            withinSemantic="AND"
            available={viewTechs}
            selected={activeTechFilter}
            onToggle={toggleTech}
            onClear={() => setTechs([])}
            emptyHint="No technology values in this view"
          />
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <FacetControl
            label="Teams"
            icon={<Users size={13} />}
            withinSemantic="ANY"
            available={viewTeams}
            selected={activeTeamFilter}
            onToggle={toggleTeam}
            onClear={() => setTeams([])}
            emptyHint="No owners set in this view"
          />
          <div style={{ flex: 1 }} />
          {totalSelected > 0 && (
            <button
              type="button"
              onClick={clearAll}
              title="Clear all spotlight filters"
              style={{
                height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600,
                marginRight: 4, flexShrink: 0,
              }}
            >
              <X size={11} />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setManuallyCollapsed(true)}
            title="Collapse spotlight"
            aria-label="Collapse spotlight"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)',
              marginRight: 6, flexShrink: 0,
            }}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
