import { useState, useRef, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ZoomIn,
  Database, Circle, Hexagon, Diamond, UserRound, Bot, Folder, Globe, Smartphone,
} from 'lucide-react'
import type { C4NodeData } from './types'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'
import ZoomHoverCard from './ZoomHoverCard'
import { useWorkspaceStore } from '@/store/workspace'

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
  const selected = rfSelected || storeSelected
  const { element, childCount, onDrillIn, viewCount = 1 } = data
  const desc = element.description ?? ''
  const style = data.style

  // ─── Resolve tag style overrides ──────────────────────────────────
  const ResolvedIcon = (style?.shape && SHAPE_ICON_MAP[style.shape]) || Icon
  // External elements keep their distinct grey styling; type-level DSL styles only apply to internal elements
  const resolvedTint = isExternal ? tint : (style?.background ?? tint)
  const resolvedTypeColor = isExternal ? typeColor : (style?.color ?? typeColor)

  // Border: override width/style/color individually, falling back to type defaults
  // External elements always use their distinctive dashed border unless explicitly overridden by a custom (non-type) tag style
  const resolvedBorder = (() => {
    if (selected) return '2px solid var(--color-accent)'
    if (isExternal || (!style?.stroke && style?.strokeWidth == null && !style?.border)) return borderStyle
    const parts = borderStyle.split(' ')
    const width = style?.strokeWidth ?? (parseInt(parts[0]) || 2)
    const line = style?.border?.toLowerCase() ?? parts[1] ?? 'solid'
    const color = style?.stroke ?? parts.slice(2).join(' ')
    return `${width}px ${line} ${color}`
  })()

  // Opacity: Structurizr uses 0–100, CSS uses 0–1
  const resolvedOpacity = style?.opacity != null ? style.opacity / 100 : undefined

  // Font size from tag style (pixels)
  const resolvedFontSize = style?.fontSize

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: resolvedTint,
        border: resolvedBorder,
        ...(resolvedOpacity != null && { opacity: resolvedOpacity }),
      }}
      role="figure"
      aria-label={`${ariaPrefix}: ${element.name}${technology ? ` (${technology})` : ''}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />

      {/* Row 1: icon + title + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ResolvedIcon size={16} aria-hidden="true" style={{ flexShrink: 0, color: resolvedTypeColor }} />
        <div style={{ flex: 1, minWidth: 0, ...(resolvedFontSize != null && { fontSize: `${resolvedFontSize}px` }) }}>
          <InlineName elementId={element.id} name={element.name} />
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

      {/* Row 2: description */}
      {desc && (
        <p style={{ fontSize: resolvedFontSize != null ? `${Math.round(resolvedFontSize * 0.78)}px` : 'var(--text-xs-plus)', color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: '1.4' }}>
          {desc}
        </p>
      )}

      {/* Row 3: type chip + technology */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
        <span
          className="c4-type-chip"
          style={{
            background: `color-mix(in srgb, ${resolvedTypeColor} 12%, transparent)`,
            color: resolvedTypeColor,
          }}
        >
          {chipLabel}
        </span>
        {technology && (
          <span style={{ fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)' }}>{technology}</span>
        )}
      </div>

      <NodeHandles />
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
