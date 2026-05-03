import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tag, Activity, Cpu, Users, X, Trash2, Search, Pencil } from 'lucide-react'
import { useWorkspaceStore, getActiveView, buildElementMap } from '@/store/workspace'
import type { ElementStatus } from '@/types/model'
import { TagManagerPanel } from '../FloatingBottomStrip'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: 'var(--color-status-live)',
  Planned: 'var(--color-status-planned)',
  Deprecated: 'var(--color-status-deprecated)',
  Removed: 'var(--color-status-removed)',
}

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

type FacetKey = 'tags' | 'status' | 'tech' | 'teams'

const FACET_TABS: { key: FacetKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'tags', label: 'Tags', icon: Tag },
  { key: 'status', label: 'Status', icon: Activity },
  { key: 'tech', label: 'Tech', icon: Cpu },
  { key: 'teams', label: 'Teams', icon: Users },
]

export default function SpotlightPanel() {
  const open = useWorkspaceStore((s) => s.spotlightPanelOpen)
  const setOpen = useWorkspaceStore((s) => s.setSpotlightPanelOpen)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const tags = useWorkspaceStore((s) => s.activeTagFilter)
  const statuses = useWorkspaceStore((s) => s.activeStatusFilter)
  const techs = useWorkspaceStore((s) => s.activeTechFilter)
  const teams = useWorkspaceStore((s) => s.activeTeamFilter)
  const tagMode = useWorkspaceStore((s) => s.tagFilterMode)
  const statusMode = useWorkspaceStore((s) => s.statusFilterMode)
  const techMode = useWorkspaceStore((s) => s.techFilterMode)
  const teamMode = useWorkspaceStore((s) => s.teamFilterMode)
  const setTagMode = useWorkspaceStore((s) => s.setTagFilterMode)
  const setStatusMode = useWorkspaceStore((s) => s.setStatusFilterMode)
  const setTechMode = useWorkspaceStore((s) => s.setTechFilterMode)
  const setTeamMode = useWorkspaceStore((s) => s.setTeamFilterMode)
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

  // Per-value counts so users see how many elements each option would highlight.
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!view) return map
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (!el) continue
      for (const t of el.tags) {
        if (DEFAULT_BUILTIN_TAGS.includes(t)) continue
        map.set(t, (map.get(t) ?? 0) + 1)
      }
    }
    return map
  }, [view, elementMap])

  const statusCounts = useMemo(() => {
    const map = new Map<ElementStatus, number>()
    if (!view) return map
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.status) map.set(el.status, (map.get(el.status) ?? 0) + 1)
    }
    return map
  }, [view, elementMap])

  const techCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!view) return map
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id) as { technology?: string } | undefined
      const raw = el?.technology
      if (!raw) continue
      for (const t of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        map.set(t, (map.get(t) ?? 0) + 1)
      }
    }
    return map
  }, [view, elementMap])

  const teamCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!view) return map
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.owner) map.set(el.owner, (map.get(el.owner) ?? 0) + 1)
    }
    return map
  }, [view, elementMap])

  const viewTags = useMemo(() => Array.from(tagCounts.keys()).sort(), [tagCounts])
  const viewStatuses = useMemo<ElementStatus[]>(
    () => (['Live', 'Planned', 'Deprecated', 'Removed'] as ElementStatus[]).filter((s) => statusCounts.has(s)),
    [statusCounts],
  )
  const viewTechs = useMemo(() => Array.from(techCounts.keys()).sort((a, b) => a.localeCompare(b)), [techCounts])
  const viewTeams = useMemo(() => Array.from(teamCounts.keys()).sort((a, b) => a.localeCompare(b)), [teamCounts])

  const tagStyles = workspace?.views.configuration.styles.elements ?? []
  // Tag chips render with the SAME background + foreground + stroke as the
  // node tag style — so the chip in the panel previews exactly what the node
  // will look like once highlighted.
  const tagSwatchFor = (t: string): { bg?: string; color?: string; stroke?: string } | undefined => {
    const s = tagStyles.find((x) => x.tag === t)
    if (!s) return undefined
    return { bg: s.background, color: s.color, stroke: s.stroke }
  }

  const total = tags.length + statuses.length + techs.length + teams.length
  const counts: Record<FacetKey, number> = {
    tags: tags.length,
    status: statuses.length,
    tech: techs.length,
    teams: teams.length,
  }

  const [tab, setTab] = useState<FacetKey>('tags')
  const [query, setQuery] = useState('')
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

  // Reset search when switching tabs.
  useEffect(() => { setQuery('') }, [tab])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const containerRef = useRef<HTMLDivElement>(null)

  if (!workspace) return null

  // Build the active tab's content from a single descriptor so the rest of
  // the panel stays purely presentational.
  const tabContent: {
    available: string[]
    selected: string[]
    counts: Map<string, number>
    mode: 'any' | 'all'
    setMode: (m: 'any' | 'all') => void
    onToggle: (v: string) => void
    onClear: () => void
    colorFor?: (v: string) => string | { bg?: string; color?: string; stroke?: string } | undefined
    label: string
    placeholder: string
  } = (() => {
    switch (tab) {
      case 'tags':
        return {
          available: viewTags,
          selected: tags,
          counts: tagCounts,
          mode: tagMode,
          setMode: setTagMode,
          onToggle: toggleTag,
          onClear: () => setTags([]),
          colorFor: tagSwatchFor,
          label: 'tags',
          placeholder: 'Search tags…',
        }
      case 'status':
        return {
          available: viewStatuses,
          selected: statuses,
          counts: statusCounts as unknown as Map<string, number>,
          mode: statusMode,
          setMode: setStatusMode,
          onToggle: (v) => toggleStatus(v as ElementStatus),
          onClear: () => setStatuses([]),
          colorFor: (v) => STATUS_COLORS[v as ElementStatus],
          label: 'statuses',
          placeholder: 'Search status…',
        }
      case 'tech':
        return {
          available: viewTechs,
          selected: techs,
          counts: techCounts,
          mode: techMode,
          setMode: setTechMode,
          onToggle: toggleTech,
          onClear: () => setTechs([]),
          label: 'tech',
          placeholder: 'Search tech…',
        }
      case 'teams':
        return {
          available: viewTeams,
          selected: teams,
          counts: teamCounts,
          mode: teamMode,
          setMode: setTeamMode,
          onToggle: toggleTeam,
          onClear: () => setTeams([]),
          label: 'teams',
          placeholder: 'Search teams…',
        }
    }
  })()

  const filteredValues = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tabContent.available
    return tabContent.available.filter((v) => v.toLowerCase().includes(q))
  }, [tabContent.available, query])

  // Stable order — values keep their position regardless of selection so
  // toggling a chip doesn't shuffle the layout under the user's cursor.
  const ordered = filteredValues

  return (
    <div
      ref={containerRef}
      data-canvas-chrome="spotlight-panel"
      role="complementary"
      aria-label="Highlighter"
      aria-hidden={!open}
      style={{
        position: 'fixed',
        top: 72,
        right: 14,
        zIndex: 50,
        width: 320,
        maxHeight: 'calc(100dvh - 86px)',
        display: 'flex',
        flexDirection: 'column',
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
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Highlight
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
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
            By tag, status, tech, or team
          </div>
        </div>
        {total > 0 && (
          <button
            type="button"
            onClick={clearAll}
            title="Clear all selections"
            aria-label="Clear all selections"
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 4 }}
          >
            <Trash2 size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Close highlighter"
          aria-label="Close highlighter"
          className="btn-icon"
          style={{ minWidth: 24, minHeight: 24, padding: 4 }}
        >
          <X size={14} />
        </button>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Facets"
        style={{
          display: 'flex',
          padding: '6px 8px 0',
          gap: 2,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {FACET_TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          const cnt = counts[key]
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(key)}
              title={cnt > 0 ? `${label} (${cnt} active)` : label}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                height: 28,
                padding: '0 4px',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              <Icon size={11} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {label}
              </span>
              {cnt > 0 && (
                <span
                  aria-label={`${cnt} selected`}
                  style={{
                    flexShrink: 0,
                    minWidth: 14,
                    height: 14,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    color: active ? 'var(--color-bg-primary)' : 'var(--color-bg-primary)',
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {cnt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div
        role="tabpanel"
        aria-label={`${tab} options`}
        style={{
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          flex: 1,
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={12}
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder={tabContent.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              fontSize: 'var(--text-xs)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Filter mode */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-text-muted)',
              marginBottom: 4,
            }}
          >
            Match mode
          </div>
          <ModeToggle mode={tabContent.mode} onChange={tabContent.setMode} />
        </div>

        {/* Values */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-muted)',
              }}
            >
              {FACET_TABS.find((t) => t.key === tab)?.label}{' '}
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.6 }}>
                {tabContent.available.length}
              </span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {tab === 'tags' && (
                <button
                  type="button"
                  onClick={() => setTagManagerOpen(true)}
                  title="Edit tag names and styles (rename, restyle, remove)"
                  aria-label="Edit tag styles"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Pencil size={10} />
                  Edit tags &amp; styles
                </button>
              )}
              {tabContent.selected.length > 0 && (
                <button
                  type="button"
                  onClick={tabContent.onClear}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {ordered.length === 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {tabContent.available.length === 0
                  ? `No ${tabContent.label} in this view`
                  : 'No matches'}
              </span>
            )}
            {ordered.map((value) => {
              const isSel = tabContent.selected.includes(value)
              const raw = tabContent.colorFor?.(value)
              const swatch = typeof raw === 'string' ? { bg: raw } : raw
              const cnt = tabContent.counts.get(value) ?? 0
              const selBg = swatch?.bg ?? 'var(--color-accent)'
              const selFg = swatch?.color ?? 'var(--color-bg-primary)'
              const dotBg = swatch?.stroke ?? swatch?.bg ?? 'var(--color-accent)'
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => tabContent.onToggle(value)}
                  aria-pressed={isSel}
                  title={`${value} (${cnt} match${cnt === 1 ? '' : 'es'})`}
                  style={{
                    height: 24,
                    padding: '0 9px',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    background: isSel ? selBg : 'var(--color-surface-2)',
                    color: isSel ? selFg : 'var(--color-text-primary)',
                    border: isSel
                      ? `1px solid ${swatch?.stroke ?? selBg}`
                      : '1px solid var(--color-border)',
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
                        background: isSel ? selFg : dotBg,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      opacity: isSel ? 0.85 : 0.55,
                    }}
                  >
                    {cnt}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {tagManagerOpen && createPortal(
        <TagManagerPanel onClose={() => setTagManagerOpen(false)} />,
        document.body,
      )}
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: 'any' | 'all'; onChange: (m: 'any' | 'all') => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Match mode"
      style={{
        display: 'inline-flex',
        padding: 2,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        gap: 2,
      }}
    >
      {(['any', 'all'] as const).map((m) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-xs)',
              fontSize: 11,
              fontWeight: 600,
              color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
              background: active ? 'var(--color-accent-active)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {m === 'any' ? 'Any of' : 'All of'}
          </button>
        )
      })}
    </div>
  )
}
