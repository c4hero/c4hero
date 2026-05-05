import { RefreshCw, Home } from 'lucide-react'

interface Props {
  /** Optional error details shown in a code block */
  error?: Error | null
  /** Called when the user clicks "Try again". Defaults to reloading the page. */
  onReset?: () => void
  /** Called when the user clicks "Go home". Defaults to navigating to /. */
  onHome?: () => void
}

export default function ServerError({ error, onReset, onHome }: Props) {
  const handleReset = onReset ?? (() => window.location.reload())
  const handleHome = onHome ?? (() => { window.location.href = '/' })

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', inset: 0,
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
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          500
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          Something went wrong on our end
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
          An unexpected error interrupted the app. Your work is auto-saved — try again, or head back to start.
        </div>
        {error && (
          <pre style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'var(--color-tint-error)', border: '1px solid var(--color-border-error)',
            fontSize: 11, color: 'var(--color-error)', textAlign: 'left',
            maxWidth: 500, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {error.message}
          </pre>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleReset}
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
        <button
          onClick={handleHome}
          style={{
            height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--color-accent)', color: '#fff',
            fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Home size={14} />
          Back to start
        </button>
      </div>
    </div>
  )
}
