import type { ReactNode } from 'react'
import TechIcon from '@/components/shared/TechIcon'
import type { TechIconData } from '@/lib/techIcons/catalog'
import type { TechIconSlug } from '@/lib/techIcons/registry'

/** The 28px logo tile that replaces a node's type glyph. It is drawn as soon
 *  as a logo is known, holding `placeholder` (the type glyph) until the lazy
 *  catalog arrives, so the node never changes size under the user, a pending
 *  connection or a layout pass when it does (TEA-381). */
export default function TechIconTile({ slug, icon, fill, borderColor, placeholder }: {
  slug: TechIconSlug
  icon?: TechIconData
  fill?: string
  borderColor: string
  placeholder: ReactNode
}) {
  const ready = icon !== undefined && fill !== undefined
  return (
    <span
      className={ready ? 'c4-node-tech-icon' : 'c4-node-tech-icon-pending'}
      data-tech-icon={ready ? slug : undefined}
      title={icon?.title}
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 7,
        background: 'color-mix(in srgb, var(--canvas-bg, var(--color-bg-primary)) 62%, transparent)',
        border: `1px solid color-mix(in srgb, ${borderColor} 35%, transparent)`,
      }}
    >
      {ready ? <TechIcon icon={icon} size={16} color={fill} /> : placeholder}
    </span>
  )
}
