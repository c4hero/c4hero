import { useState, useRef, useEffect, memo } from 'react'
import { useWorkspaceStore } from '@/store/workspace'

/** Inline rename: displays name as text, double-click to edit */
export default memo(function InlineName({ elementId, name, lineClamp, textColor }: { elementId: string; name: string; lineClamp?: number; textColor?: string }) {
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!editing) setDraft(name) }, [name, editing])

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
        className="nodrag c4-node-name c4-inline-rename w-full bg-transparent outline-none border-b"
        style={{
          borderColor: 'var(--node-glow, var(--canvas-selection, var(--color-accent)))',
          caretColor: 'var(--node-glow, var(--canvas-selection, var(--color-accent)))',
        }}
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
      className={`c4-node-name cursor-text${lineClamp ? ` line-clamp-${lineClamp}` : ''}`}
      style={textColor ? { color: textColor } : undefined}
      tabIndex={0}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      onKeyDown={(e) => {
        if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setEditing(true) }
      }}
      title="Double-click or press F2 to rename"
      role="button"
      aria-label={`${name} - press F2 to rename`}
    >
      {name}
    </div>
  )
})
