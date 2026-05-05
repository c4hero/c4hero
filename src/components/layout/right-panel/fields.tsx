import { useState, useMemo, useRef, useEffect } from 'react'
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

export type TechnologyScope = 'element' | 'relationship'

/** Collect unique technology strings from the workspace with usage counts,
 *  partitioned by scope. Element technologies (containers/components) and
 *  relationship technologies are kept separate so the inspector's autocomplete
 *  only suggests values appropriate for what's being edited — e.g. editing a
 *  container won't offer "REST/HTTP" and editing a relationship won't offer
 *  "PostgreSQL". */
function useTechnologySuggestions(scope: TechnologyScope): { tech: string; count: number }[] {
  const workspace = useWorkspaceStore((s) => s.workspace)
  return useMemo(() => {
    if (!workspace) return []
    const counts = new Map<string, { tech: string; count: number }>()
    const bump = (raw?: string) => {
      if (!raw) return
      for (const t of raw.split(',')) {
        const trimmed = t.trim()
        if (!trimmed) continue
        const key = trimmed.toLowerCase()
        const existing = counts.get(key)
        if (existing) {
          existing.count += 1
        } else {
          counts.set(key, { tech: trimmed, count: 1 })
        }
      }
    }
    if (scope === 'element') {
      for (const sys of workspace.model.softwareSystems) {
        for (const c of sys.containers) {
          bump(c.technology)
          for (const comp of c.components) bump(comp.technology)
        }
      }
    } else {
      for (const rel of workspace.model.relationships) bump(rel.technology)
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.tech.localeCompare(b.tech))
  }, [workspace, scope])
}

