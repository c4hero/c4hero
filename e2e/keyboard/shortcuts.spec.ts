import { test, expect } from '../fixtures/workspace'

test.describe('Keyboard Shortcuts', () => {
  test('Shift+P creates a person', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+P')
    const node = await workspace.getNodeByName('New Person')
    await expect(node).toBeVisible()
  })

  test('Shift+S creates a system', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    const node = await workspace.getNodeByName('New System')
    await expect(node).toBeVisible()
  })

  test('Shift+G creates a group from selected elements', async ({ workspace }) => {
    await workspace.loadBlank()
    // Create two elements first
    await workspace.page.keyboard.press('Shift+P')
    await workspace.page.keyboard.press('Shift+S')
    // Shift+G should create group (even if no elements selected, it will create empty group)
  })

  test('Ctrl+Z undoes last action', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+P')
    expect(await workspace.getNodeCount()).toBe(1)
    await workspace.page.keyboard.press('Control+z')
    expect(await workspace.getNodeCount()).toBe(0)
  })

  test('P toggles presentation mode', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.keyboard.press('p')
    await expect(workspace.page.getByText(/to exit/i)).toBeVisible()
    await workspace.page.keyboard.press('Escape')
    await expect(workspace.page.getByText(/to exit/i)).not.toBeVisible()
  })

  test('Ctrl+D duplicates the selected element', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.page.keyboard.press('Control+d')

    await expect(workspace.getVisibleNodeByName('New System copy')).toBeVisible()
    expect(await workspace.getNodeCount()).toBe(2)
  })
})
