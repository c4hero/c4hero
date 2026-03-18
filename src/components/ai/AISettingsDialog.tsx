import { useState } from 'react'
import { getAIConfig, saveAIConfig, clearAIConfig, type AIProvider } from '@/lib/ai'
import { X, Key, Sparkles } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'

export default function AISettingsDialog({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<AIProvider>(() => getAIConfig()?.provider ?? 'anthropic')
  const [apiKey, setApiKey] = useState(() => getAIConfig()?.apiKey ?? '')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    if (apiKey.trim()) {
      saveAIConfig({ provider, apiKey: apiKey.trim() })
      setSaved(true)
      setTimeout(() => onClose(), 800)
    }
  }

  function handleClear() {
    clearAIConfig()
    setApiKey('')
    setSaved(false)
  }

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="AI Settings"
      className="relative w-full max-w-md rounded-xl border p-6 shadow-2xl"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-border)',
      }}
    >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-base font-semibold">AI Settings</h2>
          </div>
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Provide your own API key to enable AI features. Keys are stored in your browser session and sent directly to the AI provider (Anthropic or OpenAI). They are not sent to c4hero servers.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Provider
            </label>
            <div className="flex gap-2">
              {(['anthropic', 'openai'] as AIProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: provider === p ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                    borderColor: provider === p ? 'var(--color-accent)' : 'var(--color-border)',
                    color: provider === p ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              API Key
            </label>
            <div className="relative">
              <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaved(false) }}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  background: 'var(--color-surface-2)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="text-xs transition-colors hover:underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Clear key
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-30"
            style={{
              background: saved ? 'var(--color-success)' : 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
            }}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
    </DialogShell>
  )
}
