import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { createLogger, addTransport, type LogEntry } from './lib/logger'
import { normalizeRemoteLogEndpoint } from './lib/remoteLogEndpoint'
import { useWorkspaceStore } from './store/workspace'
import {
  createBigBankSample,
  createBlankWorkspace,
  createMicroservicesTemplate,
  createMonolithTemplate,
  createEventDrivenTemplate,
} from './lib/templates'

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
  ;(window as unknown as Record<string, unknown>).__testDeleteElements = (ids: string[]) => {
    useWorkspaceStore.getState().deleteElements(ids)
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
  ;(window as unknown as Record<string, unknown>).__testLoadTemplate = (name: string) => {
    const load = useWorkspaceStore.getState().loadWorkspace
    switch (name) {
      case 'bigBank':        load(createBigBankSample()); return
      case 'microservices':  load(createMicroservicesTemplate()); return
      case 'monolith':       load(createMonolithTemplate()); return
      case 'eventDriven':    load(createEventDrivenTemplate()); return
      case 'blank':          load(createBlankWorkspace()); return
      default: throw new Error(`Unknown template: ${name}`)
    }
  }
  ;(window as unknown as Record<string, unknown>).__testListViews = () => {
    const ws = useWorkspaceStore.getState().workspace
    if (!ws) return []
    return [
      ...ws.views.systemLandscapeViews.map(v => ({ key: v.key, type: v.type, title: v.title ?? v.key })),
      ...ws.views.systemContextViews.map(v => ({ key: v.key, type: v.type, title: v.title ?? v.key })),
      ...ws.views.containerViews.map(v => ({ key: v.key, type: v.type, title: v.title ?? v.key })),
      ...ws.views.componentViews.map(v => ({ key: v.key, type: v.type, title: v.title ?? v.key })),
    ]
  }
}

// Global unhandled error handlers.
// `e.error` can be null for cross-origin script errors and some synthetic
// events; in that case fall back to the message/filename so we don't log
// a useless "null". Skip entirely when there's nothing actionable at all
// (no error, no message) — those are typically CSP / extension noise.
const BENIGN_ERROR_PATTERNS = [
  // Browsers fire this when a ResizeObserver callback's side-effects trigger
  // another resize within the same frame. Harmless and well-known — see
  // https://github.com/WICG/resize-observer/issues/38. Suppressing here
  // keeps the console (and the remote log buffer) free of churn.
  /ResizeObserver loop/i,
]
function isBenignErrorMessage(msg: unknown): boolean {
  if (typeof msg !== 'string') return false
  return BENIGN_ERROR_PATTERNS.some((p) => p.test(msg))
}
window.addEventListener('error', (e) => {
  if (isBenignErrorMessage(e.message) || isBenignErrorMessage((e.error as Error | undefined)?.message)) return
  if (e.error) {
    log.error('Unhandled error', e.error)
    return
  }
  if (e.message) {
    log.error('Unhandled error', { message: e.message, source: e.filename, line: e.lineno, col: e.colno })
  }
})
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason === undefined || e.reason === null) return
  const msg = (e.reason as { message?: unknown })?.message
  if (isBenignErrorMessage(msg)) return
  log.error('Unhandled promise rejection', e.reason)
})

// Optional remote log transport. Activates only when VITE_LOG_ENDPOINT is set
// at build time. Batches warn/error entries and flushes via sendBeacon so errors
// survive page unload. Entries include the session correlation ID from the logger.
const remoteEndpoint = normalizeRemoteLogEndpoint(import.meta.env.VITE_LOG_ENDPOINT as string | undefined)
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
