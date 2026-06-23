import { useState } from 'react'
import { X, KeyRound, ExternalLink, ShieldCheck } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useAiSettingsStore } from '@/store/ai-settings'
import { AI_PROVIDER_IDS, AI_PROVIDER_META, type AiProviderId } from '@/lib/ai'

export default function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const enabled = useAiSettingsStore((s) => s.enabled)
  const provider = useAiSettingsStore((s) => s.provider)
  const apiKeys = useAiSettingsStore((s) => s.apiKeys)
  const models = useAiSettingsStore((s) => s.models)
  const update = useAiSettingsStore((s) => s.update)
  const setApiKey = useAiSettingsStore((s) => s.setApiKey)
  const setModel = useAiSettingsStore((s) => s.setModel)

  const [reveal, setReveal] = useState(false)
  const meta = AI_PROVIDER_META[provider]
  const modelListId = `ai-models-${provider}`

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="AI Settings"
      style={{
        width: 460,
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

        {/* Provider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Provider</div>
          <select
            value={provider}
            onChange={(e) => update({ provider: e.target.value as AiProviderId })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {AI_PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>{AI_PROVIDER_META[id].label}</option>
            ))}
          </select>
        </div>

        {/* API key (per provider) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>{meta.keyLabel}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={reveal ? 'text' : 'password'}
              value={apiKeys[provider] ?? ''}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={meta.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            <button onClick={() => setReveal((r) => !r)} className="btn-secondary" style={{ fontSize: 'var(--text-xs)', padding: '0 10px' }}>
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <a
            href={meta.keyHelpUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-accent)' }}
          >
            {meta.keyHelpLabel} <ExternalLink size={11} />
          </a>
        </div>

        {/* Model (free text + suggestions) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Model</div>
          <input
            list={modelListId}
            value={models[provider] ?? ''}
            onChange={(e) => setModel(e.target.value)}
            placeholder={meta.defaultModel}
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
          <datalist id={modelListId}>
            {meta.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </datalist>
          <div style={descStyle}>Pick a suggestion or type any model id this provider supports.</div>
        </div>

        {/* Privacy note */}
        <div style={noteStyle}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Your key is stored only in this browser and is sent only to {meta.label}
            {' '}(<code>{meta.endpointHost}</code>), directly from your device. c4hero has no
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
