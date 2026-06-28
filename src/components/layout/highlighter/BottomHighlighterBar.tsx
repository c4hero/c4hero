import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { createPortal } from 'react-dom'
import { Tag, Activity, Cpu, Users, X, Ban, Search, Pencil } from 'lucide-react'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useWorkspaceStore, getActiveView, buildElementMap } from '@/store/workspace'
import type { ElementStatus } from '@/types/model'
import type { HighlighterFacet } from '@/store/workspace-types'
import TagManagerDialog from './TagManagerDialog'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: 'var(--color-status-live)',
  Planned: 'var(--color-status-planned)',
  Deprecated: 'var(--color-status-deprecated)',
  Removed: 'var(--color-status-removed)',
}

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

interface FacetDescriptor {
  key: HighlighterFacet
  label: string
  icon: React.ComponentType<{ size?: number }>
}

const FACETS: FacetDescriptor[] = [
  { key: 'tags', label: 'Tag', icon: Tag },
  { key: 'status', label: 'Status', icon: Activity },
  { key: 'tech', label: 'Tech', icon: Cpu },
  { key: 'teams', label: 'Team', icon: Users },
]

/** Bottom-anchored persistent bar with four facet segments. Each segment shows
 *  a count badge when its facet has active filters; clicking a segment opens
 *  (or closes) a flyout above the bar with the facet picker. Outside clicks
 *  and Escape close the open flyout. The bar itself is always visible while
 *  a workspace is loaded. */
