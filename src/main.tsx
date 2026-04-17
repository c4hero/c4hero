import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { createLogger, addTransport, type LogEntry } from './lib/logger'
import { useWorkspaceStore } from './store/workspace'
import { createBigBankSample, createBlankWorkspace } from './lib/templates'

const log = createLogger('global')

// Test helpers — only exposed in dev mode for E2E tests
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__testLoadSample = () => {
    useWorkspaceStore.getState().loadWorkspace(createBigBankSample())
  }
  ;(window as unknown as Record<string, unknown>).__testLoadBlank = () => {
    useWorkspaceStore.getState().loadWorkspace(createBlankWorkspace())
  }
  ;(window as unknown as Record<string, unknown>).__testGetWorkspace = () => {
    return useWorkspaceStore.getState().workspace
  }
  ;(window as unknown as Record<string, unknown>).__testRelayout = (direction?: 'TB' | 'BT' | 'LR' | 'RL') => {
    const s = useWorkspaceStore.getState()
    if (s.activeViewKey) s.resetAndRelayout(s.activeViewKey, direction)
  }
  ;(window as unknown as Record<string, unknown>).__testAddGroup = (name: string, ids: string[]) => {
    return useWorkspaceStore.getState().addGroup(name, ids)
  }
  ;(window as unknown as Record<string, unknown>).__testSetView = (key: string) => {
    useWorkspaceStore.getState().setActiveView(key)
  }
  ;(window as unknown as Record<string, unknown>).__testParseAndLoad = async (dsl: string) => {
    const mod = await import('./lib/dsl')
    const { workspace } = mod.parseDSL(dsl)
    if (!workspace.name) workspace.name = 'test'
    useWorkspaceStore.getState().loadWorkspace(workspace)
  }
}

// Global unhandled error handlers
window.addEventListener('error', (e) => {
  log.error('Unhandled error', e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  log.error('Unhandled promise rejection', e.reason)
})

// Optional remote log transport. Activates only when VITE_LOG_ENDPOINT is set
// at build time. Batches warn/error entries and flushes via sendBeacon so errors
// survive page unload. Entries include the session correlation ID from the logger.
const remoteEndpoint = import.meta.env.VITE_LOG_ENDPOINT as string | undefined
if (remoteEndpoint) {
  const buffer: LogEntry[] = []
  const flush = () => {
    if (buffer.length === 0) return
    const batch = buffer.splice(0)
    try { navigator.sendBeacon(remoteEndpoint, JSON.stringify(batch)) } catch { /* noop */ }
  }
  addTransport((entry) => {
    if (entry.level === 'warn' || entry.level === 'error') buffer.push(entry)
  })
  setInterval(flush, 5_000)
  window.addEventListener('pagehide', flush)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
