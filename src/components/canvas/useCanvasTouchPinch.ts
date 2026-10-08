import { useEffect, useRef, type RefObject } from 'react'

/** Route two-finger gestures to the existing viewport even when a node owns
 * the first touch. Native node dragging stops propagation before d3-zoom can
 * see it; cancelling that drag and forwarding the gesture avoids two competing
 * cameras or changing one-finger editing. */
export function useCanvasTouchPinch(host: RefObject<HTMLDivElement | null>, onStart: () => void, onEnd: () => void) {
  const callbacks = useRef({ onStart, onEnd })
  useEffect(() => { callbacks.current = { onStart, onEnd } }, [onStart, onEnd])
  useEffect(() => {
    const element = host.current
    if (!element) return
    let forwarding = false, pinching = false
    const dispatch = (target: EventTarget, event: TouchEvent, type = event.type, cancel = false, start = false) => {
      forwarding = true
      try {
        target.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true, composed: true,
          touches: cancel ? [] : Array.from(event.touches),
          targetTouches: cancel ? [] : Array.from(event.touches),
          changedTouches: Array.from(cancel || start ? event.touches : event.changedTouches),
          ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey,
        }))
      } finally { forwarding = false }
    }
    const handle = (event: TouchEvent) => {
      if (forwarding) return
      const pane = element.querySelector('.react-flow__pane')
      if (!pane) return
      let starting = false
      if (!pinching) {
        if (event.type !== 'touchstart' || event.touches.length < 2) return
        const touches = Array.from(event.touches)
        if (touches.some(t => !(t.target instanceof Element) || !element.contains(t.target) || t.target.closest('input, textarea, select, [data-canvas-chrome], .react-flow__minimap'))) return
        pinching = true; starting = true
        callbacks.current.onStart()
        // End any one-finger node drag or pane pan before handing both fingers
        // to the viewport. The forwarding guard prevents recursive capture.
        for (const target of new Set(touches.map(t => t.target))) dispatch(target, event, 'touchcancel', true)
        dispatch(pane, event, 'touchcancel', true)
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      dispatch(pane, event, event.type, false, starting)
      if (!event.touches.length) {
        pinching = false
        callbacks.current.onEnd()
      }
    }
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
    for (const type of types) element.addEventListener(type, handle, { capture: true, passive: false })
    return () => {
      for (const type of types) element.removeEventListener(type, handle, true)
    }
  }, [host])
}
