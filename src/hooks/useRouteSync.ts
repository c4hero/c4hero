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

  // On mount AND whenever workspace becomes available: apply view key from URL
  // This handles the refresh case where crash recovery loads the workspace
  // after the initial mount effect has already run.
  useEffect(() => {
    if (!workspace) return
    const path = window.location.pathname
    const match = path.match(/^\/workspace(?:\/(.+))?$/)
    if (!match) return
    const viewKeyFromUrl = match[1] ? decodeURIComponent(match[1]) : null
    if (viewKeyFromUrl && viewKeyFromUrl !== activeViewKey) {
      const allViews = allViewsOf(workspace)
      if (allViews.some(v => v.key === viewKeyFromUrl)) {
        setActiveView(viewKeyFromUrl)
      }
    }
  // Only run when workspace first becomes available (mount + workspace load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace])

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

      if (path === '/' || path === '/collection') {
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
