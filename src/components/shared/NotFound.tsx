import { Link } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'

export default function NotFound() {
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
        background: 'var(--color-tint-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Compass size={22} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          404
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          This view doesn't exist
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
          The page you're looking for may have been renamed, moved, or the link is just off. Your workspace is safe.
        </div>
      </div>
      <Link
        to="/"
        style={{
          height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--color-accent)', color: '#fff',
          fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Home size={14} />
        Back to start
      </Link>
    </div>
  )
}
