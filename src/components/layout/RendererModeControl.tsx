import { useWorkspaceStore } from '@/store/workspace'
export default function RendererModeControl() {
  const mode = useWorkspaceStore(s => s.rendererMode)
  const setMode = useWorkspaceStore(s => s.setRendererMode)
  return <div className="glass-panel" role="group" aria-label="Canvas mode" data-canvas-fit-chrome="top" style={{ position: 'fixed', top: 65, left: '50%', transform: 'translateX(-50%)', zIndex: 45, display: 'flex', padding: 3, borderRadius: 9 }}>
    {(['diagram', 'explore'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, background: mode === value ? 'var(--color-surface-3)' : 'transparent', color: mode === value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{value === 'diagram' ? 'Diagram' : 'Explore'}</button>)}
  </div>
}
