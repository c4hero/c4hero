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

/** The icon catalog, or null until it has loaded. Pass `wanted: false` to
 *  read it without starting a load (nothing on screen needs an icon). */
export function useTechIconCatalog(wanted = true): TechIconCatalog | null {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    if (wanted && !current) void loadTechIconCatalog()
  }, [wanted, current])
  return current
}
