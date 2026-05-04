import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover'

export type RowMenuItem = {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
}

const POPUP_WIDTH = 200

/** Three-dot overflow menu used by recent-collection rows and workspace
 *  rows on the welcome screen. Renders a portal-anchored popup with
 *  outside-click + Escape + reposition handling via useAnchoredPopover. */
export default function RowMenu({ items, ariaLabel }: { items: RowMenuItem[]; ariaLabel: string }) {
  const { open, toggle, setOpen, triggerRef, popupRef, coords } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>({
    width: POPUP_WIDTH,
    align: 'right-edge',
  })

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
          toggle()
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
