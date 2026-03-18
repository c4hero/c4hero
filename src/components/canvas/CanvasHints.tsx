import { useState, useEffect } from 'react'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { X } from 'lucide-react'

const HINTS_DISMISSED_KEY = 'c4hero_hints_dismissed'

function getDismissed(): Set<string> {
  try {
    const data = localStorage.getItem(HINTS_DISMISSED_KEY)
    return data ? new Set(JSON.parse(data)) : new Set()
  } catch {
    return new Set()
  }
}

function dismiss(hintId: string) {
  const set = getDismissed()
  set.add(hintId)
  localStorage.setItem(HINTS_DISMISSED_KEY, JSON.stringify([...set]))
}

export default function CanvasHints() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const [dismissed, setDismissed] = useState(getDismissed)

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const isEmpty = view && view.elements.length === 0

  function handleDismiss(id: string) {
    dismiss(id)
    setDismissed(new Set(dismissed).add(id))
  }

  if (!workspace || !view) return null

  // Empty canvas hint
  if (isEmpty && !dismissed.has('empty-canvas')) {
    return (
      <Hint id="empty-canvas" onDismiss={handleDismiss}>
        Press <Kbd>Shift+S</Kbd> to add a system, or use the toolbar on the left
      </Hint>
    )
  }

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
      className="absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2.5 text-xs"
      style={{
        background: 'rgba(13, 17, 23, 0.9)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-secondary)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 300ms ease',
      }}
    >
      {children}
      <button
        onClick={() => onDismiss(id)}
        className="ml-1 opacity-50 transition-opacity hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="mx-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
    >
      {children}
    </kbd>
  )
}
