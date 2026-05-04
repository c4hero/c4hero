import { useRef, useCallback, useEffect } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/** Where the dialog body sits within the viewport.
 *  - "center" — classic centered modal (default; backdrop covers viewport)
 *  - "shade"  — slide-down panel anchored to the top pill (no backdrop;
 *               clicking outside dismisses via an invisible click catcher,
 *               matching the existing `.shade-panel` CSS class) */
type DialogPosition = 'center' | 'shade'

interface DialogShellProps {
  onClose: () => void
  ariaLabel: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Defaults to "center". Use "shade" for top-pill-anchored slide-downs. */
  position?: DialogPosition
}

export default function DialogShell({
  onClose, ariaLabel, children, className, style, position = 'center',
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
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

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
