import { useEffect, useSyncExternalStore } from 'react'
import type { TECH_ICON_CATALOG } from './catalog'
import { createLogger } from '@/lib/logger'

export type TechIconCatalog = typeof TECH_ICON_CATALOG

// One catalog per page load, shared by every node. Loaded on first use so
// workspaces that never show an icon never fetch the paths.
const log = createLogger('techIcons')

let catalog: TechIconCatalog | null = null
let pending: Promise<TechIconCatalog | null> | null = null
const listeners = new Set<() => void>()

export function loadTechIconCatalog(): Promise<TechIconCatalog | null> {
  if (catalog) return Promise.resolve(catalog)
  pending ??= import('./catalog').then(
    (mod) => {
      catalog = mod.TECH_ICON_CATALOG
      for (const listener of listeners) listener()
      return catalog
    },
    (err: unknown) => {
      // A failed chunk fetch (offline, stale deploy) leaves nodes on their
      // type glyph; the next caller retries.
      pending = null
      log.warn('Technology icons failed to load', { error: String(err) })
      return null
    },
  )
  return pending
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const snapshot = () => catalog

/** True once the catalog has loaded in this page. */
export function isTechIconCatalogLoaded(): boolean {
  return catalog !== null
}

/** The icon catalog, or null until it has loaded. Pass `wanted: false` to
 *  read it without starting a load (nothing on screen needs an icon). */
export function useTechIconCatalog(wanted = true): TechIconCatalog | null {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    if (wanted && !current) void loadTechIconCatalog()
  }, [wanted, current])
  return current
}

/** Set on a node whose logo is known but whose catalog hasn't arrived yet. */
export const TECH_ICON_PENDING_ATTR = 'data-tech-icon-pending'

/**
 * Wait until no node in `root` is still waiting for its logo (TEA-385). An
 * image export captures the DOM as it stands, so one started straight after
 * a workspace opens could catch the type glyph instead of the logo. Returns
 * at once when nothing is pending, so workspaces without logos never load
 * the catalog just to export.
 */
export async function settleTechIcons(root: ParentNode = document): Promise<void> {
  if (!root.querySelector(`[${TECH_ICON_PENDING_ATTR}]`)) return
  await loadTechIconCatalog()
  // Let React commit the re-render the catalog triggers. Two frames, with a
  // timeout in case frames are paused (a background tab).
  await Promise.race([
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    new Promise<void>((resolve) => setTimeout(resolve, 150)),
  ])
}
