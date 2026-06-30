import { useCallback, useState } from 'react'

// Session-scoped resume cache for the AI assistant. Keeps an in-progress flow
// (the sweep queue/drafts, the interview transcript) alive across close→reopen
// within a session. Module-level so it survives the panel unmounting; cleared on
// commit, on returning Home, and when a different workspace loads. Never
// serialized — a half-finished interview shouldn't outlive a reload.

const AI_SESSION = new Map<string, unknown>()

/** Clear the whole cache, or just the keys under `prefix` (e.g. "sweep"). */
export function clearAiSession(prefix?: string): void {
  if (!prefix) { AI_SESSION.clear(); return }
  for (const k of [...AI_SESSION.keys()]) if (k.startsWith(prefix)) AI_SESSION.delete(k)
}

/** Drop the whole cache when the active diagram changes, so one model's
 *  in-progress flow can never resume on top of another. `key` must be a STABLE,
 *  unique diagram identifier (the route, not the workspace name). Synchronous
 *  (call it in render before the persistent reads) so there's no stale flash. */
export function ensureSessionForWorkspace(key: string | null): void {
  if (AI_SESSION.get('__ws') !== key) {
    AI_SESSION.clear()
    AI_SESSION.set('__ws', key)
  }
}

/** useState whose value is mirrored into the session cache, so it survives
 *  unmount and is restored on the next mount with the same key. */
export function usePersistentState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [v, setV] = useState<T>(() => (AI_SESSION.has(key) ? (AI_SESSION.get(key) as T) : initial))
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setV((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      AI_SESSION.set(key, resolved)
      return resolved
    })
  }, [key])
  return [v, set]
}
