import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CanvasSettingsDialog from './CanvasSettingsDialog'
import { useSettingsStore } from '@/store/settings'

afterEach(() => {
  cleanup()
  useSettingsStore.setState({ customStatuses: [] })
  localStorage.clear()
})

it.each(['{Escape}', '{Enter}', '{Tab}'])('persists custom statuses on %s', async (key) => {
  useSettingsStore.setState({ customStatuses: [] })
  function Host() {
    const [open, setOpen] = useState(true)
    return open ? <CanvasSettingsDialog onClose={() => setOpen(false)} /> : null
  }
  render(<Host />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Custom statuses' }), 'Proposed, Live, Proposed')
  await user.keyboard(key)
  if (key === '{Escape}') expect(screen.queryByRole('dialog')).toBeNull()
  expect(useSettingsStore.getState().customStatuses).toEqual(['Proposed'])
  expect(JSON.parse(localStorage.getItem('c4hero.json')!).customStatuses).toEqual(['Proposed'])
})
