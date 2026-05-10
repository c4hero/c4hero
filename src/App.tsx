import { lazy, Suspense, useEffect, useState, useRef } from 'react'
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
import BottomHighlighterBar from '@/components/layout/highlighter/BottomHighlighterBar'
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
        <BottomHighlighterBar />
        <FloatingBottomStrip />
        <FloatingZoomHud />
        <CanvasHints />
        <div id="c4hero-live" aria-live="polite" aria-atomic="true" className="sr-only" />
        <div className="commit-hash">v{__APP_VERSION__} · {__COMMIT_HASH__}</div>
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
          <PresentationExitPill />
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
          impact={pendingDelete.impact}
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

function PresentationExitPill() {
  const [visible, setVisible] = useState(true)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function show() {
      setVisible(true)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setVisible(false), 2000)
    }
    show()
    window.addEventListener('mousemove', show)
    window.addEventListener('keydown', show)
    window.addEventListener('touchstart', show)
    return () => {
      window.removeEventListener('mousemove', show)
      window.removeEventListener('keydown', show)
      window.removeEventListener('touchstart', show)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-lg border px-2.5 py-1 text-xs"
      style={{
        background: 'color-mix(in srgb, var(--canvas-bg, var(--color-bg-primary)) 65%, transparent)',
        borderColor: 'color-mix(in srgb, var(--color-border) 50%, transparent)',
        color: 'var(--color-text-muted)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 300ms ease',
      }}
    >
      <kbd className="mr-1 rounded border px-1" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 60%, transparent)' }}>Esc</kbd>
      <span style={{ opacity: 0.7 }}>to exit</span>
    </div>
  )
}
