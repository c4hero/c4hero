import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWorkspaceStore, allViewsOf } from '@/store/workspace'
import { getCurrentDirHandle } from '@/lib/folderIO'

/**
 * Syncs URL path ↔ workspace/view state via React Router:
 *   /                    → startup
 *   /collection/:slug    → collection home
 *   /workspace/:viewKey  → canvas, specific view
 */
export function useRouteSync() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const navigate = useNavigate()
  const location = useLocation()
  const isInitialSync = useRef(true)

  // On mount / when workspace becomes available: read view key from URL and apply it
  useEffect(() => {
    if (!workspace) return
    const match = location.pathname.match(/^\/workspace(?:\/(.+))?$/)
    if (!match) return
    const viewKeyFromUrl = match[1] ? decodeURIComponent(match[1]) : null
    if (viewKeyFromUrl && viewKeyFromUrl !== activeViewKey) {
      const allViews = allViewsOf(workspace)
      if (allViews.some(v => v.key === viewKeyFromUrl)) {
        setActiveView(viewKeyFromUrl)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace])

  // Sync state → URL whenever workspace or active view changes
  useEffect(() => {
    if (!workspace) return // App.tsx handles the no-workspace redirect

    const targetPath = activeViewKey
      ? `/workspace/${encodeURIComponent(activeViewKey)}`
      : '/workspace'

    if (location.pathname !== targetPath) {
      if (isInitialSync.current) {
        navigate(targetPath, { replace: true })
      } else {
        navigate(targetPath)
      }
    }
    isInitialSync.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, activeViewKey])

  // Browser back/forward: react-router fires location changes, read the new path
  useEffect(() => {
    if (!workspace) return
    const match = location.pathname.match(/^\/workspace(?:\/(.+))?$/)

    if (!match) {
      // Navigated back to / or /collection — close workspace
      useWorkspaceStore.getState().closeWorkspace()
      return
    }

    const viewKey = match[1] ? decodeURIComponent(match[1]) : null
    if (viewKey && viewKey !== activeViewKey) {
      const allViews = allViewsOf(workspace)
      if (allViews.some(v => v.key === viewKey)) {
        useWorkspaceStore.setState({
          activeViewKey: viewKey,
          selectedElementIds: [],
          selectedRelationshipId: null,
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])
}

/**
 * On a hard refresh of /workspace/:viewKey, the workspace won't be in memory.
 * App.tsx handles crash recovery, but we also need to redirect back to collection
 * or startup if no workspace can be recovered.
 */
export function useRefreshRedirect() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname.startsWith('/workspace') && !workspace) {
      // Give crash recovery a moment, then redirect if still no workspace
      const timer = setTimeout(() => {
        if (!useWorkspaceStore.getState().workspace) {
          const slug = getCurrentDirHandle()?.name
          navigate(slug ? `/collection/${slug}` : '/', { replace: true })
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
