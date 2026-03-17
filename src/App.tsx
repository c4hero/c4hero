import { useEffect, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAutoSave } from '@/hooks/useAutoSave'
import TopBar from '@/components/layout/TopBar'
import LeftPanel from '@/components/layout/LeftPanel'
import RightPanel from '@/components/layout/RightPanel'
import BottomBar from '@/components/layout/BottomBar'
import Canvas from '@/components/canvas/Canvas'
import Toolbar from '@/components/toolbar/Toolbar'
import SearchDialog from '@/components/search/SearchDialog'
import CanvasHints from '@/components/canvas/CanvasHints'
import WelcomeScreen from '@/components/welcome/WelcomeScreen'
import { loadFromLocalStorage } from '@/lib/fileIO'

export default function App() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const leftPanelOpen = useWorkspaceStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkspaceStore((s) => s.rightPanelOpen)
  const searchOpen = useWorkspaceStore((s) => s.searchOpen)
  const presentationMode = useWorkspaceStore((s) => s.presentationMode)
  const setLeftPanelOpen = useWorkspaceStore((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useWorkspaceStore((s) => s.setRightPanelOpen)
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const breakpoint = useBreakpoint()

  const isOverlay = breakpoint !== 'desktop'

  // Keyboard shortcuts + auto-save
  useKeyboardShortcuts()
  useAutoSave()

  // Auto-close panels when dropping below desktop
  useEffect(() => {
    if (isOverlay) {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
    }
  }, [isOverlay, setLeftPanelOpen, setRightPanelOpen])

  // Check for crash recovery on mount
  useEffect(() => {
    const recovered = loadFromLocalStorage()
    if (recovered && !workspace) {
      // Could prompt user, for now just load it
      loadWorkspace(recovered)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeOverlayPanels = useCallback(() => {
    if (isOverlay) {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
    }
  }, [isOverlay, setLeftPanelOpen, setRightPanelOpen])

  if (!workspace) {
    return <WelcomeScreen />
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
              background: 'rgba(15, 25, 35, 0.9)',
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
      <div className="relative h-full w-full" style={{ background: 'var(--color-bg-primary)' }}>
        {/* Skip to main content link for screen readers */}
        <a href="#main-canvas" className="sr-only focus:not-sr-only focus:fixed focus:z-[200] focus:top-2 focus:left-2 focus:rounded-lg focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium" style={{ color: 'var(--color-bg-primary)' }}>
          Skip to canvas
        </a>

        {/* Canvas fills the entire viewport */}
        <main id="main-canvas" className="absolute inset-0" aria-label="Architecture canvas">
          <Canvas />
          <Toolbar />
          <CanvasHints />
        </main>

        {/* Floating TopBar */}
        <TopBar />

        {/* Floating LeftPanel */}
        {leftPanelOpen && !isOverlay && (
          <nav className="absolute left-3 top-[60px] bottom-[52px] z-30 w-60" aria-label="Workspace navigation">
            <LeftPanel />
          </nav>
        )}
        {leftPanelOpen && isOverlay && (
          <>
            <div className="panel-backdrop fixed inset-0 z-30" onClick={closeOverlayPanels} />
            <nav className="panel-slide-left fixed left-3 top-[60px] bottom-[52px] z-40 w-60" aria-label="Workspace navigation">
              <LeftPanel />
            </nav>
          </>
        )}

        {/* Floating RightPanel */}
        {rightPanelOpen && !isOverlay && (
          <aside className="absolute right-3 top-[60px] bottom-[52px] z-30 w-72 sm:w-64" aria-label="Element properties">
            <RightPanel />
          </aside>
        )}
        {rightPanelOpen && isOverlay && (
          <>
            {!leftPanelOpen && (
              <div className="panel-backdrop fixed inset-0 z-30" onClick={closeOverlayPanels} />
            )}
            <aside className="panel-slide-right fixed right-3 top-[60px] bottom-[52px] z-40 w-72 sm:w-64" aria-label="Element properties">
              <RightPanel />
            </aside>
          </>
        )}

        {/* Floating BottomBar */}
        <BottomBar />
      </div>

      {/* Search dialog */}
      {searchOpen && <SearchDialog />}
    </ReactFlowProvider>
  )
}
