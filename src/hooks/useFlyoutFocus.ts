import { useEffect, useRef } from 'react'

/**
 * Manages focus for a flyout panel:
 * - When opened: focuses first focusable element inside containerRef
 * - When closed: returns focus to triggerRef
 *
 * @param isOpen Whether the flyout is currently open
 * @param containerRef Ref to the flyout container element
 * @param triggerRef Ref to the button that opens the flyout
 * @param panelName Stable identifier for this panel (used to track which panel last opened)
 */
export function useFlyoutFocus(
  isOpen: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
  lastOpenPanelRef: React.MutableRefObject<string | null>,
  panelName: string,
) {
  const prevOpen = useRef(false)

  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      lastOpenPanelRef.current = panelName
      requestAnimationFrame(() => {
        const container = containerRef.current
        if (container) {
          const focusable = container.querySelector<HTMLElement>(
            'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )
          focusable?.focus()
        }
      })
    } else if (!isOpen && prevOpen.current && lastOpenPanelRef.current === panelName) {
      triggerRef.current?.focus()
      lastOpenPanelRef.current = null
    }
    prevOpen.current = isOpen
  }, [isOpen, containerRef, triggerRef, lastOpenPanelRef, panelName])
}
