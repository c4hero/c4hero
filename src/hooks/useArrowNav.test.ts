import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useArrowNav } from './useArrowNav'

function createContainer() {
  const container = document.createElement('div')
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement('button')
    btn.textContent = `Item ${i}`
    container.appendChild(btn)
  }
  document.body.appendChild(container)
  return container
}

function press(container: HTMLElement, key: string) {
  container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('useArrowNav', () => {
  it('ArrowDown moves focus to the next item', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'ArrowDown')
    expect(document.activeElement).toBe(buttons[1])
  })

  it('ArrowDown wraps from last to first', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[3].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'ArrowDown')
    expect(document.activeElement).toBe(buttons[0])
  })

  it('ArrowUp moves focus to the previous item', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[2].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'ArrowUp')
    expect(document.activeElement).toBe(buttons[1])
  })

  it('ArrowUp wraps from first to last', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'ArrowUp')
    expect(document.activeElement).toBe(buttons[3])
  })

  it('Home moves focus to the first item', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[3].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'Home')
    expect(document.activeElement).toBe(buttons[0])
  })

  it('End moves focus to the last item', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'End')
    expect(document.activeElement).toBe(buttons[3])
  })

  it('prevents default on handled keys', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    const spy = vi.spyOn(event, 'preventDefault')
    container.dispatchEvent(event)
    expect(spy).toHaveBeenCalled()
  })

  it('ignores non-navigation keys', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[1].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    press(container, 'a')
    expect(document.activeElement).toBe(buttons[1])
  })

  it('accepts a custom selector', () => {
    const container = document.createElement('div')
    for (let i = 0; i < 3; i++) {
      const item = document.createElement('div')
      item.setAttribute('role', 'option')
      item.setAttribute('tabindex', '0')
      item.textContent = `Option ${i}`
      container.appendChild(item)
    }
    document.body.appendChild(container)

    const items = container.querySelectorAll<HTMLElement>('[role="option"]')
    items[0].focus()

    renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref, '[role="option"]')
    })

    press(container, 'ArrowDown')
    expect(document.activeElement).toBe(items[1])
  })

  it('cleans up event listener on unmount', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    buttons[0].focus()

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(container)
      useArrowNav(ref)
    })

    unmount()

    press(container, 'ArrowDown')
    // Focus should NOT have moved since listener was removed
    expect(document.activeElement).toBe(buttons[0])
  })
})
