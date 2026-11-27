import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Viewport } from '@xyflow/react'
import { attachRightDragPan, RIGHT_DRAG_THRESHOLD } from './useCanvasRightDragPan'

function pointer(type: string, init: { x: number; y: number; button?: number; buttons?: number; pointerType?: string }) {
  return new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: init.pointerType ?? 'mouse',
    clientX: init.x, clientY: init.y, button: init.button ?? -1, buttons: init.buttons ?? 0,
  })
}
const menu = (x = 0, y = 0) => new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y })

describe('attachRightDragPan', () => {
  let host: HTMLDivElement, node: HTMLDivElement, input: HTMLInputElement, viewport: Viewport
  let detach: () => void
  const onPan = vi.fn(), onPanEnd = vi.fn(), onMenu = vi.fn()

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"><div class="react-flow"><div class="react-flow__node"><input></div></div></div>'
    host = document.getElementById('host') as HTMLDivElement
    node = host.querySelector('.react-flow__node') as HTMLDivElement
    input = host.querySelector('input') as HTMLInputElement
    viewport = { x: 10, y: 20, zoom: 2 }
    onPan.mockClear(); onPanEnd.mockClear(); onMenu.mockClear()
    detach = attachRightDragPan(host, { getViewport: () => viewport, setViewport: v => { viewport = v }, onPan, onPanEnd, onMenu })
  })
  afterEach(() => detach())

  const press = (target: Element, x = 100, y = 100) => target.dispatchEvent(pointer('pointerdown', { x, y, button: 2, buttons: 2 }))
  const drag = (x: number, y: number) => window.dispatchEvent(pointer('pointermove', { x, y, buttons: 2 }))
  const release = (x: number, y: number) => window.dispatchEvent(pointer('pointerup', { x, y, button: 2 }))

  it('pans with the pointer from where the press began, over a node', () => {
    press(node)
    drag(130, 80)
    expect(viewport).toEqual({ x: 40, y: 0, zoom: 2 })
    release(130, 80)
    expect(onPan).toHaveBeenCalledTimes(1)
    expect(onPanEnd).toHaveBeenCalledWith(expect.objectContaining({ type: 'pointerup' }))
  })

  it('treats movement under the threshold as a click and opens the canvas menu on release', () => {
    press(node)
    drag(100 + RIGHT_DRAG_THRESHOLD - 1, 100)
    release(100 + RIGHT_DRAG_THRESHOLD - 1, 100)
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(onPanEnd).not.toHaveBeenCalled()
    expect(onMenu).toHaveBeenCalledWith(node, { x: 100 + RIGHT_DRAG_THRESHOLD - 1, y: 100 }, false)
    // Windows then sends the browser's menu event: suppressed, not opened twice.
    const event = menu(103, 100)
    node.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('opens no menu after a drag, and suppresses the browser one', () => {
    press(node)
    drag(160, 100)
    release(160, 100)
    const event = menu(160, 100)
    node.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onMenu).not.toHaveBeenCalled()
  })

  it('suppresses a browser menu sent on press, and lets the release decide', () => {
    press(node)
    const event = menu(100, 100)
    node.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onMenu).not.toHaveBeenCalled()
    release(100, 100)
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('opens the menu for the keyboard at the focused element, and for macOS Ctrl+click at the pointer', () => {
    node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'F10', shiftKey: true }))
    const keyboard = menu(40, 40)
    node.dispatchEvent(keyboard)
    expect(keyboard.defaultPrevented).toBe(true)
    expect(onMenu).toHaveBeenLastCalledWith(node, { x: 0, y: 0 }, true)

    const ctrlClick = menu(140, 120)
    node.dispatchEvent(ctrlClick)
    expect(onMenu).toHaveBeenLastCalledWith(node, { x: 140, y: 120 }, false)
  })

  it('leaves text fields and other buttons alone', () => {
    press(input)
    const inField = menu(100, 100)
    input.dispatchEvent(inField)
    expect(inField.defaultPrevented).toBe(false)
    drag(200, 200)
    release(200, 200)
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(onMenu).not.toHaveBeenCalled()

    node.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, button: 0, buttons: 1 }))
    window.dispatchEvent(pointer('pointermove', { x: 200, y: 200, buttons: 1 }))
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 2 })
  })

  it('ignores touch and pen right-button presses', () => {
    node.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, button: 2, buttons: 2, pointerType: 'pen' }))
    drag(200, 200)
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 2 })
  })

  it('ends the pan when the button was released outside the window', () => {
    press(node)
    drag(150, 100)
    window.dispatchEvent(pointer('pointermove', { x: 170, y: 100, buttons: 0 }))
    expect(onPanEnd).toHaveBeenCalledWith(null)
    expect(onMenu).not.toHaveBeenCalled()
    drag(250, 100)
    expect(viewport.x).toBe(60)
  })
})
