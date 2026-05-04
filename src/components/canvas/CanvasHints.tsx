import { useState, useEffect } from 'react'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { X } from 'lucide-react'
import { readJSON, writeJSON } from '@/lib/safeStorage'

const HINTS_DISMISSED_KEY = 'c4hero_hints_dismissed'

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((id) => typeof id === 'string')
}

function getDismissed(): Set<string> {
  return new Set(readJSON<string[]>(HINTS_DISMISSED_KEY, isStringArray, []) ?? [])
}

function dismiss(hintId: string) {
  const set = getDismissed()
  set.add(hintId)
  writeJSON(HINTS_DISMISSED_KEY, [...set])
}

export default function CanvasHints() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const [dismissed, setDismissed] = useState(getDismissed)

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  function handleDismiss(id: string) {
    dismiss(id)
    setDismissed((prev) => new Set(prev).add(id))
  }

  if (!workspace || !view) return null

  // Empty canvas hint suppressed — covered by the canvas empty state overlay

  // First element added — connection hint
  if (view.elements.length >= 2 && view.relationships.length === 0 && !dismissed.has('connect-hint')) {
    return (
      <Hint id="connect-hint" onDismiss={handleDismiss}>
        Drag from a node edge to another node to create a connection
      </Hint>
    )
  }

  return null
}

function Hint({ id, children, onDismiss }: { id: string; children: React.ReactNode; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 500)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div
      className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 px-2 py-1 text-[11px] pointer-events-auto"
      style={{
        color: 'var(--color-text-muted)',
        opacity: 0.55,
        background: 'transparent',
        animation: 'fadeIn 400ms ease',
      }}
    >
      {children}
      <button
        onClick={() => onDismiss(id)}
        className="opacity-40 transition-opacity hover:opacity-80"
        aria-label="Dismiss hint"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        <X size={10} aria-hidden="true" />
      </button>
    </div>
  )
}

