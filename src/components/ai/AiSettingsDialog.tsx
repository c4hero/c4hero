import { useState } from 'react'
import { X, KeyRound, ExternalLink, ShieldCheck } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useAiSettingsStore, AI_MODELS, type AiModel } from '@/store/ai-settings'

export default function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const apiKey = useAiSettingsStore((s) => s.apiKey)
  const model = useAiSettingsStore((s) => s.model)
  const enabled = useAiSettingsStore((s) => s.enabled)
  const update = useAiSettingsStore((s) => s.update)

  const [reveal, setReveal] = useState(false)

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="AI Settings"
      style={{
        width: 440,
        maxHeight: '85dvh',
        overflowY: 'auto',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        background: 'var(--glass-bg-heavy)',
        boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
      }}
    >
      <div style={headerStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          <KeyRound size={16} /> AI Settings
        </span>
        <button onClick={onClose} className="btn-icon" aria-label="Close dialog" style={{ minWidth: 28, minHeight: 28, padding: 4 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Enable toggle */}
        <label style={rowStyle}>
          <div>
            <div style={labelStyle}>Enable AI features</div>
            <div style={descStyle}>Show the AI assistant and its commands.</div>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
        </label>

        {/* API key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Anthropic API key</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={reveal ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            <button onClick={() => setReveal((r) => !r)} className="btn-secondary" style={{ fontSize: 'var(--text-xs)', padding: '0 10px' }}>
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-accent)' }}
          >
            Get a key from the Anthropic Console <ExternalLink size={11} />
          </a>
        </div>

        {/* Model */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Model</div>
          <select
            value={model}
            onChange={(e) => update({ model: e.target.value as AiModel })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label} — {m.blurb}</option>
            ))}
          </select>
        </div>

        {/* Privacy note */}
        <div style={noteStyle}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Your key is stored only in this browser and is sent only to Anthropic
            (<code>api.anthropic.com</code>), directly from your device. c4hero has no
            server and never sees it. Anyone with access to this browser profile can read it.
          </span>
        </div>
      </div>
    </DialogShell>
  )
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border)',
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, cursor: 'pointer',
}
const labelStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }
const descStyle: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }
const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)',
}
const noteStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
  borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
  fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', lineHeight: 1.45,
}
