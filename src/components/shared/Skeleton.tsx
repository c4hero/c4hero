// Lightweight skeleton placeholder for content that's still loading.
//
// Use this for visible structure (a card, a row, a panel) where the
// final layout is known but the data isn't ready. Picks the same shape
// as the eventual content so the page doesn't reflow when data arrives.

interface SkeletonProps {
  /** CSS width — accepts any CSS length value (e.g. '120px', '60%', '8rem'). */
  width?: string | number
  /** CSS height — accepts any CSS length value. */
  height?: string | number
  /** Border radius — defaults to a small radius for rectangular blocks. */
  radius?: string | number
  /** "block" (default), "circle" (radius 50%), or "text" (single short row). */
  variant?: 'block' | 'circle' | 'text'
  /** Inline style overrides. */
  style?: React.CSSProperties
  /** Extra class names. */
  className?: string
  /** Accessibility label — defaults to a generic "Loading" string. */
  ariaLabel?: string
}

export default function Skeleton({
  width,
  height,
  radius,
  variant = 'block',
  style,
  className,
  ariaLabel = 'Loading',
}: SkeletonProps) {
  const resolvedRadius =
    radius ??
    (variant === 'circle' ? '50%' : variant === 'text' ? 'var(--radius-sm)' : 'var(--radius-sm)')
  const resolvedHeight = height ?? (variant === 'text' ? '1em' : 16)
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={className}
      style={{
        display: 'inline-block',
        width: width ?? '100%',
        height: resolvedHeight,
        borderRadius: resolvedRadius,
        background:
          'linear-gradient(90deg, var(--color-surface-2) 0%, var(--color-surface-3) 50%, var(--color-surface-2) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

/** Convenience: a vertical stack of N text-row skeletons. */
export function SkeletonStack({ count = 3, gap = 8 }: { count?: number; gap?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      style={{ display: 'flex', flexDirection: 'column', gap, width: '100%' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          variant="text"
          // Each row's width tapers a bit so the stack doesn't look like a barcode.
          width={`${100 - i * 12}%`}
          ariaLabel="Loading"
        />
      ))}
    </div>
  )
}
