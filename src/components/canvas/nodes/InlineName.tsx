import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'

/** Inline rename: displays name as text, double-click to edit */
export default function InlineName({ elementId, name }: { elementId: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateElement = useWorkspaceStore((s) => s.updateElement)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Sync if name changes externally while not editing
  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) {
      updateElement(elementId, { name: trimmed })
    } else {
      setDraft(name)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="nodrag c4-node-name w-full bg-transparent outline-none border-b"
        style={{ borderColor: 'var(--color-accent)', caretColor: 'var(--color-accent)' }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(name); setEditing(false) }
          e.stopPropagation()
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Rename ${name}`}
      />
    )
  }

  return (
    <div
      className="c4-node-name cursor-text"
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Double-click to rename"
      role="button"
      aria-label={`${name} - double-click to rename`}
    >
      {name}
    </div>
  )
}
