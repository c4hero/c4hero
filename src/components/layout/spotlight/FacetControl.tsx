import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

export interface FacetControlProps {
  label: string                                     // e.g. "Tech"
  icon: ReactNode                                   // e.g. <Cpu size={13} />
  withinSemantic: 'AND' | 'ANY'                     // tooltip hint in popover header
  /** All values that exist in the current view. */
  available: string[]
  /** Currently selected values (may include items not in `available`). */
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
  /** Optional swatch color for a value (Tags use tag style background, Status uses status color). */
  colorFor?: (value: string) => string | undefined
  /** Render label for a value. */
  renderValue?: (value: string) => string
  /** Limit of inline preview chips next to the trigger. */
  visibleChipLimit?: number
  /** When `available` is empty AND nothing is selected, render the trigger disabled with this tooltip. */
  emptyHint?: string
}

const POPUP_WIDTH = 280
const POPUP_MAX_HEIGHT = 380

export default function FacetControl({
  label,
  icon,
  withinSemantic,
  available,
  selected,
  onToggle,
  onClear,
  colorFor,
  renderValue = (v) => v,
  visibleChipLimit = 2,
  emptyHint,
}: FacetControlProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDisabled = available.length === 0 && selected.length === 0

  function openPopup() {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    let left = r.left
    left = Math.max(8, Math.min(left, window.innerWidth - POPUP_WIDTH - 8))
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    const top = openUp
      ? Math.max(8, r.top - Math.min(POPUP_MAX_HEIGHT, spaceAbove) - 6)
      : r.bottom + 6
    const maxHeight = openUp ? Math.min(POPUP_MAX_HEIGHT, spaceAbove) : Math.min(POPUP_MAX_HEIGHT, spaceBelow)
    setCoords({ top, left, width: POPUP_WIDTH, maxHeight })
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  useEffect(() => {
    if (!open) return
    function onDocPointer(e: MouseEvent | TouchEvent | PointerEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (popupRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer, true)
    document.addEventListener('mousedown', onDocPointer, true)
    document.addEventListener('touchstart', onDocPointer, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true)
      document.removeEventListener('mousedown', onDocPointer, true)
      document.removeEventListener('touchstart', onDocPointer, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filteredValues = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((v) => v.toLowerCase().includes(q))
  }, [available, query])

  const ordered = useMemo(() => {
    const sel = filteredValues.filter((v) => selected.includes(v))
    const unsel = filteredValues.filter((v) => !selected.includes(v))
    return { sel, unsel }
  }, [filteredValues, selected])

  const visibleChips = selected.slice(0, visibleChipLimit)
  const hiddenChipCount = Math.max(0, selected.length - visibleChipLimit)
  const matchedInView = selected.filter((v) => available.includes(v)).length
  const stale = selected.length > 0 && matchedInView === 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        disabled={isDisabled}
        title={isDisabled ? emptyHint : undefined}
        className="hover-lift-inactive"
        data-active={open ? 'true' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          height: 30,
          padding: '0 10px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: stale ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
          background: open ? 'var(--color-accent-active)' : undefined,
          opacity: isDisabled ? 0.5 : 1,
          cursor: isDisabled ? 'default' : 'pointer',
          border: 'none',
          flexShrink: 0,
        }}
      >
        {icon}
        {label}
        {selected.length > 0 && (
          <span style={{ marginLeft: 4, opacity: stale ? 0.6 : 1 }}>
            {stale ? `${selected.length} (0)` : selected.length}
          </span>
        )}
        <ChevronDown size={11} />
      </button>

      {visibleChips.map((value) => {
        const swatch = colorFor?.(value)
        return (
          <button
            key={value}
            onClick={() => onToggle(value)}
            title={`Remove ${renderValue(value)}`}
            style={{
              height: 26,
              padding: '0 8px',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-bg-primary)',
              background: swatch ?? 'var(--color-accent)',
              border: 'none',
              cursor: 'pointer',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderValue(value)}</span>
            <X size={10} style={{ flexShrink: 0 }} />
          </button>
        )
      })}
      {hiddenChipCount > 0 && (
        <button
          onClick={openPopup}
          style={{
            height: 26, padding: '0 8px', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)', fontWeight: 600,
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
            border: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          +{hiddenChipCount} more
        </button>
      )}
      {selected.length > 0 && (
        <button
          onClick={onClear}
          title={`Clear ${label} filter`}
          aria-label={`Clear ${label} filter`}
          style={{
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            cursor: 'pointer', border: 'none', background: 'transparent',
            flexShrink: 0,
          }}
        >
          <X size={11} />
        </button>
      )}

      {open && coords && createPortal(
        <div
          ref={popupRef}
          className="glass-panel-solid"
          style={{
            position: 'fixed',
            top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight,
            zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          role="dialog"
          aria-label={`${label} filter`}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
          }}>
            <span style={{ fontWeight: 700 }}>{label}</span>
            <span title={withinSemantic === 'AND' ? 'All selected match' : 'Any selected match'}>
              match: {withinSemantic === 'AND' ? 'all' : 'any'}
            </span>
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--color-border)',
              outline: 'none', background: 'transparent', color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {[...ordered.sel, ...ordered.unsel].map((value) => {
              const isSel = selected.includes(value)
              const swatch = colorFor?.(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggle(value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: isSel ? 'var(--color-accent-active)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 'var(--text-sm)',
                    color: isSel ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  }}
                >
                  {swatch && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: swatch, flexShrink: 0 }} />
                  )}
                  {renderValue(value)}
                </button>
              )
            })}
            {ordered.sel.length === 0 && ordered.unsel.length === 0 && (
              <div style={{ padding: '12px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                No matches
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <button
              onClick={onClear}
              style={{
                padding: '8px 12px', borderTop: '1px solid var(--color-border)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)',
                textAlign: 'left',
              }}
            >
              Clear all ({selected.length})
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
