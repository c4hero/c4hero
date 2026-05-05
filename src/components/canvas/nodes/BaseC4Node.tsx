import { useState, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { LucideIcon } from 'lucide-react'
import {
  ZoomIn,
  Database, Circle, Hexagon, Diamond, UserRound, Bot, Folder, Globe, Smartphone,
  AlertTriangle,
} from 'lucide-react'
import type { C4NodeData } from './types'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'
import ZoomHoverCard from './ZoomHoverCard'
import { useWorkspaceStore } from '@/store/workspace'
import { useZoomLevel } from '@/hooks/useZoomLevel'
import { pickHighlightReason } from '@/lib/highlight'

/** Map Structurizr shape names to Lucide icons */
const SHAPE_ICON_MAP: Record<string, LucideIcon> = {
  Cylinder: Database,
  Circle: Circle,
  Ellipse: Circle,
  Hexagon: Hexagon,
  Diamond: Diamond,
  Person: UserRound,
  Robot: Bot,
  Folder: Folder,
  WebBrowser: Globe,
  MobileDevicePortrait: Smartphone,
  MobileDeviceLandscape: Smartphone,
}

interface BaseC4NodeProps {
  data: C4NodeData
  selected?: boolean
  icon: LucideIcon
  typeColor: string
  chipLabel: string
  tint: string
  borderStyle: string
  ariaPrefix: string
  technology?: string
  isExternal?: boolean
}

export default function BaseC4Node({
  data,
  selected: rfSelected,
  icon: Icon,
  typeColor,
  chipLabel,
  tint,
  borderStyle,
  ariaPrefix,
  technology,
  isExternal,
}: BaseC4NodeProps) {
  const storeSelected = useWorkspaceStore((s) => s.selectedElementIds.includes(data.element.id))
  // useShallow does a shallow array compare so the inline filter doesn't
  // create a "new reference every render → infinite re-render" loop.
  const elementViolations = useWorkspaceStore(
    useShallow((s) => s.scopeViolations.filter((v) => v.elementId === data.element.id)),
  )
  const filters = useWorkspaceStore(useShallow((s) => ({
    tags: s.activeTagFilter,
    statuses: s.activeStatusFilter,
    techs: s.activeTechFilter,
    teams: s.activeTeamFilter,
  })))
  const reasonLabel = data.highlighted ? pickHighlightReason(data.element, filters) : null
  const selected = rfSelected || storeSelected
  const { element, childCount, onDrillIn, viewCount = 1 } = data
  const desc = element.description ?? ''
  const style = data.style

  // ─── Resolve tag style overrides ──────────────────────────────────
  const ResolvedIcon = (style?.shape && SHAPE_ICON_MAP[style.shape]) || Icon
  const isPerson = style?.shape === 'Person'
  // Theme/tag styles apply to all elements. External elements are distinguished
  // by their dashed border and "External" chip label — not by opting out of color.
  const resolvedTint = style?.background ?? tint
  const resolvedTypeColor = style?.color ?? typeColor

  // Border: default nodes use their type-colored border from `borderStyle`.
  // When a tag style supplies a custom background, derive the border from that
  // fill (a brighter variant) so the node reads as a cohesive shape instead of
  // fighting the hardcoded type color. Explicit tag-style `stroke` still wins.
  const borderParts = borderStyle.split(' ')
  const borderWidth = style?.strokeWidth ?? (parseInt(borderParts[0]) || 2)
  const borderLine = style?.border?.toLowerCase() ?? borderParts[1] ?? (isExternal ? 'dashed' : 'solid')
  const borderColor = style?.stroke
    ?? (style?.background ? `color-mix(in srgb, ${style.background}, white 32%)` : borderParts.slice(2).join(' '))
  const resolvedBorder = selected
    ? `2px solid ${borderColor}`
    : `${borderWidth}px ${borderLine} ${borderColor}`

  // Opacity: Structurizr uses 0–100, CSS uses 0–1
  const resolvedOpacity = style?.opacity != null ? style.opacity / 100 : undefined

  // Font size from tag style (pixels)
  const resolvedFontSize = style?.fontSize

  // Semantic zoom: show different detail levels based on viewport zoom
  const zoomLevel = useZoomLevel()
  const isCompact = zoomLevel === 'compact'
  const isFull = zoomLevel === 'full'
  const nameClamp = isCompact ? 1 : isFull ? undefined : 2
  const descClamp = isCompact ? undefined : isFull ? undefined : 3

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''} ${isPerson ? 'c4-node-person' : ''}`}
      style={{
        background: resolvedTint,
        border: resolvedBorder,
        // Per-node tier color for selection halo, hover handles, and the
        // connection-target indicator. Cascades to children. Falls back to
        // the theme-wide selection color via the CSS rules.
        ['--node-glow' as string]: borderColor,
        ...(isPerson && { borderRadius: 999, padding: '20px 28px' }),
        ...(resolvedOpacity != null && { opacity: resolvedOpacity }),
      }}
      role="figure"
      aria-label={`${ariaPrefix}: ${element.name}${technology ? ` (${technology})` : ''}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />
      {elementViolations.length > 0 && (
        <span
          className="c4-node-violation"
          role="img"
          aria-label={elementViolations.map((v) => v.message).join(' | ')}
          title={elementViolations.map((v) => v.message).join('\n')}
        >
          <AlertTriangle size={12} />
          {elementViolations.length > 1 && <span>{elementViolations.length}</span>}
        </span>
      )}

      {/* Row 1: icon + title + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isPerson ? (
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: `1.5px solid ${resolvedTypeColor}`,
              background: `color-mix(in srgb, ${resolvedTypeColor} 18%, transparent)`,
              color: resolvedTypeColor,
            }}
          >
            <ResolvedIcon size={14} />
          </span>
        ) : (
          <ResolvedIcon size={16} aria-hidden="true" style={{ flexShrink: 0, color: resolvedTypeColor }} />
        )}
        <div style={{ flex: 1, minWidth: 0, ...(resolvedFontSize != null && { fontSize: `${resolvedFontSize}px` }) }}>
          <InlineName elementId={element.id} name={element.name} lineClamp={nameClamp} textColor={style?.color} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} className="c4-node-actions">
          {viewCount > 1 && (
            <span
              className="c4-node-view-count nodrag"
              style={{ color: resolvedTypeColor }}
              title={`Appears in ${viewCount} views`}
              aria-label={`${element.name} appears in ${viewCount} views`}
            >
              {viewCount}×
            </span>
          )}
          {childCount !== undefined && (
            <ZoomButton element={element} typeColor={resolvedTypeColor} onDrillIn={onDrillIn} />
          )}
        </div>
      </div>

      {/* Row 2: description (hidden in compact mode) */}
      {desc && !isCompact && (
        <p
          className={descClamp ? `line-clamp-${descClamp}` : undefined}
          style={{ fontSize: resolvedFontSize != null ? `${Math.round(resolvedFontSize * 0.78)}px` : 'var(--text-xs-plus)', color: style?.color ? `color-mix(in srgb, ${style.color} 70%, ${resolvedTint})` : borderColor, margin: '6px 0 0', lineHeight: '1.4' }}
        >
          {desc}
        </p>
      )}

      {/* Row 3: type chip + technology pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
        <span
          className="c4-type-chip"
          style={{
            background: `color-mix(in srgb, ${resolvedTypeColor} 12%, transparent)`,
            color: resolvedTypeColor,
          }}
        >
          {chipLabel}
        </span>
        {technology && !isCompact && technology.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
          <span
            key={t}
            className="c4-type-chip"
            style={{
              background: `color-mix(in srgb, ${style?.color ?? 'var(--color-text-muted)'} 10%, transparent)`,
              color: style?.color ?? 'var(--color-text-muted)',
              fontWeight: 600,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <NodeHandles />
      {reasonLabel && (
        <span
          className="c4-highlight-label"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            background: 'var(--canvas-selection, var(--color-accent))',
            color: 'var(--color-bg-primary, #0b0f17)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
          aria-label={`Match: ${reasonLabel}`}
        >
          {reasonLabel}
        </span>
      )}
    </div>
  )
}

/** Zoom button with hover card popover */
function ZoomButton({ element, typeColor, onDrillIn }: {
  element: C4NodeData['element']
  typeColor: string
  onDrillIn?: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setHovered(true)
  }, [])

  const scheduleHide = useCallback(() => {
    hideTimer.current = setTimeout(() => setHovered(false), 200)
  }, [])

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        className="c4-node-action-btn nodrag"
        style={{ color: typeColor }}
        onClick={(e) => { e.stopPropagation(); onDrillIn?.(element.id) }}
        aria-label={`Zoom into ${element.name}`}
      >
        <ZoomIn size={11} aria-hidden="true" />
      </button>
      {hovered && <ZoomHoverCard element={element} typeColor={typeColor} />}
    </div>
  )
}
