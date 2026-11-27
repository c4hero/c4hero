import type { TechIconData } from '@/lib/techIcons/catalog'

/** A Simple Icons brand mark as inline SVG. Inline, not an <img>, so it
 *  needs no network or CSP change and is captured by PNG/SVG export. */
export default function TechIcon({ icon, size, color }: { icon: TechIconData; size: number; color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={icon.path} />
    </svg>
  )
}
