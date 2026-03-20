import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { createLogger } from './lib/logger'

const log = createLogger('global')

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
