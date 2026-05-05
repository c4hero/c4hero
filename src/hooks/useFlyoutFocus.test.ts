import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useFlyoutFocus } from './useFlyoutFocus'

// Mock requestAnimationFrame to execute immediately
beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
})

function createContainer() {
  const container = document.createElement('div')
  const btn = document.createElement('button')
  btn.textContent = 'Inside'
  container.appendChild(btn)
  document.body.appendChild(container)
  return { container, btn }
}

function createTrigger() {
  const trigger = document.createElement('button')
  trigger.textContent = 'Trigger'
  document.body.appendChild(trigger)
  return trigger
}

describe('useFlyoutFocus', () => {
  it('focuses first focusable element when opened', () => {
    const { container, btn } = createContainer()
    const trigger = createTrigger()

    renderHook(
      ({ isOpen }) => {
        const containerRef = useRef<HTMLElement>(container)
        const triggerRef = useRef<HTMLElement>(trigger)
        const lastOpenPanelRef = useRef<string | null>(null)
        useFlyoutFocus(isOpen, containerRef, triggerRef, lastOpenPanelRef, 'test-panel')
      },
      { initialProps: { isOpen: false } },
    )

    // Focus should not have changed yet
    expect(document.activeElement).not.toBe(btn)

    // Re-render with isOpen=true — we need to rerender the hook
    const { rerender } = renderHook(
      ({ isOpen }) => {
        const containerRef = useRef<HTMLElement>(container)
        const triggerRef = useRef<HTMLElement>(trigger)
        const lastOpenPanelRef = useRef<string | null>(null)
        useFlyoutFocus(isOpen, containerRef, triggerRef, lastOpenPanelRef, 'test-panel')
      },
      { initialProps: { isOpen: false } },
    )

    rerender({ isOpen: true })
    expect(document.activeElement).toBe(btn)

    container.remove()
    trigger.remove()
  })

  it('restores focus to trigger when closed', () => {
    const { container, btn } = createContainer()
    const trigger = createTrigger()

    const { rerender } = renderHook(
      ({ isOpen }) => {
        const containerRef = useRef<HTMLElement>(container)
        const triggerRef = useRef<HTMLElement>(trigger)
        const lastOpenPanelRef = useRef<string | null>(null)
        useFlyoutFocus(isOpen, containerRef, triggerRef, lastOpenPanelRef, 'test-panel')
      },
      { initialProps: { isOpen: false } },
    )

    // Open
    rerender({ isOpen: true })
    expect(document.activeElement).toBe(btn)

    // Close — should restore to trigger
    rerender({ isOpen: false })
    expect(document.activeElement).toBe(trigger)

    container.remove()
    trigger.remove()
  })

  it('sets lastOpenPanelRef when opened', () => {
    const { container } = createContainer()
    const trigger = createTrigger()
    const sharedRef = { current: null as string | null }

    const { rerender } = renderHook(
      ({ isOpen }) => {
        const containerRef = useRef<HTMLElement>(container)
        const triggerRef = useRef<HTMLElement>(trigger)
        useFlyoutFocus(isOpen, containerRef, triggerRef, sharedRef, 'my-panel')
      },
      { initialProps: { isOpen: false } },
    )

    rerender({ isOpen: true })
    expect(sharedRef.current).toBe('my-panel')

    container.remove()
    trigger.remove()
  })

  it('does not restore focus if a different panel was last opened', () => {
    const { container } = createContainer()
    const trigger = createTrigger()

    // Use a shared lastOpenPanelRef across renders
    const sharedRef = { current: null as string | null }

    const { rerender } = renderHook(
      ({ isOpen }) => {
        const containerRef = useRef<HTMLElement>(container)
        const triggerRef = useRef<HTMLElement>(trigger)
        useFlyoutFocus(isOpen, containerRef, triggerRef, sharedRef, 'panel-A')
      },
      { initialProps: { isOpen: false } },
    )

    // Open panel A
    rerender({ isOpen: true })
    expect(sharedRef.current).toBe('panel-A')

    // Simulate another panel being opened
    sharedRef.current = 'panel-B'

    // Close panel A — should NOT restore focus since panel-B is now active
    rerender({ isOpen: false })
    // Trigger should NOT be focused since lastOpenPanelRef is 'panel-B', not 'panel-A'
    expect(document.activeElement).not.toBe(trigger)

    container.remove()
    trigger.remove()
  })

  it('does nothing when container has no focusable children', () => {
    const container = document.createElement('div')
    container.textContent = 'No buttons here'
    document.body.appendChild(container)
    const trigger = createTrigger()

    const { rerender } = renderHook(
      ({ isOpen }) => {
        const containerRef = useRef<HTMLElement>(container)
        const triggerRef = useRef<HTMLElement>(trigger)
        const lastOpenPanelRef = useRef<string | null>(null)
        useFlyoutFocus(isOpen, containerRef, triggerRef, lastOpenPanelRef, 'empty-panel')
      },
      { initialProps: { isOpen: false } },
    )

    // Should not throw when opening with no focusable children
    rerender({ isOpen: true })
    expect(document.activeElement).not.toBe(container)

    container.remove()
    trigger.remove()
  })
})
