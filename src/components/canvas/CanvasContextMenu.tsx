import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useArrowNav } from '@/hooks/useArrowNav'
import type { CanvasMenuItem } from './canvasContextMenu'

const MARGIN = 8

export interface CanvasContextMenuProps {
  x: number
  y: number
  sections: CanvasMenuItem[][]
  /** Opened from the keyboard: focus the first item, as a native menu does. */
  keyboard?: boolean
  onClose: () => void
}

/** The canvas's right-click menu. It closes on Escape, on a press anywhere
 * else, on scroll or zoom, and when the window loses focus. */
export default function CanvasContextMenu({ x, y, sections, keyboard, onClose }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useArrowNav(ref)

  // Keep the whole menu on screen: flip it left or up when it would overflow.
  // Measured before paint, so it never shows in the wrong place.
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const { offsetWidth: width, offsetHeight: height } = menu
    menu.style.left = `${x + width + MARGIN > innerWidth ? Math.max(MARGIN, x - width) : x}px`
    menu.style.top = `${y + height + MARGIN > innerHeight ? Math.max(MARGIN, y - height) : y}px`
  }, [x, y])

  useEffect(() => {
    const menu = ref.current
    if (!menu) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (keyboard) menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    else menu.focus({ preventScroll: true })
    const outside = (event: Event) => { if (!(event.target instanceof Node) || !menu.contains(event.target)) onClose() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close only the menu, not the selection behind it.
        event.preventDefault(); event.stopPropagation()
        onClose(); previous?.focus({ preventScroll: true })
      } else if (event.key === 'Tab') onClose()
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('wheel', outside, { capture: true, passive: true })
    window.addEventListener('keydown', key, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('wheel', outside, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [keyboard, onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Canvas actions"
      tabIndex={-1}
      className="row-menu-popup canvas-context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {sections.map((items, index) => (
        <Fragment key={items[0].id}>
          {index > 0 && <div role="separator" className="canvas-context-menu-separator" />}
          {items.map(({ id, label, shortcut, icon: Icon, danger, run }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              data-menu-item={id}
              className={danger ? 'row-menu-item danger' : 'row-menu-item'}
              onClick={() => { onClose(); run() }}
            >
              {Icon ? <Icon size={14} aria-hidden /> : <span className="canvas-context-menu-icon" />}
              <span className="canvas-context-menu-label">{label}</span>
              {shortcut && <kbd className="canvas-context-menu-shortcut">{shortcut}</kbd>}
            </button>
          ))}
        </Fragment>
      ))}
    </div>,
    document.body,
  )
}
