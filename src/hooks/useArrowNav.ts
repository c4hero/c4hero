import { useEffect } from 'react'

/** Enables ArrowUp/Down/Home/End keyboard navigation between focusable children. */
export function useArrowNav(
  ref: React.RefObject<HTMLElement | null>,
  selector = 'button, [role="menuitem"]',
) {
  useEffect(() => {
    const container = ref.current
    if (!container) return

    function handleKeyDown(e: KeyboardEvent) {
      const items = Array.from(container!.querySelectorAll<HTMLElement>(selector))
      const idx = items.indexOf(document.activeElement as HTMLElement)
      if (idx === -1 && !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return

      let next = -1
      if (e.key === 'ArrowDown') next = idx < items.length - 1 ? idx + 1 : 0
      else if (e.key === 'ArrowUp') next = idx > 0 ? idx - 1 : items.length - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = items.length - 1
      else return

      e.preventDefault()
      items[next]?.focus()
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [ref, selector])
}
