import { useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useWorkspaceStore, allViewsOf } from '@/store/workspace'
import { getCurrentDirHandle } from '@/lib/folderIO'

/**
 * URL pattern:
 *   /                                       → startup
 *   /collection/:slug                       → collection home
 *   /collection/:slug/:workspaceSlug        → canvas (first view)
 *   /collection/:slug/:workspaceSlug/:view  → canvas (specific view)
 */

function buildCanvasPath(viewKey?: string | null): string {
  const collectionSlug = getCurrentDirHandle()?.name ?? 'workspace'
  const wsFilename = useWorkspaceStore.getState().activeWorkspaceFilename ?? 'workspace'
  const wsSlug = wsFilename.replace(/\.dsl$/, '')
  const base = `/collection/${collectionSlug}/${wsSlug}`
  return viewKey ? `${base}/${encodeURIComponent(viewKey)}` : base
}

export function useRouteSync() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const navigate = useNavigate()
  const location = useLocation()
  const { viewKey: urlViewKey } = useParams<{ viewKey?: string }>()
  const isInitialSync = useRef(true)

  // On mount / workspace load: apply view key from URL
  useEffect(() => {
    if (!workspace) return
    if (urlViewKey) {
      const decoded = decodeURIComponent(urlViewKey)
      if (decoded !== activeViewKey) {
        const allViews = allViewsOf(workspace)
        if (allViews.some(v => v.key === decoded)) {
          setActiveView(decoded)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace])

  // Sync state → URL when view changes
  useEffect(() => {
    if (!workspace) return
    const targetPath = buildCanvasPath(activeViewKey)
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

  // React to location changes (browser back/forward)
  useEffect(() => {
    if (!workspace) return

    // Check if we navigated away from canvas
    const match = location.pathname.match(/^\/collection\/[^/]+\/[^/]+(?:\/(.+))?$/)
    if (!match) {
      // Navigated to / or /collection/:slug — close workspace
      useWorkspaceStore.getState().closeWorkspace()
      return
    }

    const viewFromUrl = match[1] ? decodeURIComponent(match[1]) : null
    if (viewFromUrl && viewFromUrl !== activeViewKey) {
      const allViews = allViewsOf(workspace)
      if (allViews.some(v => v.key === viewFromUrl)) {
        useWorkspaceStore.setState({
          activeViewKey: viewFromUrl,
          selectedElementIds: [],
          selectedRelationshipId: null,
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])
}

/**
 * On hard refresh at a canvas URL, the workspace won't be in memory yet.
 * Redirect back to collection or startup after a brief wait.
 */
export function useRefreshRedirect() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const isCanvasPath = location.pathname.match(/^\/collection\/[^/]+\/[^/]+/)
    if (isCanvasPath && !workspace) {
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
