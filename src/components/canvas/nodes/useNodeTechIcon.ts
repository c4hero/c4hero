import { useTechIconCatalog, TECH_ICON_PENDING_ATTR } from '@/lib/techIcons/loader'
import type { TechIconData } from '@/lib/techIcons/catalog'
import { techIconColor, type TechIconSlug } from '@/lib/techIcons/registry'
import { THEME_CANVAS_BACKGROUNDS } from '@/lib/themes'
import { useSettingsStore } from '@/store/settings'

export interface NodeTechIcon {
  /** The logo, once the catalog has loaded. */
  icon?: TechIconData
  /** Brand colour, or `fallbackColor` where the brand colour lacks contrast. */
  fill?: string
  /** Spread onto the node's root: marks it as waiting for its logo, so image
   *  exports wait too (TEA-385). */
  pendingProps: Record<string, string>
}

/** Everything a canvas node needs to draw its technology logo (TEA-381,
 *  TEA-383). Contrast is judged against the canvas, which the tile blends with. */
export function useNodeTechIcon(slug: TechIconSlug | undefined, fallbackColor: string): NodeTechIcon {
  const catalog = useTechIconCatalog(slug !== undefined)
  const canvasBackground = useSettingsStore((s) => THEME_CANVAS_BACKGROUNDS[s.colorTheme] ?? '#0d1117')
  const icon = slug && catalog ? catalog[slug] : undefined
  return {
    icon,
    fill: icon ? techIconColor(icon.hex, canvasBackground, fallbackColor) : undefined,
    pendingProps: slug && !catalog ? { [TECH_ICON_PENDING_ATTR]: '' } : {},
  }
}
