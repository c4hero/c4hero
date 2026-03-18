import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

/** Traps Tab/Shift+Tab focus cycling within a container element. */
export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    // Focus first focusable element on mount
    const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE)
    if (firstFocusable) {
      firstFocusable.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = container!.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [])

  return ref
}
