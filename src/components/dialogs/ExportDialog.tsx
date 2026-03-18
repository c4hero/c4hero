import { useState, useEffect } from 'react'
import { Download, Copy, Check, Moon, Sun } from 'lucide-react'
import type { ExportTheme } from '@/lib/exportUtils'

// ─── Types ────────────────────────────────────────────────────────────

interface ExportDialogProps {
  onExport: (format: 'dsl' | 'json' | 'png' | 'svg', theme?: ExportTheme) => Promise<void>
  onCopy: (type: 'png-dark' | 'png-light' | 'dsl') => Promise<void>
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────

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

  function ActionBtn({
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
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          background: isDone ? 'rgba(34,197,94,0.12)' : 'var(--color-surface-2)',
          color: isDone ? '#22c55e' : 'var(--color-text-secondary)',
          cursor: isLoading ? 'wait' : 'pointer',
          flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isLoading && !isDone) {
            e.currentTarget.style.background = 'var(--color-surface-3)'
            e.currentTarget.style.color = 'var(--color-text-primary)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isDone) {
            e.currentTarget.style.background = 'var(--color-surface-2)'
            e.currentTarget.style.color = 'var(--color-text-secondary)'
          }
        }}
      >
        {isDone ? <Check size={14} /> : <Icon size={14} />}
      </button>
    )
  }

  const rows: Array<{
    label: string
    ext: string
    darkDl?: () => Promise<void>
    lightDl?: () => Promise<void>
    darkCopy?: () => Promise<void>
    lightCopy?: () => Promise<void>
    singleDl?: () => Promise<void>
  }> = [
    {
      label: 'PNG Image',
      ext: '.png',
      darkDl: () => onExport('png', 'dark'),
      lightDl: () => onExport('png', 'light'),
      darkCopy: () => onCopy('png-dark'),
      lightCopy: () => onCopy('png-light'),
    },
    {
      label: 'SVG Vector',
      ext: '.svg',
      darkDl: () => onExport('svg', 'dark'),
      lightDl: () => onExport('svg', 'light'),
    },
    {
      label: 'Structurizr DSL',
      ext: '.dsl',
      singleDl: () => onExport('dsl'),
      darkCopy: () => onCopy('dsl'),
    },
    {
      label: 'Workspace JSON',
      ext: '.json',
      singleDl: () => onExport('json'),
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(11,18,25,0.45)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Shade panel — no position:fixed; inherits pill column width */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export workspace"
        style={{
          zIndex: 49,
          background: 'rgba(13,17,23,0.97)',
          border: '1px solid var(--color-border)',
          borderTop: 'none',
          borderRadius: '0 0 14px 14px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'slideDownFromBar 0.18s cubic-bezier(0.16, 1, 0.3, 1) both',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Export
          </span>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 70px 70px',
            gap: 6,
            padding: '8px 16px 4px',
            alignItems: 'center',
          }}
        >
          <span />
          <ColHeader icon={Download} label="Download" />
          <ColHeader icon={Copy} label="Copy" />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 32px 32px 32px 32px',
            gap: 6,
            padding: '2px 16px 6px',
            alignItems: 'center',
          }}
        >
          <span />
          <ColSubHeader icon={Moon} label="Dark" />
          <ColSubHeader icon={Sun} label="Light" />
          <ColSubHeader icon={Moon} label="Dark" />
          <ColSubHeader icon={Sun} label="Light" />
        </div>

        {/* Rows */}
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 32px 32px 32px 32px',
                gap: 6,
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.label}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{row.ext}</div>
              </div>

              {/* Download dark */}
              {row.darkDl ? (
                <ActionBtn id={`dl-dark-${row.ext}`} icon={Download} label={`Download ${row.label} dark`} onClick={row.darkDl} />
              ) : row.singleDl ? (
                <ActionBtn id={`dl-${row.ext}`} icon={Download} label={`Download ${row.label}`} onClick={row.singleDl} />
              ) : (
                <div style={{ width: 32 }} />
              )}

              {/* Download light */}
              {row.lightDl ? (
                <ActionBtn id={`dl-light-${row.ext}`} icon={Download} label={`Download ${row.label} light`} onClick={row.lightDl} />
              ) : (
                <div style={{ width: 32 }} />
              )}

              {/* Copy dark */}
              {row.darkCopy ? (
                <ActionBtn id={`cp-dark-${row.ext}`} icon={Copy} label={`Copy ${row.label} dark`} onClick={row.darkCopy} />
              ) : (
                <div style={{ width: 32 }} />
              )}

              {/* Copy light */}
              {row.lightCopy ? (
                <ActionBtn id={`cp-light-${row.ext}`} icon={Copy} label={`Copy ${row.label} light`} onClick={row.lightCopy} />
              ) : (
                <div style={{ width: 32 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ColHeader({ icon: Icon, label }: { icon: typeof Download; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
      <Icon size={11} />
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
    </div>
  )
}

function ColSubHeader({ icon: Icon, label }: { icon: typeof Moon; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'var(--color-text-muted)' }} title={label}>
      <Icon size={11} />
      <span style={{ fontSize: 8, letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}
