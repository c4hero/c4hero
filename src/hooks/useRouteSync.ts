import { useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useWorkspaceStore, allViewsOf } from '@/store/workspace'
import { getCurrentDirHandle, restoreDirHandleByName, readDSLFile } from '@/lib/folderIO'
import { loadFromLocalStorage } from '@/lib/fileIO'
import { createLogger } from '@/lib/logger'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'

const log = createLogger('routeSync')

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
          selectedGroupId: null,
        })
      } else {
        // Invalid view key in URL — correct it to the current active view
        navigate(buildCanvasPath(activeViewKey), { replace: true })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])
}

/**
 * On hard refresh at a canvas URL, the workspace isn't in memory.
 * Try to restore it from disk: reopen the persisted folder handle by slug,
 * read the workspace's .dsl file (+ sidecar), parse, load, and restore the
 * active view. Only if that fails do we redirect to collection/startup.
 */
export function useRefreshRedirect() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const match = location.pathname.match(/^\/collection\/([^/]+)\/([^/]+)(?:\/(.+))?$/)
    if (!match) return
    if (workspace) return

    const collectionSlug = decodeURIComponent(match[1])
    const workspaceSlug = decodeURIComponent(match[2])
    const urlViewKey = match[3] ? decodeURIComponent(match[3]) : null
    const filename = `${workspaceSlug}.dsl`

    let cancelled = false

    ;(async () => {
      // 1. Restore the folder handle (persisted in IndexedDB)
      const existing = getCurrentDirHandle()
      let handle = existing && existing.name === collectionSlug ? existing : null
      if (!handle) {
        handle = await restoreDirHandleByName(collectionSlug)
      }
      if (cancelled) return

      if (!handle) {
        // FSAPI unavailable (mobile) or permission denied — try localStorage
        const recovered = loadFromLocalStorage()
        if (recovered) {
          useWorkspaceStore.getState().loadWorkspace(recovered)
          if (urlViewKey) {
            const allViews = allViewsOf(recovered)
            if (allViews.some(v => v.key === urlViewKey)) {
              useWorkspaceStore.getState().setActiveView(urlViewKey)
            }
          }
          return
        }
        navigate('/', { replace: true })
        return
      }

      // 2. Read the workspace DSL file (+ sidecar)
      const file = await readDSLFile(filename)
      if (cancelled) return

      if (!file) {
        // File is gone — fall back to collection home
        navigate(`/collection/${collectionSlug}`, { replace: true })
        return
      }

      // 3. Parse, apply sidecar, load into store
      const { workspace: parsed, errors } = parseWorkspaceDocument({
        content: file.content,
        fallbackName: workspaceSlug,
        sidecarJson: file.sidecarJson,
      })
      if (errors.length > 0) log.warn('DSL parse warnings', errors)

      useWorkspaceStore.getState().loadWorkspace(parsed)
      useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)

      // 4. Restore the active view from the URL (loadWorkspace picks the first
      //    view; override it if the URL specifies one that actually exists).
      //    If the key is invalid, the URL will be corrected by the sync effect.
      if (urlViewKey) {
        const allViews = allViewsOf(parsed)
        if (allViews.some(v => v.key === urlViewKey)) {
          useWorkspaceStore.getState().setActiveView(urlViewKey)
        }
        // else: invalid key — activeViewKey remains the first view, and the
        // useRouteSync effect will replace the URL with the correct path
      }
    })().catch((err) => {
      log.error('Refresh recovery failed', err)
      if (!cancelled) navigate('/', { replace: true })
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
