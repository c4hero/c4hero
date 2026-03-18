import { useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { generateWorkspaceFromDescription, getAIConfig } from '@/lib/ai'
import { parseDSL } from '@/lib/dsl'
import { X, Sparkles, Loader2 } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'

export default function DescribeSystemDialog({ onClose }: { onClose: () => void }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!description.trim()) return

    const config = getAIConfig()
    if (!config) {
      setError('Please configure your AI API key in settings first.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const dslText = await generateWorkspaceFromDescription(description)
      const { workspace, errors } = parseDSL(dslText)
      if (errors.length > 0) {
        console.warn('AI-generated DSL parse warnings:', errors)
      }
      if (workspace) {
        if (!workspace.name) workspace.name = 'AI-Generated Workspace'
        loadWorkspace(workspace)
        onClose()
      } else {
        setError('Failed to parse AI-generated model. Try rephrasing your description.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="Describe your system"
      className="relative w-full max-w-lg rounded-xl border p-6 shadow-2xl"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
          <h2 className="text-base font-semibold">Describe your system</h2>
        </div>
        <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close dialog">
          <X size={16} />
        </button>
      </div>

      <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Describe your software system in plain English. AI will generate a C4 architecture model from your description.
      </p>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. An e-commerce platform with a React frontend, Node.js API, PostgreSQL database, and Stripe for payments. Customers browse products and make purchases. Admins manage inventory."
        aria-label="System description"
        rows={5}
        className="w-full resize-none rounded-lg border p-3 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
        style={{
          background: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
        disabled={loading}
      />

      {error && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleGenerate}
          disabled={!description.trim() || loading}
          className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Generate model
            </>
          )}
        </button>
      </div>
    </DialogShell>
  )
}
