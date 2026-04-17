import { useState, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace'

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </label>
  )
}

export function EditableField({
  value,
  placeholder,
  onCommit,
  onLiveChange,
  multiline,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  value: string
  placeholder?: string
  onCommit: (val: string) => void
  onLiveChange?: (val: string) => void
  multiline?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const inputValue = focused ? draft : value

  const handleChange = (newVal: string) => {
    setDraft(newVal)
    onLiveChange?.(newVal)
  }

  const handleBlur = () => {
    setFocused(false)
    onCommit(inputValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      onCommit(inputValue)
    }
    if (e.key === 'Escape') {
      setDraft(value)
      onLiveChange?.(value)
      ;(e.target as HTMLElement).blur()
    }
  }

  const style = {
    background: focused ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
    borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)',
    color: 'var(--color-text-primary)',
  }

  const focusField = () => {
    setDraft(value)
    setFocused(true)
  }

  if (multiline) {
    return (
      <textarea
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={focusField}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        rows={3}
        className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
        style={style}
      />
    )
  }

  return (
    <input
      type="text"
      value={inputValue}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={focusField}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
      style={style}
    />
  )
}

// ─── Technology Field with autocomplete ─────────────────────────────

/** Collect all unique technology strings from the workspace, with usage counts. */
function useTechnologySuggestions(): { tech: string; count: number }[] {
  const workspace = useWorkspaceStore((s) => s.workspace)
  return useMemo(() => {
    if (!workspace) return []
    const counts = new Map<string, number>()
    const bump = (raw?: string) => {
      if (!raw) return
      for (const t of raw.split(',')) {
        const trimmed = t.trim()
        if (trimmed) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
      }
    }
    for (const sys of workspace.model.softwareSystems) {
      for (const c of sys.containers) {
        bump(c.technology)
        for (const comp of c.components) bump(comp.technology)
      }
    }
    for (const rel of workspace.model.relationships) bump(rel.technology)
    return Array.from(counts.entries())
      .map(([tech, count]) => ({ tech, count }))
      .sort((a, b) => b.count - a.count || a.tech.localeCompare(b.tech))
  }, [workspace])
}

export function TechnologyField({ value, placeholder, onCommit, onLiveChange, 'aria-label': ariaLabel }: {
  value: string
  placeholder?: string
  onCommit: (val: string) => void
  onLiveChange?: (val: string) => void
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const suggestions = useTechnologySuggestions()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputValue = focused ? draft : value

  const parts = inputValue.split(',')
  const currentToken = parts[parts.length - 1].trimStart()
  const alreadyUsed = new Set(parts.slice(0, -1).map((p) => p.trim().toLowerCase()))

  const filtered = currentToken
    ? suggestions.filter(
        (s) => s.tech.toLowerCase().includes(currentToken.toLowerCase()) && !alreadyUsed.has(s.tech.toLowerCase()),
      )
    : suggestions.filter((s) => !alreadyUsed.has(s.tech.toLowerCase()))

  const showDropdown = focused && filtered.length > 0

  const acceptSuggestion = (tech: string) => {
    const prefix = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean)
    const next = [...prefix, tech].join(', ')
    setDraft(next)
    onLiveChange?.(next)
    onCommit(next)
    inputRef.current?.focus()
  }

  const handleChange = (newVal: string) => {
    setDraft(newVal)
    setSelectedIdx(-1)
    onLiveChange?.(newVal)
  }

  const handleBlur = () => {
    setTimeout(() => {
      if (!wrapperRef.current?.contains(document.activeElement)) {
        setFocused(false)
        onCommit(inputValue)
      }
    }, 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setSelectedIdx((prev) => {
        if (e.key === 'ArrowDown') return Math.min(prev + 1, filtered.length - 1)
        return Math.max(prev - 1, -1)
      })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIdx >= 0 && selectedIdx < filtered.length) {
        acceptSuggestion(filtered[selectedIdx].tech)
        setSelectedIdx(-1)
      } else {
        onCommit(inputValue)
      }
      return
    }
    if (e.key === 'Escape') {
      if (showDropdown) {
        setSelectedIdx(-1)
      } else {
        setDraft(value)
        setSelectedIdx(-1)
        onLiveChange?.(value)
        ;(e.target as HTMLElement).blur()
      }
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          setDraft(value)
          setFocused(true)
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
        style={{
          background: focused ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
          borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--glass-bg-heavy)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            maxHeight: 160,
            overflowY: 'auto',
            zIndex: 60,
            backdropFilter: 'blur(12px)',
            padding: '4px 0',
          }}
        >
          {filtered.slice(0, 12).map((s, i) => (
            <button
              key={s.tech}
              onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s.tech) }}
              className="flyout-item"
              style={{
                padding: '5px 10px',
                width: '100%',
                background: i === selectedIdx ? 'var(--glass-overlay-sm)' : undefined,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.tech}
              </span>
              <span style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
