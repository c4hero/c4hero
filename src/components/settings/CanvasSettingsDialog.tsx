import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, ChevronDown } from 'lucide-react'
import { useSettingsStore, type MinimapMode, type ColorTheme } from '@/store/settings'
import DialogShell from '@/components/shared/DialogShell'
import { THEMES, THEME_CANVAS_BACKGROUNDS } from '@/lib/themes'

export default function CanvasSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore()

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="Canvas Settings"
      style={{
        width: 380,
        maxHeight: '80dvh',
        overflowY: 'auto',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        background: 'var(--glass-bg-heavy)',

        boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
      }}
    >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Canvas Settings
          </span>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close dialog"
            style={{ minWidth: 28, minHeight: 28, padding: 4 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Settings */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Color theme */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SettingRow
              label="Color theme"
              description="Default palette for new workspaces and templates"
            >
              <ThemeSwatchPicker
                value={settings.colorTheme}
                onChange={(v) => settings.update({ colorTheme: v })}
              />
            </SettingRow>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                fontSize: 'var(--text-xs-plus)',
                color: 'var(--color-text-primary)',
                lineHeight: 1.4,
              }}
              role="note"
            >
              <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1, marginTop: 1 }}>💡</span>
              <span>
                <strong style={{ color: 'var(--color-accent)' }}>Heads up:</strong>{' '}
                Per-tag styles defined in your workspace override these theme colors. Edit them via{' '}
                <strong>Highlight → Tags → Edit tags</strong>.
              </span>
            </div>
          </div>

          {/* Minimap */}
          <SettingRow
            label="Minimap"
            description="Show the minimap overview on the canvas"
          >
            <SegmentedControl
              options={[
                { value: 'always', label: 'Always' },
                { value: 'auto', label: 'Auto' },
                { value: 'never', label: 'Never' },
              ]}
              value={settings.minimapMode}
              onChange={(v) => settings.update({ minimapMode: v as MinimapMode })}
            />
          </SettingRow>

          {/* Show undo/redo */}
          <SettingRow
            label="Undo / Redo buttons"
            description="Show undo and redo buttons in the top bar"
          >
            <Toggle
              checked={settings.showUndoRedo}
              onChange={(v) => settings.update({ showUndoRedo: v })}
            />
          </SettingRow>

          {/* Show zoom controls */}
          <SettingRow
            label="Zoom controls"
            description="Show zoom in/out and fit-to-screen controls"
          >
            <Toggle
              checked={settings.showZoomControls}
              onChange={(v) => settings.update({ showZoomControls: v })}
            />
          </SettingRow>

          {/* Snap to grid */}
          <SettingRow
            label="Snap to grid"
            description="Snap elements to a 20px grid when dragging"
          >
            <Toggle
              checked={settings.snapToGrid}
              onChange={(v) => settings.update({ snapToGrid: v })}
            />
          </SettingRow>
        </div>

        {/* Footer note */}
        <div
          style={{
            padding: '10px 20px 14px',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-xs-plus)',
            color: 'var(--color-text-muted)',
          }}
        >
          Settings are saved automatically to local storage.
        </div>
    </DialogShell>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {label}
        </div>
        <div style={{ fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)', marginTop: 2 }}>
          {description}
        </div>
      </div>
      {children}
    </div>
  )
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div
      role="radiogroup"
      style={{
        display: 'flex',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '5px 10px',
            fontSize: 'var(--text-xs-plus)',
            fontWeight: 600,
            color: value === opt.value ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
            background: value === opt.value ? 'var(--color-accent)' : 'var(--color-surface-2)',
            cursor: 'pointer',
            transition: 'background 0.12s, color 0.12s',
            border: 'none',
            borderRight: '1px solid var(--color-border)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? 'var(--color-accent)' : 'var(--color-surface-3)',
        border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s, border-color 0.2s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: checked ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          transition: 'left 0.2s, background 0.2s',
        }}
      />
    </button>
  )
}

// ─── Theme picker with color swatches ────────────────────────────────────────

const THEME_LABELS: Record<ColorTheme, string> = {
  readability: 'Readable',
  structurizr: 'Structurizr',
  grayscale: 'Grayscale',
  semantic: 'Semantic',
  slate: 'Slate',
  solarizedDark: 'Solarized Dark',
  monoAccent: 'Mono accent',
  light: 'Light',
  pastel: 'Pastel',
  highContrast: 'High contrast',
  sepia: 'Sepia',
  whiteboard: 'Whiteboard',
}

const THEME_GROUPS: { label: string; themes: ColorTheme[] }[] = [
  {
    label: 'Dark background',
    themes: ['readability', 'structurizr', 'slate', 'solarizedDark', 'semantic', 'grayscale', 'monoAccent'],
  },
  {
    label: 'Light background',
    themes: ['light', 'pastel', 'sepia', 'whiteboard', 'highContrast'],
  },
]

function ThemeSwatch({ theme, size = 'sm' }: { theme: ColorTheme; size?: 'sm' | 'md' }) {
  const styles = THEMES[theme]
  const canvas = THEME_CANVAS_BACKGROUNDS[theme] ?? '#0d1117'
  const isCompact = size === 'sm'
  const dotSize = isCompact ? 5 : 7
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isCompact ? 3 : 4,
        padding: isCompact ? '4px 6px' : '6px 8px',
        borderRadius: 6,
        border: '1px solid color-mix(in srgb, var(--color-border) 70%, transparent)',
        background: canvas,
        flexShrink: 0,
      }}
    >
      {styles.map((s) => (
        <span
          key={s.tag}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: s.stroke,
          }}
        />
      ))}
    </span>
  )
}

function ThemeSwatchPicker({
  value,
  onChange,
}: {
  value: ColorTheme
  onChange: (v: ColorTheme) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number; minWidth: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  function openPopup() {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    setCoords({
      top: r.bottom + 6,
      right: window.innerWidth - r.right,
      minWidth: Math.max(r.width, 240),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (popupRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 8px 5px 5px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-2)',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-xs-plus)',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <ThemeSwatch theme={value} />
        <span>{THEME_LABELS[value]}</span>
        <ChevronDown size={12} style={{ color: 'var(--color-text-muted)' }} />
      </button>
      {open && coords && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right,
            minWidth: coords.minWidth,
            zIndex: 1100,
            padding: 6,
            borderRadius: 12,
            border: '1px solid color-mix(in srgb, var(--color-border) 90%, #000 10%)',
            background: 'var(--color-surface-2)',
            boxShadow: '0 14px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: '60dvh',
            overflowY: 'auto',
          }}
        >
          {THEME_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && (
                <div
                  style={{
                    height: 1,
                    margin: '6px 4px',
                    background: 'color-mix(in srgb, var(--color-border) 60%, transparent)',
                  }}
                />
              )}
              <div
                style={{
                  padding: '6px 10px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-muted)',
                }}
              >
                {group.label}
              </div>
              {group.themes.map((t) => {
                const isSelected = t === value
                return (
                  <button
                    key={t}
                    role="option"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => {
                      onChange(t)
                      setOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '7px 8px',
                      border: 0,
                      borderRadius: 8,
                      background: isSelected
                        ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
                        : 'transparent',
                      color: 'var(--color-text-primary)',
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <ThemeSwatch theme={t} size="md" />
                    <span style={{ flex: 1 }}>{THEME_LABELS[t]}</span>
                    {isSelected && <Check size={14} style={{ color: 'var(--color-accent)' }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
