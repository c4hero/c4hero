import { useState, useEffect, useRef } from 'react'
import { Download, Copy, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ExportTheme } from '@/lib/exportUtils'
import { createLogger } from '@/lib/logger'
import DialogShell from '@/components/shared/DialogShell'

const log = createLogger('ExportDialog')

interface ExportDialogProps {
  onExport: (format: 'dsl' | 'png' | 'svg', theme?: ExportTheme) => Promise<void>
  onCopy: (type: 'png-dark' | 'png-light' | 'png-current' | 'dsl') => Promise<void>
  onClose: () => void
}

interface ExportAction {
  id: string
  icon: LucideIcon
  label: string
  fn: () => Promise<void>
}

export default function ExportDialog({ onExport, onCopy, onClose }: ExportDialogProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current)
  }, [])

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(key)
    try {
      await fn()
      setDone(key)
      if (doneTimer.current) clearTimeout(doneTimer.current)
      doneTimer.current = setTimeout(() => setDone((d) => (d === key ? null : d)), 1500)
    } catch (err) {
      log.warn('Export action failed', err)
    } finally {
      setBusy(null)
    }
  }

  function renderButton({
    id,
    icon: Icon,
    label,
    fn,
  }: ExportAction) {
    const isLoading = busy === id
    const isDone = done === id
    return (
      <button
        key={id}
        onClick={() => act(id, fn)}
        disabled={!!busy}
        title={label}
        aria-label={label}
        aria-busy={isLoading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          background: isDone ? 'var(--color-tint-success)' : 'var(--color-surface-2)',
          color: isDone ? 'var(--color-success)' : 'var(--color-text-secondary)',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
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
    actions: ExportAction[]
  }> = [
    {
      label: 'PNG Image',
      ext: '.png',
      actions: [
        { id: 'dl-current-.png', icon: Download, label: 'Current',  fn: () => onExport('png', 'current') },
        { id: 'dl-dark-.png',    icon: Download, label: 'Dark',     fn: () => onExport('png', 'dark') },
        { id: 'dl-light-.png',   icon: Download, label: 'Light',    fn: () => onExport('png', 'light') },
        { id: 'cp-current-.png', icon: Copy,     label: 'Copy Current', fn: () => onCopy('png-current') },
        { id: 'cp-dark-.png',    icon: Copy,     label: 'Copy Dark',    fn: () => onCopy('png-dark') },
        { id: 'cp-light-.png',   icon: Copy,     label: 'Copy Light',   fn: () => onCopy('png-light') },
      ],
    },
    {
      label: 'SVG Vector',
      ext: '.svg',
      actions: [
        { id: 'dl-current-.svg', icon: Download, label: 'Current', fn: () => onExport('svg', 'current') },
        { id: 'dl-dark-.svg',    icon: Download, label: 'Dark',    fn: () => onExport('svg', 'dark') },
        { id: 'dl-light-.svg',   icon: Download, label: 'Light',   fn: () => onExport('svg', 'light') },
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
  ]

  return (
    <DialogShell onClose={onClose} ariaLabel="Export workspace" position="shade">
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
                {row.actions.map(renderButton)}
              </div>
            </div>
          ))}
        </div>
    </DialogShell>
  )
}
