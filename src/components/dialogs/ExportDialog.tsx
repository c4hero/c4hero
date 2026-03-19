import { useState, useEffect } from 'react'
import { Download, Copy, Check, Moon, Sun } from 'lucide-react'
import type { ExportTheme } from '@/lib/exportUtils'

interface ExportDialogProps {
  onExport: (format: 'dsl' | 'json' | 'png' | 'svg', theme?: ExportTheme) => Promise<void>
  onCopy: (type: 'png-dark' | 'png-light' | 'dsl') => Promise<void>
  onClose: () => void
}

export default function ExportDialog({ onExport, onCopy, onClose }: ExportDialogProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key)
    await fn()
    setBusy(null)
    setDone(key)
    setTimeout(() => setDone((d) => (d === key ? null : d)), 1500)
  }

  function Btn({
    id,
    icon: Icon,
    label,
    onClick,
  }: {
    id: string
    icon: typeof Download
    label: string
    onClick: () => Promise<void>
  }) {
    const isLoading = busy === id
    const isDone = done === id
    return (
      <button
        onClick={() => act(id, onClick)}
        disabled={isLoading}
        title={label}
        aria-label={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          background: isDone ? 'rgba(34,197,94,0.12)' : 'var(--color-surface-2)',
          color: isDone ? 'var(--color-success)' : 'var(--color-text-secondary)',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
          cursor: isLoading ? 'wait' : 'pointer',
          flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {isDone ? <Check size={12} /> : <Icon size={12} />}
        {label}
      </button>
    )
  }

  const rows: Array<{
    label: string
    ext: string
    actions: Array<{ id: string; icon: typeof Download; label: string; fn: () => Promise<void> }>
  }> = [
    {
      label: 'PNG Image',
      ext: '.png',
      actions: [
        { id: 'dl-dark-.png',  icon: Download, label: 'Dark',  fn: () => onExport('png', 'dark') },
        { id: 'dl-light-.png', icon: Download, label: 'Light', fn: () => onExport('png', 'light') },
        { id: 'cp-dark-.png',  icon: Copy,     label: 'Copy Dark',  fn: () => onCopy('png-dark') },
        { id: 'cp-light-.png', icon: Copy,     label: 'Copy Light', fn: () => onCopy('png-light') },
      ],
    },
    {
      label: 'SVG Vector',
      ext: '.svg',
      actions: [
        { id: 'dl-dark-.svg',  icon: Download, label: 'Dark',  fn: () => onExport('svg', 'dark') },
        { id: 'dl-light-.svg', icon: Download, label: 'Light', fn: () => onExport('svg', 'light') },
      ],
    },
    {
      label: 'Structurizr DSL',
      ext: '.dsl',
      actions: [
        { id: 'dl-.dsl', icon: Download, label: 'Download', fn: () => onExport('dsl') },
        { id: 'cp-.dsl', icon: Copy,     label: 'Copy',     fn: () => onCopy('dsl') },
      ],
    },
    {
      label: 'Workspace JSON',
      ext: '.json',
      actions: [
        { id: 'dl-.json', icon: Download, label: 'Download', fn: () => onExport('json') },
      ],
    },
  ]

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'var(--color-backdrop)', pointerEvents: 'auto' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export workspace"
        className="shade-panel"
        style={{ zIndex: 49 }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Export
          </span>
        </div>

        {/* Rows */}
        <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {row.label}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {row.ext}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {row.actions.map((a) => (
                  <Btn key={a.id} id={a.id} icon={a.icon} label={a.label} onClick={a.fn} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
