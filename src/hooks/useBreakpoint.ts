import { useSyncExternalStore } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  let currentBreakpoint = getBreakpoint()
  const handleResize = () => {
    const next = getBreakpoint()
    if (next !== currentBreakpoint) {
      currentBreakpoint = next
      callback()
    }
  }
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}

function getSnapshot() {
  return getBreakpoint()
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'desktop' as Breakpoint)
}
