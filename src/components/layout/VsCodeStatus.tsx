import { isVsCodeHost, openVsCodeDocument } from '@/lib/host'
import { useHostStatus, reportHostError } from '@/lib/host/status'

export default function VsCodeStatus() {
  const { error, loading } = useHostStatus()
  if (!isVsCodeHost()) return null
  if (error) return <div role="alert" style={{ position: 'fixed', inset: '0 0 auto', zIndex: 10000, padding: 12, background: 'var(--color-bg-panel)', color: 'var(--color-error)' }}>
    {error} <button onClick={() => window.location.reload()}>Reload from VS Code</button>
  </div>
  if (loading) return <div role="status">Loading architecture from VS Code…</div>
  return <button aria-label="Open another architecture workspace" title="Open another .dsl file in VS Code" onClick={() => void openVsCodeDocument().catch(reportHostError)}
    style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 40, background: 'var(--color-bg-panel)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px' }}>Open workspace…</button>
}
