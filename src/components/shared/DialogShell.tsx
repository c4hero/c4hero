import { useRef, useEffect, useCallback } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface DialogShellProps {
  onClose: () => void
  ariaLabel: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function DialogShell({ onClose, ariaLabel, children, className, style }: DialogShellProps) {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const previouslyFocusedRef = useRef<Element | null>(null)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement
  }, [])

  const handleClose = useCallback(() => {
    onClose()
    const el = previouslyFocusedRef.current
    if (el && el instanceof HTMLElement) {
      requestAnimationFrame(() => el.focus())
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose() }}
    >
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
