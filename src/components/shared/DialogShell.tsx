import { useRef, useCallback, useEffect } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/** Where the dialog body sits within the viewport.
 *  - "center" — classic centered modal (default; backdrop covers viewport)
 *  - "shade"  — slide-down panel anchored to the top pill (no backdrop;
 *               clicking outside dismisses via an invisible click catcher,
 *               matching the existing `.shade-panel` CSS class)
 *  - "docked" — right-edge rail, full height, non-modal (no backdrop; the canvas
 *               stays visible and interactive). Closes via Escape or the panel's
 *               own close button — there is no click-away catcher. */
type DialogPosition = 'center' | 'shade' | 'docked'

interface DialogShellProps {
  onClose: () => void
  ariaLabel: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Defaults to "center". Use "shade" for top-pill-anchored slide-downs. */
  position?: DialogPosition
  /** Defaults to true. Disable when a child flow owns Escape for its own UX. */
  closeOnEscape?: boolean
}

export default function DialogShell({
  onClose, ariaLabel, children, className, style, position = 'center', closeOnEscape = true,
}: DialogShellProps) {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const previouslyFocusedRef = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null)

  const handleClose = useCallback(() => {
    onClose()
    const el = previouslyFocusedRef.current
    if (el && el instanceof HTMLElement) {
      requestAnimationFrame(() => el.focus())
    }
  }, [onClose])

  // Global Escape listener: the per-element onKeyDown handlers only fire when
  // focus is inside the dialog tree, but Escape should dismiss regardless of
  // where focus lives (e.g. focus parked on document.body before the trap
  // settles). React's synthetic event delegation also doesn't surface
  // document-level keydowns to nested handlers.
  useEffect(() => {
    if (!closeOnEscape) return undefined
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeOnEscape, handleClose])

  if (position === 'shade') {
    // Slide-down panel pattern: an invisible click-catcher behind the panel
    // (low z) dismisses on outside click; the panel itself uses the
    // `shade-panel` CSS class which positions it under the top pill.
    return (
      <>
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 48, pointerEvents: 'auto' }}
          onClick={handleClose}
          aria-hidden="true"
        />
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={`shade-panel ${className ?? ''}`.trim()}
          style={{ zIndex: 49, ...style }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </>
    )
  }

  if (position === 'docked') {
    // Non-modal right-edge rail: no backdrop, so the canvas stays visible and
    // clickable. Escape (global listener above) and the panel's close button
    // dismiss it.
    return (
      <div
        ref={trapRef}
        role="dialog"
        aria-label={ariaLabel}
        className={className}
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 60, ...style }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="panel-backdrop absolute inset-0" onClick={handleClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={className}
        // position: relative + z-index ensures the panel stacks above the
        // absolutely-positioned backdrop sibling. stopPropagation is a
        // defensive guard so clicks inside the panel never bubble to a
        // potential handler on the outer container.
        style={{ position: 'relative', zIndex: 1, ...style }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
