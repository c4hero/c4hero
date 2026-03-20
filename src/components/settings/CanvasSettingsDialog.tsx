import { X } from 'lucide-react'
import { useSettingsStore, type MinimapMode, type ColorTheme } from '@/store/settings'
import DialogShell from '@/components/shared/DialogShell'

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
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
          <SettingRow
            label="Color theme"
            description="Default palette for new workspaces and templates"
          >
            <SegmentedControl
              options={[
                { value: 'readability', label: 'Readable' },
                { value: 'structurizr', label: 'Structurizr' },
              ]}
              value={settings.colorTheme}
              onChange={(v) => settings.update({ colorTheme: v as ColorTheme })}
            />
          </SettingRow>

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
