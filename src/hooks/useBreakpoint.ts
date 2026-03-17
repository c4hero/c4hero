import { useSyncExternalStore } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

function getBreakpoint(): Breakpoint {
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

let currentBreakpoint = typeof window !== 'undefined' ? getBreakpoint() : ('desktop' as Breakpoint)

const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const next = getBreakpoint()
    if (next !== currentBreakpoint) {
      currentBreakpoint = next
      listeners.forEach((fn) => fn())
    }
  })
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot() {
  return currentBreakpoint
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'desktop' as Breakpoint)
}
