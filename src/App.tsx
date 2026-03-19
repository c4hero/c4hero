import { lazy, Suspense, useEffect } from 'react'
import LoadingDot from '@/components/shared/LoadingDot'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useRouteSync } from '@/hooks/useRouteSync'
import FloatingTopPill from '@/components/layout/FloatingTopPill'
import FloatingToolRail from '@/components/layout/FloatingToolRail'
import FloatingViewsPanel from '@/components/layout/FloatingViewsPanel'
import FloatingInspector from '@/components/layout/FloatingInspector'
import FloatingBottomStrip from '@/components/layout/FloatingBottomStrip'
import FloatingZoomHud from '@/components/layout/FloatingZoomHud'
import MultiSelectBar from '@/components/layout/MultiSelectBar'
import Canvas from '@/components/canvas/Canvas'

import CanvasHints from '@/components/canvas/CanvasHints'
import { loadFromLocalStorage } from '@/lib/fileIO'

const SearchDialog = lazy(() => import('@/components/search/SearchDialog'))
const WelcomeScreen = lazy(() => import('@/components/welcome/WelcomeScreen'))

export default function App() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const searchOpen = useWorkspaceStore((s) => s.searchOpen)

  const presentationMode = useWorkspaceStore((s) => s.presentationMode)
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)

  // Keyboard shortcuts + auto-save + URL sync
  useKeyboardShortcuts()
  useAutoSave()
  useRouteSync()

  // Check for crash recovery on mount — only if URL indicates a workspace was open
  useEffect(() => {
    const isWorkspaceRoute = window.location.pathname.startsWith('/workspace')
    if (!isWorkspaceRoute) return
    const recovered = loadFromLocalStorage()
    if (recovered && !workspace) {
      loadWorkspace(recovered)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!workspace) {
    return <Suspense fallback={<LoadingDot />}><WelcomeScreen /></Suspense>
  }

  // Presentation mode — fullscreen canvas
  if (presentationMode) {
    return (
      <ReactFlowProvider>
        <div className="h-full w-full" style={{ background: 'var(--color-bg-primary)' }}>
          <Canvas />
          <div
            className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs"
            style={{
              background: 'rgba(13, 17, 23, 0.9)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
              backdropFilter: 'blur(8px)',
            }}
          >
            Press <kbd className="mx-1 rounded border px-1" style={{ borderColor: 'var(--color-border)' }}>Esc</kbd> or <kbd className="mx-1 rounded border px-1" style={{ borderColor: 'var(--color-border)' }}>F</kbd> to exit
          </div>
        </div>
      </ReactFlowProvider>
    )
  }

  return (
    <ReactFlowProvider>
      <a href="#c4hero-canvas" className="sr-only">
        Skip to main content
      </a>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-primary)' }}>
        {/* Canvas fills entire viewport */}
        <main id="c4hero-canvas" aria-label="Architecture diagram canvas" style={{ position: 'absolute', inset: 0 }}>
          <Canvas />
        </main>

        {/* Floating chrome overlays */}
        <nav aria-label="Workspace navigation">
          <FloatingTopPill />
        </nav>
        <MultiSelectBar />
        <nav aria-label="Tools">
          <FloatingToolRail />
        </nav>
        <FloatingViewsPanel />
        <aside aria-label="Element inspector">
          <FloatingInspector />
        </aside>
        <FloatingBottomStrip />
        <FloatingZoomHud />
        <CanvasHints />

        {/* Live region for announcements */}
        <div id="c4hero-live" aria-live="polite" aria-atomic="true" className="sr-only" />
      </div>

      {/* Dialogs */}
      {searchOpen && <Suspense fallback={<LoadingDot />}><SearchDialog /></Suspense>}

    </ReactFlowProvider>
  )
}
