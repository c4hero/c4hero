import { Component, type ReactNode } from 'react'
import { createLogger } from '@/lib/logger'

const log = createLogger('ErrorBoundary:root')

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('Uncaught error', { error, componentStack: info.componentStack })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 16,
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#0a0f14',
          color: '#c9d1d9',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: '#8b949e', maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
          An unexpected error occurred. Your workspace data is preserved in local storage.
        </p>
        <pre
          style={{
            fontSize: 12,
            padding: 12,
            borderRadius: 8,
            background: '#161b22',
            border: '1px solid #30363d',
            maxWidth: 500,
            overflow: 'auto',
            color: '#f85149',
          }}
        >
          {this.state.error?.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid #30363d',
            background: '#21262d',
            color: '#c9d1d9',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Reload page
        </button>
      </div>
    )
  }
}
