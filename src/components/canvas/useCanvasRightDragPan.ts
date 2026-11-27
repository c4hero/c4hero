import { useEffect, useRef, type RefObject } from 'react'
import type { Viewport } from '@xyflow/react'

/** How far (px) the pointer must travel with the right button held before the
 * press counts as a pan instead of a right click. */
export const RIGHT_DRAG_THRESHOLD = 4

/** A context menu event arriving this long after a right release belongs to
 * that press (Windows sends it on release), which has already been handled. */
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
  /** Open the canvas's own menu for a right click that didn't drag, or for a
   * menu asked for from the keyboard or with macOS Ctrl+click. `keyboard` is
   * true when there was no pointer position to open it at. */
  onMenu: (target: Element, point: { x: number; y: number }, keyboard: boolean) => void
}

/** Right-button drag pans the viewport anywhere on the canvas, over nodes,
 * edges and boundaries too. React Flow's `panOnDrag=[2]` cannot do that: it
 * marks nodes and edges `nopan` and only lets the middle button through.
 *
 * A press that never travels past the threshold stays a right click and opens
 * the canvas's own menu on release. The browser's menu can't do that: macOS
 * and Linux open it on press, before anyone can know whether a drag follows,
 * and the open menu would swallow the drag. So the canvas suppresses the
 * browser's menu and opens its own, the same way on every platform. Text
 * fields, the floating chrome and React Flow's panels keep the browser's. */
export function attachRightDragPan(element: HTMLElement, callbacks: RightDragPanCallbacks): () => void {
  let press: { id: number; x: number; y: number; target: Element; start: Viewport; panning: boolean } | null = null
  let lastRelease = -Infinity
  let lastMenuKey = -Infinity
  // Touch and pen pointers that are down. A long press sends a context menu
  // event while the finger is still down; touch keeps its own behaviour.
  const touches = new Set<number>()
  const touchEnd = (event: PointerEvent) => { touches.delete(event.pointerId) }

  const finish = (event: PointerEvent | null) => {
    const ended = press
    press = null
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('blur', blur)
    if (!ended || !event) {
      if (ended?.panning) callbacks.onPanEnd?.(null)
      return
    }
    lastRelease = performance.now()
    if (ended.panning) callbacks.onPanEnd?.(event)
    else callbacks.onMenu(ended.target, { x: event.clientX, y: event.clientY }, false)
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
    if (event.pointerType !== 'mouse') { touches.add(event.pointerId); return }
    // A lost touch release must not leave mouse right clicks to the browser.
    touches.clear()
    if (event.button !== 2) return
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.react-flow') || target.closest(EXCLUDED)) return
    finish(null)
    const start = callbacks.getViewport()
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, target, start, panning: false }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', blur)
  }
  const contextMenu = (event: MouseEvent) => {
    const target = event.target
    if (touches.size || !(target instanceof Element) || !target.closest('.react-flow') || target.closest(EXCLUDED)) return
    event.preventDefault()
    // Sent on press (macOS, Linux): the release decides. Sent on release
    // (Windows): the release already decided.
    if (press) return
    if (performance.now() - lastRelease < RELEASE_MENU_WINDOW_MS) { lastRelease = -Infinity; return }
    // No right press: the Menu key, Shift+F10 or macOS Ctrl+click. A keyboard
    // menu opens at the focused element.
    const keyboard = performance.now() - lastMenuKey < RELEASE_MENU_WINDOW_MS
    lastMenuKey = -Infinity
    if (!keyboard) { callbacks.onMenu(target, { x: event.clientX, y: event.clientY }, false); return }
    const rect = target.getBoundingClientRect()
    callbacks.onMenu(target, { x: rect.left + Math.min(rect.width / 2, 24), y: rect.top + Math.min(rect.height / 2, 24) }, true)
  }

  const key = (event: KeyboardEvent) => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) lastMenuKey = performance.now()
  }

  element.addEventListener('pointerdown', down, true)
  element.addEventListener('contextmenu', contextMenu, true)
  element.addEventListener('keydown', key, true)
  window.addEventListener('pointerup', touchEnd, true)
  window.addEventListener('pointercancel', touchEnd, true)
  return () => {
    finish(null)
    element.removeEventListener('pointerdown', down, true)
    element.removeEventListener('contextmenu', contextMenu, true)
    element.removeEventListener('keydown', key, true)
    window.removeEventListener('pointerup', touchEnd, true)
    window.removeEventListener('pointercancel', touchEnd, true)
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
      onMenu: (target, point, keyboard) => latest.current.onMenu(target, point, keyboard),
    })
  }, [host])
}