export default function BottomHighlighterBar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const openFacet = useWorkspaceStore((s) => s.highlighterOpenFacet)
  const setOpenFacet = useWorkspaceStore((s) => s.setHighlighterOpenFacet)

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
  const clearAll = useWorkspaceStore((s) => s.clearAllHighlightFilters)

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
  const tagSwatchFor = (t: string): { bg?: string; color?: string; stroke?: string } | undefined => {
    const s = tagStyles.find((x) => x.tag === t)
    if (!s) return undefined
    return { bg: s.background, color: s.color, stroke: s.stroke }
  }

  const counts: Record<HighlighterFacet, number> = {
    tags: tags.length,
    status: statuses.length,
    tech: techs.length,
    teams: teams.length,
  }
  const total = counts.tags + counts.status + counts.tech + counts.teams

  const containerRef = useRef<HTMLDivElement>(null)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

  // Outside click closes the flyout. Clicks inside other canvas-chrome (the
  // multi-select bar, inspector, tool rail, etc.) shouldn't dismiss us either.
  useEffect(() => {
    if (!openFacet) return
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Element | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      // Use the capture phase so this runs BEFORE element-level mousedown
      // handlers can re-render (and detach the target). Inside the bubble
      // phase, a target that triggers an immediate state change can be gone
      // from the DOM by the time we read closest(), making chrome detection
      // miss legitimate canvas chrome.
      // Modal dialogs (role="dialog" + aria-modal) sit above the canvas
      // and shouldn't dismiss the flyout when the user interacts with them.
      if (target.closest?.('[data-canvas-chrome], [role="dialog"][aria-modal="true"]')) return
      setOpenFacet(null)
    }
    document.addEventListener('mousedown', onDocPointer, { capture: true })
    document.addEventListener('touchstart', onDocPointer, { capture: true })
    return () => {
      document.removeEventListener('mousedown', onDocPointer, { capture: true })
      document.removeEventListener('touchstart', onDocPointer, { capture: true })
    }
  }, [openFacet, setOpenFacet])

  useEscapeKey(!!openFacet, () => setOpenFacet(null))

  // Active tab descriptor — drives the flyout body.
  const facetContent = (() => {
    switch (openFacet) {
      case 'tags':
        return {
          available: viewTags,
          selected: tags as string[],
          counts: tagCounts,
          mode: tagMode,
          setMode: setTagMode,
          onToggle: toggleTag,
          onClear: () => setTags([]),
          colorFor: tagSwatchFor as (v: string) => string | { bg?: string; color?: string; stroke?: string } | undefined,
          label: 'tags',
          title: 'Tag',
          placeholder: 'Search tags…',
          showTagEditor: true,
        }
      case 'status':
        return {
          available: viewStatuses,
          selected: statuses as string[],
          counts: statusCounts as unknown as Map<string, number>,
          mode: statusMode,
          setMode: setStatusMode,
          onToggle: (v: string) => toggleStatus(v as ElementStatus),
          onClear: () => setStatuses([]),
          colorFor: (v: string) => STATUS_COLORS[v as ElementStatus],
          label: 'statuses',
          title: 'Status',
          placeholder: 'Search status…',
          showTagEditor: false,
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
          colorFor: undefined,
          label: 'tech',
          title: 'Tech',
          placeholder: 'Search tech…',
          showTagEditor: false,
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
          colorFor: undefined,
          label: 'teams',
          title: 'Team',
          placeholder: 'Search teams…',
          showTagEditor: false,
        }
      default:
        return null
    }
  })()

  function handleSegmentClick(facet: HighlighterFacet) {
    setOpenFacet(openFacet === facet ? null : facet)
  }

  // On phone screens the floating tool rail relocates to the bottom edge,
  // which would collide with this bar. Hide on mobile and let the user
  // reach the highlighter via the command palette.
  const breakpoint = useBreakpoint()
  if (!workspace || breakpoint === 'mobile') return null

  return (
    <div
      ref={containerRef}
      data-canvas-chrome="highlighter-bar"
      data-canvas-fit-chrome="bottom"
      role="complementary"
      aria-label="Highlighter"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 14,
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'auto',
      }}
    >
      {/* Flyout (rendered above the bar when a facet is open). Keyed by
          openFacet so switching tabs remounts the flyout — that resets its
          internal search query state without an effect. */}
      {openFacet && facetContent && (
        <FacetFlyout
          key={openFacet}
          content={facetContent}
          onClose={() => setOpenFacet(null)}
          onOpenTagManager={() => setTagManagerOpen(true)}
        />
      )}

      {/* The persistent segment bar */}
      <div
        role="toolbar"
        aria-label="Highlighter facets"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
        }}
      >
        {FACETS.map((f, idx) => {
          const active = openFacet === f.key
          const cnt = counts[f.key]
          const Icon = f.icon
          // Only the very last visible element in the bar drops its right
          // border. When there are active filters the Clear button sits to
          // the right of the segments, so every segment keeps its border.
          const isFinal = idx === FACETS.length - 1 && total === 0
          return (
            <button
              key={f.key}
              type="button"
              className="hover-subtle"
              data-active={active ? 'true' : undefined}
              data-testid={`highlighter-segment-${f.key}`}
              aria-pressed={active}
              aria-label={`Highlight by ${f.label}${cnt > 0 ? ` (${cnt} active)` : ''}`}
              onClick={() => handleSegmentClick(f.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                border: 'none',
                borderRight: isFinal ? 'none' : '1px solid var(--color-border)',
                // Inline `background` is only set in the active state. When
                // inactive, leaving it unset lets the `.hover-subtle:hover`
                // CSS rule actually take effect — inline styles always win
                // over class :hover, including in pseudo states.
                ...(active && { background: 'var(--color-accent-active)' }),
                color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <Icon size={12} />
              <span>{f.label}</span>
              {cnt > 0 && (
                <span
                  aria-label={`${cnt} selected`}
                  style={{
                    minWidth: 16,
                    height: 16,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: 'var(--color-accent)',
                    color: 'var(--color-bg-primary)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0,
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
        {total > 0 && (
          <button
            type="button"
            className="hover-subtle"
            onClick={(e) => { e.stopPropagation(); clearAll() }}
            title="Clear all highlight filters"
            aria-label="Clear all highlight filters"
            style={{
              padding: '0 12px',
              alignSelf: 'stretch',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <Ban size={13} />
          </button>
        )}
      </div>

      {tagManagerOpen && createPortal(
        <TagManagerDialog onClose={() => setTagManagerOpen(false)} />,
        document.body,
      )}
    </div>
  )
}

interface FacetContent {
  available: string[]
  selected: string[]
  counts: Map<string, number>
  mode: 'any' | 'all'
  setMode: (m: 'any' | 'all') => void
  onToggle: (v: string) => void
  onClear: () => void
  colorFor?: (v: string) => string | { bg?: string; color?: string; stroke?: string } | undefined
  label: string
  title: string
  placeholder: string
  showTagEditor: boolean
}

/** Per-facet flyout body. Owns its local search query state; remounts on
 *  facet change (via `key` in parent) so the query resets cleanly. */
function FacetFlyout({
  content,
  onClose,
  onOpenTagManager,
}: {
  content: FacetContent
  onClose: () => void
  onOpenTagManager: () => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const filteredValues = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return content.available
    return content.available.filter((v) => v.toLowerCase().includes(q))
  }, [content.available, query])

  function toggleSearch() {
    setSearchOpen((prev) => {
      // Closing search clears the active query so chip ordering doesn't
      // silently stay filtered after the input vanishes.
      if (prev) setQuery('')
      return !prev
    })
  }

  return (
    <div
      role="dialog"
      aria-label={`Highlight by ${content.title}`}
      style={{
        width: 320,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--glass-shadow)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-primary)',
            flex: 1,
          }}
        >
          {content.title}
          <span style={{ marginLeft: 6, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            {content.available.length}
          </span>
        </span>
        <ModeToggle mode={content.mode} onChange={content.setMode} />
        <button
          type="button"
          onClick={toggleSearch}
          title={searchOpen ? 'Close search' : 'Search'}
          aria-label={searchOpen ? 'Close search' : 'Search values'}
          aria-pressed={searchOpen}
          className="btn-icon"
          style={{
            minWidth: 22, minHeight: 22, padding: 3,
            color: searchOpen ? 'var(--color-accent)' : undefined,
            background: searchOpen ? 'var(--color-accent-active)' : undefined,
          }}
        >
          <Search size={12} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close highlighter flyout"
          className="btn-icon"
          style={{ minWidth: 22, minHeight: 22, padding: 3 }}
        >
          <X size={12} />
        </button>
      </div>

      {searchOpen && (
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
            placeholder={content.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
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
      )}

      {(content.showTagEditor || content.selected.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {content.showTagEditor && (
            <button
              type="button"
              onClick={onOpenTagManager}
              title="Edit tag names and styles"
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
          {content.selected.length > 0 && (
            <button
              type="button"
              onClick={content.onClear}
              style={{
                marginLeft: 'auto',
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
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
        {filteredValues.length === 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {content.available.length === 0
              ? `No ${content.label} in this view`
              : 'No matches'}
          </span>
        )}
        {filteredValues.map((value) => {
          const isSel = content.selected.includes(value)
          const raw = content.colorFor?.(value)
          const swatch = typeof raw === 'string' ? { bg: raw } : raw
          const cnt = content.counts.get(value) ?? 0
          const selBg = swatch?.bg ?? 'var(--color-accent)'
          const selFg = swatch?.color ?? 'var(--color-bg-primary)'
          const dotBg = swatch?.stroke ?? swatch?.bg ?? 'var(--color-accent)'
          return (
            <button
              key={value}
              type="button"
              onClick={() => content.onToggle(value)}
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
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: 10,
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
