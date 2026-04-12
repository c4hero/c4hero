import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { createLogger } from './lib/logger'
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
}

// Global unhandled error handlers
window.addEventListener('error', (e) => {
  log.error('Unhandled error', e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  log.error('Unhandled promise rejection', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
