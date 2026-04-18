import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, Home } from 'lucide-react'
import { createLogger } from '@/lib/logger'

const log = createLogger('ErrorBoundary')

interface Props {
  children: ReactNode
  /** Label shown in the error UI header */
  label?: string
  /** Called when the user clicks "Try again" */
  onReset?: () => void
  /** Called when the user clicks "Go home" */
  onHome?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Class component error boundary (required by React for componentDidCatch).
 * Catches render errors in its children and shows a recovery UI.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('render error', { error, componentStack: info.componentStack })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-bg-primary)',
          flexDirection: 'column', gap: 16,
          padding: 24, textAlign: 'center',
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--color-tint-error)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <RefreshCw size={22} style={{ color: 'var(--color-error)' }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            {this.props.label ?? 'Something went wrong'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 400, lineHeight: 1.5 }}>
            An unexpected error occurred while rendering. Your work is auto-saved.
          </div>
          {this.state.error && (
            <pre style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: 'var(--color-tint-error)', border: '1px solid var(--color-border-error)',
              fontSize: 11, color: 'var(--color-error)', textAlign: 'left',
              maxWidth: 500, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={this.handleReset}
            style={{
              height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={14} />
            Try again
          </button>
          {this.props.onHome && (
            <button
              onClick={this.props.onHome}
              style={{
                height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--color-accent)', color: '#fff',
                fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Home size={14} />
              Go home
            </button>
          )}
        </div>
      </div>
    )
  }
}