function splitTokens(s: string): string[] {
  const seen = new Set<string>()
  return s.split(',').flatMap((token): string[] => {
    const trimmed = token.trim()
    if (!trimmed) return []
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

function joinTokens(tokens: string[]): string {
  return splitTokens(tokens.join(',')).join(', ')
}

function appendTechnologyTokens(tokens: string[], rawTokens: string[]): string[] {
  const next = [...tokens]
  const seen = new Set(tokens.map((t) => t.toLowerCase()))
  for (const raw of rawTokens) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
  }
  return next
}

/** Chip-style multi-value input used for element and relationship
 *  `technology`. Committed values render as removable chips; a trailing
 *  input accepts new entries. Enter or comma commits the current draft;
 *  Backspace on an empty draft pops the last chip. Autocomplete pulls
 *  from technologies already in use elsewhere in the workspace. */
export function TechnologyField({ value, placeholder, onCommit, onLiveChange, scope, 'aria-label': ariaLabel }: {
  value: string
  placeholder?: string
  onCommit: (val: string) => void
  onLiveChange?: (val: string) => void
  /** Whether this field edits an element (Container/Component) or a
   *  Relationship. Controls which pool of workspace technologies is offered
   *  as autocomplete suggestions. */
  scope: TechnologyScope
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const suggestions = useTechnologySuggestions(scope)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const tokens = splitTokens(value)
  const alreadyUsed = new Set(tokens.map((t) => t.toLowerCase()))

  const filtered = draft.trim()
    ? suggestions.filter(
        (s) => s.tech.toLowerCase().includes(draft.trim().toLowerCase()) && !alreadyUsed.has(s.tech.toLowerCase()),
      )
    : suggestions.filter((s) => !alreadyUsed.has(s.tech.toLowerCase()))

  const showDropdown = focused && filtered.length > 0

  const commitTokens = (next: string[]) => {
    const joined = joinTokens(next)
    onLiveChange?.(joined)
    onCommit(joined)
  }

  const addToken = (raw: string) => {
    const next = appendTechnologyTokens(tokens, [raw])
    if (next.length !== tokens.length) commitTokens(next)
    setDraft('')
    setSelectedIdx(-1)
  }

  const removeToken = (tech: string) => {
    commitTokens(tokens.filter((t) => t !== tech))
    inputRef.current?.focus()
  }

  const handleDraftChange = (newVal: string) => {
    // Commit immediately on comma
    if (newVal.includes(',')) {
      const parts = newVal.split(',')
      const last = parts.pop() ?? ''
      const next = appendTechnologyTokens(tokens, parts)
      if (next.length !== tokens.length) commitTokens(next)
      setDraft(last.trimStart())
      setSelectedIdx(-1)
      return
    }
    setDraft(newVal)
    setSelectedIdx(-1)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const nextTarget = e.relatedTarget
    if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) return
    setFocused(false)
    if (draft.trim()) addToken(draft)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        addToken(filtered[selectedIdx].tech)
      } else if (draft.trim()) {
        addToken(draft)
      }
      return
    }
    if (e.key === 'Backspace' && draft === '' && tokens.length > 0) {
      e.preventDefault()
      commitTokens(tokens.slice(0, -1))
      return
    }
    if (e.key === 'Escape') {
      if (showDropdown) { setSelectedIdx(-1); return }
      setDraft('')
      ;(e.target as HTMLElement).blur()
    }
  }

  return (
    <div
      ref={wrapperRef}
      onClick={() => inputRef.current?.focus()}
      className="w-full rounded-lg border px-2 py-1.5 text-sm transition-colors"
      style={{
        background: focused ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
        borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)',
        color: 'var(--color-text-primary)',
        cursor: 'text',
        position: 'relative',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        minHeight: 36,
      }}
      aria-label={ariaLabel}
    >
      {tokens.map((t) => (
        <span
          key={t}
          className="c4-type-chip"
          style={{
            background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)',
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            textTransform: 'none',
            letterSpacing: 'normal',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {t}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeToken(t) }}
            aria-label={`Remove ${t}`}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => handleDraftChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={tokens.length === 0 ? placeholder : ''}
        style={{
          flex: 1,
          minWidth: 80,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-text-primary)',
          padding: '2px 4px',
          fontSize: 'inherit',
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
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addToken(s.tech) }}
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

// ─── OwnerField ──────────────────────────────────────────────────────
// Single-select team picker with autocomplete. Mirrors TechnologyField's
// dropdown UX but holds a single value (no chips). Free-text typing
// remains supported so users can introduce a new team without having to
// add it elsewhere first.

function useOwnerSuggestions(): { owner: string; count: number }[] {
  const workspace = useWorkspaceStore((s) => s.workspace)
  return useMemo(() => {
    if (!workspace) return []
    const counts = new Map<string, { owner: string; count: number }>()
    const bump = (raw?: string) => {
      if (!raw) return
      const trimmed = raw.trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      const existing = counts.get(key)
      if (existing) existing.count += 1
      else counts.set(key, { owner: trimmed, count: 1 })
    }
    for (const p of workspace.model.people) bump(p.owner)
    for (const sys of workspace.model.softwareSystems) {
      bump(sys.owner)
      for (const c of sys.containers) {
        bump(c.owner)
        for (const comp of c.components) bump(comp.owner)
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
  }, [workspace])
}

export function OwnerField({ value, placeholder, onCommit, onLiveChange, 'aria-label': ariaLabel }: {
  value: string
  placeholder?: string
  onCommit: (val: string) => void
  onLiveChange?: (val: string) => void
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const suggestions = useOwnerSuggestions()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the draft synced when the underlying value changes externally
  // (e.g. user selected a different element).
  useEffect(() => { setDraft(value) }, [value])

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return suggestions
    return suggestions.filter((s) => s.owner.toLowerCase().includes(q))
  }, [suggestions, draft])

  const showDropdown = focused && filtered.length > 0

  const commit = (next: string) => {
    const trimmed = next.trim()
    onLiveChange?.(trimmed)
    onCommit(trimmed)
  }

  const choose = (owner: string) => {
    setDraft(owner)
    setSelectedIdx(-1)
    commit(owner)
    inputRef.current?.blur()
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const nextTarget = e.relatedTarget
    if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) return
    setFocused(false)
    if (draft !== value) commit(draft)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      if (selectedIdx >= 0 && selectedIdx < filtered.length) choose(filtered[selectedIdx].owner)
      else commit(draft)
      ;(e.target as HTMLElement).blur()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(value)
      setSelectedIdx(-1)
      ;(e.target as HTMLElement).blur()
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="w-full rounded-lg border px-2 py-1.5 text-sm transition-colors"
      // The owner dropdown's mousedown can race with FloatingInspector's
      // document-level outside-click listener (the listener fires before our
      // commit runs and, on some focus-change paths, the dropdown item ends up
      // unmounted by the time the closest()/contains() check runs — clearing
      // the selection and dismissing the inspector). Stopping propagation here
      // keeps every interaction with the owner field local to the inspector.
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        background: focused ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
        borderColor: focused ? 'var(--color-accent)' : 'var(--color-border)',
        color: 'var(--color-text-primary)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        minHeight: 36,
      }}
      aria-label={ariaLabel}
    >
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onLiveChange?.(e.target.value); setSelectedIdx(-1) }}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-text-primary)',
          padding: '2px 4px',
          fontSize: 'inherit',
        }}
      />
      {draft && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setDraft(''); commit('') }}
          aria-label="Clear owner"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', padding: 0, marginRight: 4,
            display: 'flex', alignItems: 'center', lineHeight: 1, fontSize: 14,
          }}
        >
          ×
        </button>
      )}
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
              key={s.owner}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(s.owner) }}
              className="flyout-item"
              style={{
                padding: '5px 10px',
                width: '100%',
                background: i === selectedIdx ? 'var(--glass-overlay-sm)' : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.owner}
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
