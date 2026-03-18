import { X } from 'lucide-react'
import { useSettingsStore, type MinimapMode } from '@/store/settings'
import { useFocusTrap } from '@/hooks/useFocusTrap'

export default function CanvasSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore()
  const trapRef = useFocusTrap<HTMLDivElement>()

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(11,18,25,0.5)' }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Canvas Settings"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 101,
          width: 380,
          maxHeight: '80dvh',
          overflowY: 'auto',
          borderRadius: 14,
          border: '1px solid var(--color-border)',
          background: 'rgba(13, 17, 23, 0.96)',
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
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Canvas Settings
          </span>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ minWidth: 28, minHeight: 28, padding: 4 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Settings */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            fontSize: 11,
            color: 'var(--color-text-muted)',
          }}
        >
          Settings are saved automatically to local storage.
        </div>
      </div>
    </>
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
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
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
      style={{
        display: 'flex',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '5px 10px',
            fontSize: 11,
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
