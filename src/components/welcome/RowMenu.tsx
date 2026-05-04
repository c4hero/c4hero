import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

export type RowMenuItem = {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
}

/** Three-dot overflow menu used by recent-collection rows and workspace
 *  rows on the welcome screen. Renders a portal-anchored popup with
 *  outside-click + Escape + reposition handling. */
export default function RowMenu({ items, ariaLabel }: { items: RowMenuItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const POPUP_WIDTH = 200

  function computeCoords() {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const top = r.bottom + 6
    // Anchor right edge of popup to right edge of trigger; clamp to viewport.
    let left = r.right - POPUP_WIDTH
    left = Math.max(8, Math.min(left, window.innerWidth - POPUP_WIDTH - 8))
    setCoords({ top, left })
  }

  useEffect(() => {
    if (!open) return
    computeCoords()
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (popupRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onReposition() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open])

  return (
    <span className="row-menu" data-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && coords && createPortal(
        <div
          ref={popupRef}
          role="menu"
          className="row-menu-popup"
          style={{ top: coords.top, left: coords.left, width: POPUP_WIDTH }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              className={item.danger ? 'row-menu-item danger' : 'row-menu-item'}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}
