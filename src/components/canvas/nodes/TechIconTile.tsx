import TechIcon from '@/components/shared/TechIcon'
import type { TechIconData } from '@/lib/techIcons/catalog'
import type { TechIconSlug } from '@/lib/techIcons/registry'

/** The 28px logo tile that replaces a node's type glyph. */
export default function TechIconTile({ slug, icon, fill, borderColor }: {
  slug: TechIconSlug
  icon: TechIconData
  fill: string
  borderColor: string
}) {
  return (
    <span
      className="c4-node-tech-icon"
      data-tech-icon={slug}
      title={icon.title}
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
      <TechIcon icon={icon} size={16} color={fill} />
    </span>
  )
}
