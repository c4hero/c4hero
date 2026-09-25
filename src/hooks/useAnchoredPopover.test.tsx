import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useAnchoredPopover } from './useAnchoredPopover'

function Picker() {
  const popover = useAnchoredPopover({ width: 240 })
  return <>
    <button ref={popover.triggerRef} onClick={popover.toggle}>Open picker</button>
    {popover.open && <div ref={popover.popupRef} role="listbox"><div data-testid="options">Options</div></div>}
    <div data-testid="outside">Outside</div>
  </>
}

it('keeps a scrollable popover open while browsing its options', () => {
  render(<Picker />)
  fireEvent.click(screen.getByText('Open picker'))
  fireEvent.scroll(screen.getByRole('listbox'))
  expect(screen.queryByRole('listbox')).not.toBeNull()
  fireEvent.scroll(screen.getByTestId('options'))
  expect(screen.queryByRole('listbox')).not.toBeNull()
})

it('still dismisses when the page scrolls or the viewport resizes', () => {
  render(<Picker />)
  fireEvent.click(screen.getByText('Open picker'))
  fireEvent.scroll(screen.getByTestId('outside'))
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.click(screen.getByText('Open picker'))
  fireEvent.resize(window)
  expect(screen.queryByRole('listbox')).toBeNull()
})
