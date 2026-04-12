import { test, expect } from '../fixtures/workspace'

test.describe('Canvas Navigation', () => {
  test('double-click drills into a system', async ({ workspace }) => {
    await workspace.loadSample()
    // Double-click Internet Banking System to drill into container view
    await workspace.doubleClickNode('Internet Banking System')
    // Should see container-level nodes like API Application
    const apiNode = await workspace.getNodeByName('API Application')
    await expect(apiNode).toBeVisible()
  })

  test('backspace navigates back', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.doubleClickNode('Internet Banking System')
    // Wait for drill-down to complete
    await expect(await workspace.getNodeByName('API Application')).toBeVisible()
    // Navigate back
    await workspace.page.keyboard.press('Backspace')
    // Should be back at landscape - ATM visible again
    const atm = await workspace.getNodeByName('ATM')
    await expect(atm).toBeVisible()
  })

  test('undo/redo works', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+P')
    const after = await workspace.getNodeCount()
    expect(after).toBe(1)
    // Undo
    await workspace.page.keyboard.press('Control+z')
    const afterUndo = await workspace.getNodeCount()
    expect(afterUndo).toBe(0)
    // Redo
    await workspace.page.keyboard.press('Control+Shift+z')
    const afterRedo = await workspace.getNodeCount()
    expect(afterRedo).toBe(1)
  })
})
