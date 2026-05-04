import { useEffect, useLayoutEffect, useRef, useState, useCallback, type RefObject } from 'react'

export type Placement = {
  /** Anchor the top of the popover to the bottom of the trigger (default). */
  side: 'bottom'
} | {
  /** Anchor the bottom of the popover to the top of the trigger. */
  side: 'top'
}

export type Coords = { top: number; left: number }

export interface AnchoredPopoverOptions {
  /** Width of the popover in px — needed to clamp horizontal position to the
   *  viewport. */
  width: number
  /** Height of the popover in px. Optional; only used when `side: "auto"` to
   *  pick the side with more room. */
  height?: number
  /** Pixels of gap between the trigger and the popover. Defaults to 6. */
  gap?: number
  /** Side of the trigger to anchor to. "auto" picks whichever side has more
   *  room (requires `height`); defaults to "bottom". */
  side?: Placement['side'] | 'auto'
  /** Horizontal alignment of the popover relative to the trigger.
   *  - "right-edge": right edge of popover aligns with right edge of trigger
   *  - "left-edge":  left edge aligns with left edge of trigger (default)
   *  - "center":     center over the trigger
   */
  align?: 'right-edge' | 'left-edge' | 'center'
}

export interface AnchoredPopover<T extends HTMLElement, P extends HTMLElement> {
  open: boolean
  setOpen: (next: boolean | ((v: boolean) => boolean)) => void
  toggle: () => void
  triggerRef: RefObject<T | null>
  popupRef: RefObject<P | null>
  coords: Coords | null
}

/**
 * One source of truth for "anchored popover that closes on outside click,
 * Escape, scroll, or resize."
 *
 * Replaces the hand-rolled pattern that lived in 5+ components (RowMenu,
 * CanvasSettingsDialog ThemePicker, FloatingBottomStrip color preset,
 * FloatingToolRail flyouts, HighlighterPanel tag manager). Each callsite
 * computes coordinates from the trigger's bounding rect, clamps to the
 * viewport, and tears the popover down on the same set of events — so we
 * own that logic here once.
 *
 * Returns refs the caller attaches to the trigger and the popup, plus
 * `open`/`coords` state to drive rendering. The popup itself is the
 * caller's responsibility (typically rendered via createPortal at the
 * returned coords); this hook only positions and dismisses it.
 */
export function useAnchoredPopover<T extends HTMLElement = HTMLButtonElement, P extends HTMLElement = HTMLDivElement>(
  options: AnchoredPopoverOptions,
): AnchoredPopover<T, P> {
  const { width, height, gap = 6, side: rawSide = 'bottom', align = 'left-edge' } = options
  const [open, setOpenState] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const triggerRef = useRef<T | null>(null)
  const popupRef = useRef<P | null>(null)

  const setOpen = useCallback((next: boolean | ((v: boolean) => boolean)) => {
    setOpenState(next)
  }, [])
  const toggle = useCallback(() => setOpenState((v) => !v), [])

  // Measure the trigger's bounding rect and set coords synchronously before
  // paint so the popup doesn't flash in at (0,0). useLayoutEffect is the right
  // primitive here; useEffect would be flagged by react-hooks/set-state-in-effect
  // and would also paint the popup at a stale position for one frame.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    let left: number
    if (align === 'right-edge') left = r.right - width
    else if (align === 'center') left = r.left + r.width / 2 - width / 2
    else left = r.left
    // Clamp horizontally to the viewport with an 8px margin so the popup
    // doesn't get cut off near edges.
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    // Resolve "auto" side based on which side has more room. Requires height
    // to be specified; otherwise fall through to the default (bottom).
    let side: Placement['side'] = rawSide === 'auto' ? 'bottom' : rawSide
    if (rawSide === 'auto' && height !== undefined) {
      const roomBelow = window.innerHeight - r.bottom
      const roomAbove = r.top
      side = roomBelow >= height + gap || roomBelow >= roomAbove ? 'bottom' : 'top'
    }
    const top = side === 'bottom'
      ? r.bottom + gap
      : r.top - gap - (height ?? 0)
    // DOM measurement: we can only call getBoundingClientRect after the trigger
    // mounts, so coords must be derived in a layout effect rather than during
    // render. useLayoutEffect runs before paint so the popup never flashes at
    // the wrong position.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoords({ top, left })
  }, [open, width, height, gap, rawSide, align])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (popupRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpenState(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenState(false)
    }
    function onReposition() {
      // Close rather than reflow — the trigger's intent is "show this until
      // dismissed," and any scroll/resize is itself a dismiss signal.
      setOpenState(false)
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

  return { open, setOpen, toggle, triggerRef, popupRef, coords }
}
