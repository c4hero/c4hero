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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div className="panel-backdrop absolute inset-0" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>
  )
}
