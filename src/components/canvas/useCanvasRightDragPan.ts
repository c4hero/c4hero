import { useEffect, useRef, type RefObject } from 'react'
import type { Viewport } from '@xyflow/react'

/** How far (px) the pointer must travel with the right button held before the
 * press counts as a pan instead of a right click. */
export const RIGHT_DRAG_THRESHOLD = 4

/** A context menu arriving this long after a right-drag ends belongs to that
 * drag (Windows opens it on release), so it is suppressed. */
const RELEASE_MENU_WINDOW_MS = 500

// Native menus stay available where people expect them: text fields, the
// floating chrome, and React Flow's own panels such as the minimap.
const EXCLUDED = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-canvas-chrome], .react-flow__panel'

export interface RightDragPanCallbacks {
  getViewport: () => Viewport
  setViewport: (viewport: Viewport) => void
  /** Each pan step, with the pointer event that caused it. */
  onPan?: (event: PointerEvent, viewport: Viewport) => void
  /** The pan finished; `event` is the release, or null if it was abandoned. */
  onPanEnd?: (event: PointerEvent | null) => void
}

/** Right-button drag pans the viewport anywhere on the canvas, over nodes,
 * edges and boundaries too. React Flow's `panOnDrag=[2]` cannot do that: it
 * marks nodes and edges `nopan` and only lets the middle button through.
 *
 * A press that never travels past the threshold stays a plain right click and
 * keeps its context menu where the platform allows it. Windows opens the menu
 * on release, after the drag is decided, so only menus following a drag are
 * suppressed. macOS and Linux open it on press, before anyone can know whether
 * a drag follows, and the open menu would swallow the drag; there the press-
 * time menu is always suppressed. Keyboard menus (Menu key, Shift+F10) and
 * macOS Ctrl+click are not right-button presses and are left alone. */
export function attachRightDragPan(element: HTMLElement, callbacks: RightDragPanCallbacks): () => void {
  let press: { id: number; x: number; y: number; start: Viewport; panning: boolean } | null = null
  let lastDragEnd = -Infinity

  const finish = (event: PointerEvent | null) => {
    const ended = press
    press = null
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('blur', blur)
    if (!ended?.panning) return
    lastDragEnd = performance.now()
    callbacks.onPanEnd?.(event)
  }
  const move = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return
    // The release can happen outside the window and never reach us.
    if ((event.buttons & 2) === 0) { finish(null); return }
    const dx = event.clientX - press.x, dy = event.clientY - press.y
    if (!press.panning && Math.hypot(dx, dy) < RIGHT_DRAG_THRESHOLD) return
    press.panning = true
    event.preventDefault()
    // Content follows the pointer from where the press began.
    const viewport = { x: press.start.x + dx, y: press.start.y + dy, zoom: press.start.zoom }
    callbacks.setViewport(viewport)
    callbacks.onPan?.(event, viewport)
  }
  const up = (event: PointerEvent) => {
    if (press && event.pointerId === press.id && event.button === 2) finish(event)
  }
  const cancel = (event: PointerEvent) => {
    if (press && event.pointerId === press.id) finish(null)
  }
  const blur = () => finish(null)

  const down = (event: PointerEvent) => {
    if (event.button !== 2 || event.pointerType !== 'mouse') return
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.react-flow') || target.closest(EXCLUDED)) return
    finish(null)
    const start = callbacks.getViewport()
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, start, panning: false }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', blur)
  }
  const contextMenu = (event: MouseEvent) => {
    // Pressed and not yet released: a press-time platform, and a drag may follow.
    if (press) { event.preventDefault(); return }
    if (performance.now() - lastDragEnd < RELEASE_MENU_WINDOW_MS) {
      lastDragEnd = -Infinity
      event.preventDefault()
    }
  }

  element.addEventListener('pointerdown', down, true)
  element.addEventListener('contextmenu', contextMenu, true)
  return () => {
    finish(null)
    element.removeEventListener('pointerdown', down, true)
    element.removeEventListener('contextmenu', contextMenu, true)
  }
}

export function useCanvasRightDragPan(host: RefObject<HTMLElement | null>, callbacks: RightDragPanCallbacks) {
  const latest = useRef(callbacks)
  useEffect(() => { latest.current = callbacks })
  useEffect(() => {
    const element = host.current
    if (!element) return
    return attachRightDragPan(element, {
      getViewport: () => latest.current.getViewport(),
      setViewport: viewport => latest.current.setViewport(viewport),
      onPan: (event, viewport) => latest.current.onPan?.(event, viewport),
      onPanEnd: event => latest.current.onPanEnd?.(event),
    })
  }, [host])
}
