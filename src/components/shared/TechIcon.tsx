import { createElement } from 'react'
import type { TechIconData } from '@/lib/techIcons/catalog'

/** A technology logo as inline SVG. Inline, not an <img>, so it needs no
 *  network or CSP change and is captured by PNG/SVG export. Brand marks are
 *  one filled path; category glyphs (TEA-386) are Lucide strokes. */
export default function TechIcon({ icon, size, color }: { icon: TechIconData; size: number; color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
      {...(icon.glyph
        ? { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
        : { fill: color })}
    >
      {icon.glyph
        ? icon.glyph.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))
        : <path d={icon.path} />}
    </svg>
  )
}
