import { useEffect, useRef } from 'react'
import { useWorkspaceStore, allViewsOf } from '@/store/workspace'

/**
 * Syncs URL path with workspace/view state:
 *   /                    → welcome screen
 *   /workspace           → canvas, first view
 *   /workspace/:viewKey  → canvas, specific view
 *
 * - Pushing URL on view change (replaceState for initial load, pushState for user navigation)
 * - Listening to popstate for browser back/forward
 */
export function useRouteSync() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const isInitialSync = useRef(true)

  // On mount: if URL has a view key, apply it to state
  useEffect(() => {
    const path = window.location.pathname
    const match = path.match(/^\/workspace(?:\/(.+))?$/)
    if (match) {
      const viewKeyFromUrl = match[1] ? decodeURIComponent(match[1]) : null
      const store = useWorkspaceStore.getState()
      if (store.workspace && viewKeyFromUrl && viewKeyFromUrl !== store.activeViewKey) {
        // Verify the view exists
        const allViews = allViewsOf(store.workspace)
        if (allViews.some(v => v.key === viewKeyFromUrl)) {
          setActiveView(viewKeyFromUrl)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync state → URL
  useEffect(() => {
    let targetPath: string

    if (!workspace) {
      targetPath = '/'
    } else if (activeViewKey) {
      targetPath = `/workspace/${encodeURIComponent(activeViewKey)}`
    } else {
      targetPath = '/workspace'
    }

    if (window.location.pathname !== targetPath) {
      if (isInitialSync.current) {
        window.history.replaceState(null, '', targetPath)
      } else {
        window.history.pushState(null, '', targetPath)
      }
    }
    isInitialSync.current = false
  }, [workspace, activeViewKey])

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    function handlePopState() {
      const path = window.location.pathname
      const store = useWorkspaceStore.getState()

      if (path === '/') {
        if (store.workspace) {
          store.closeWorkspace()
        }
        return
      }

      const match = path.match(/^\/workspace(?:\/(.+))?$/)
      if (!match || !store.workspace) return

      const viewKey = match[1] ? decodeURIComponent(match[1]) : null
      if (viewKey && viewKey !== store.activeViewKey) {
        const allViews = allViewsOf(store.workspace)
        if (allViews.some(v => v.key === viewKey)) {
          // Use setState directly to avoid pushing another history entry
          useWorkspaceStore.setState({
            activeViewKey: viewKey,
            selectedElementIds: [],
            selectedRelationshipId: null,
          })
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
}
