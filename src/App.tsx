import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import LoadingDot from '@/components/shared/LoadingDot'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useRouteSync, useRefreshRedirect } from '@/hooks/useRouteSync'
import FloatingTopPill from '@/components/layout/FloatingTopPill'
import FloatingToolRail from '@/components/layout/FloatingToolRail'
import FloatingViewsPanel from '@/components/layout/FloatingViewsPanel'
import FloatingInspector from '@/components/layout/FloatingInspector'
import FloatingBottomStrip from '@/components/layout/FloatingBottomStrip'
import FloatingZoomHud from '@/components/layout/FloatingZoomHud'
import MultiSelectBar from '@/components/layout/MultiSelectBar'
import ConfirmDeleteDialog from '@/components/shared/ConfirmDeleteDialog'
import ZoomConfirmDialog from '@/components/shared/ZoomConfirmDialog'
import Canvas from '@/components/canvas/Canvas'
import CanvasHints from '@/components/canvas/CanvasHints'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import NotFound from '@/components/shared/NotFound'
import { loadFromLocalStorage } from '@/lib/fileIO'
import { restoreDirHandle, getCurrentDirHandle } from '@/lib/folderIO'

const SearchDialog = lazy(() => import('@/components/search/SearchDialog'))
const WelcomeScreen = lazy(() => import('@/components/welcome/WelcomeScreen'))

export default function App() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const searchOpen = useWorkspaceStore((s) => s.searchOpen)
  const pendingDelete = useWorkspaceStore((s) => s.pendingDelete)
  const cancelDelete = useWorkspaceStore((s) => s.cancelDelete)
  const presentationMode = useWorkspaceStore((s) => s.presentationMode)
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const navigate = useNavigate()
  const location = useLocation()

  useKeyboardShortcuts()
  useAutoSave()
  useRouteSync()
  useRefreshRedirect()

  // Restore persisted dir handle on mount
  useEffect(() => {
    restoreDirHandle().catch(() => {})
  }, [])

  // Crash recovery: landing on /workspace/* with no in-memory workspace
  useEffect(() => {
    if (!location.pathname.startsWith('/workspace')) return
    const recovered = loadFromLocalStorage()
    if (recovered && !workspace) loadWorkspace(recovered)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

    // When workspace loads while not on a canvas route, navigate there
  useEffect(() => {
    if (workspace && !location.pathname.match(/\/collection\/[^/]+\/[^/]+/)) {
      const slug = getCurrentDirHandle()?.name ?? 'workspace'
      const wsFilename = useWorkspaceStore.getState().activeWorkspaceFilename ?? 'workspace'
      const wsSlug = wsFilename.replace(/\.dsl$/, '')
      navigate(`/collection/${slug}/${wsSlug}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace])

  // Canvas element shared between the with- and without-viewKey canvas routes
  const canvasElement = workspace ? (
    <ReactFlowProvider>
      <a href="#c4hero-canvas" className="sr-only">Skip to main content</a>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-primary)' }}>
        <main id="c4hero-canvas" aria-label="Architecture diagram canvas" style={{ position: 'absolute', inset: 0 }}>
          <ErrorBoundary label="Canvas error" onHome={() => useWorkspaceStore.getState().closeWorkspace()}>
            <Canvas />
          </ErrorBoundary>
        </main>
        <nav aria-label="Workspace navigation"><FloatingTopPill /></nav>
        <MultiSelectBar />
        <nav aria-label="Tools"><FloatingToolRail /></nav>
        <FloatingViewsPanel />
        <aside aria-label="Element inspector"><FloatingInspector /></aside>
        <FloatingBottomStrip />
        <FloatingZoomHud />
        <CanvasHints />
        <div id="c4hero-live" aria-live="polite" aria-atomic="true" className="sr-only" />
        <div className="commit-hash">{__COMMIT_HASH__}</div>
      </div>
      {searchOpen && <Suspense fallback={<LoadingDot />}><SearchDialog /></Suspense>}
    </ReactFlowProvider>
  ) : (
    <Suspense fallback={<LoadingDot />}>
      <LoadingDot />
    </Suspense>
  )

  // Presentation mode — fullscreen canvas
  if (presentationMode && workspace) {
    return (
      <ReactFlowProvider>
        <div className="h-full w-full" style={{ background: 'var(--color-bg-primary)' }}>
          <ErrorBoundary label="Canvas error" onHome={() => useWorkspaceStore.getState().closeWorkspace()}>
            <Canvas />
          </ErrorBoundary>
          <div
            className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs"
            style={{
              background: 'rgba(13, 17, 23, 0.9)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',

            }}
          >
            Press <kbd className="mx-1 rounded border px-1" style={{ borderColor: 'var(--color-border)' }}>Esc</kbd> or <kbd className="mx-1 rounded border px-1" style={{ borderColor: 'var(--color-border)' }}>F</kbd> to exit
          </div>
        </div>
      </ReactFlowProvider>
    )
  }

  return (
    <>
      <Routes>
        {/* Startup — no collection open */}
        <Route path="/" element={
          <Suspense fallback={<LoadingDot />}>
            <WelcomeScreen initialView="startup" />
          </Suspense>
        } />

        {/* Collection home — folder open, pick/create workspace */}
        <Route path="/collection/:slug" element={
          <Suspense fallback={<LoadingDot />}>
            <WelcomeScreen initialView="collection" />
          </Suspense>
        } />
        <Route path="/collection" element={
          <Suspense fallback={<LoadingDot />}>
            <WelcomeScreen initialView="collection" />
          </Suspense>
        } />

        {/* Canvas — matches /collection/:slug/:ws and /collection/:slug/:ws/:view.
            Two explicit routes (no optional param) — react-router v7's `:viewKey?`
            syntax didn't reliably match when the optional segment was absent. */}
        <Route path="/collection/:collectionSlug/:workspaceSlug" element={canvasElement} />
        <Route path="/collection/:collectionSlug/:workspaceSlug/:viewKey" element={canvasElement} />

        {/* Fallback — friendly 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global confirm-delete dialog — rendered outside routes so it works
          from the welcome/collection screens too (e.g. delete workspace file). */}
      {pendingDelete && (
        <ConfirmDeleteDialog
          message={pendingDelete.message}
          onConfirm={() => { pendingDelete.onConfirm(); cancelDelete() }}
          onCancel={cancelDelete}
        />
      )}

      {/* Zoom-in confirm — shown when a user clicks zoom on an element with
          no existing child view. Offers fast create or "Customize…" for full control. */}
      <ZoomConfirmDialog />
    </>
  )
}
