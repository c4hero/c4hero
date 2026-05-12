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
  // Subscribe to just the two scalars we need for the hint condition rather
  // than the entire workspace; live-typing edits to elements never alter the
  // active view's element/relationship counts, so this stops re-rendering
  // once a hint is shown or dismissed.
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const elementCount = useWorkspaceStore((s) =>
    s.workspace && activeViewKey ? (getActiveView(s.workspace, activeViewKey)?.elements.length ?? 0) : 0,
  )
  const relationshipCount = useWorkspaceStore((s) =>
    s.workspace && activeViewKey ? (getActiveView(s.workspace, activeViewKey)?.relationships.length ?? 0) : 0,
  )
  const selectionCount = useWorkspaceStore((s) => s.selectedElementIds.length)
  const [dismissed, setDismissed] = useState(getDismissed)

  function handleDismiss(id: string) {
    dismiss(id)
    setDismissed((prev) => new Set(prev).add(id))
  }

  if (!activeViewKey) return null

  // First element added — connection hint
  if (elementCount >= 2 && relationshipCount === 0 && !dismissed.has('connect-hint')) {
    return (
      <Hint id="connect-hint" onDismiss={handleDismiss}>
        Drag from a node edge to another node to create a connection
      </Hint>
    )
  }

  // Delete-semantics hint — shown on first selection so the user discovers
  // the Backspace/Shift+Backspace split before they instinctively press
  // Backspace and quietly remove a node from the view (vs. the old behavior
  // of confirm-and-destroy).
  if (selectionCount > 0 && !dismissed.has('backspace-semantics-v2')) {
    return (
      <Hint id="backspace-semantics-v2" onDismiss={handleDismiss}>
        Backspace removes from this view · Shift+Backspace deletes from the model
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

