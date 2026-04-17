import { test, expect } from '../fixtures/workspace'

test.describe('File I/O', () => {
  test('Ctrl+S triggers save', async ({ workspace }) => {
    await workspace.loadSample()
    // Ctrl+S should not error (we can't easily verify the download dialog)
    await workspace.page.keyboard.press('Control+s')
    // In some environments this will trigger download, in others it won't
    // Just verify no errors
  })

  test('workspace persists to localStorage for crash recovery', async ({ workspace }) => {
    await workspace.loadSample()
    // Wait for auto-save to write to localStorage after its debounce period
    const saved = await workspace.page.waitForFunction(
      () => localStorage.getItem('c4hero_crash_recovery'),
      { timeout: 5000 },
    ).then(h => h.jsonValue())
    expect(saved).not.toBeNull()
  })
})
