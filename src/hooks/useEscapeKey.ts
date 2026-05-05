import { useEffect } from 'react'

/**
 * Subscribe to document-level Escape keypresses while `active` is true.
 *
 * Centralizes the pattern that was previously hand-rolled in ~15 menus,
 * flyouts, and inline editors. Mirrors the global-Escape handling
 * already living in {@link DialogShell} so the codebase has one source
 * of truth for "Escape closes a transient overlay."
 *
 * The listener is installed only while `active` is true so callers can
 * cheaply guard against firing the handler when the overlay is closed.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onEscape])
}
