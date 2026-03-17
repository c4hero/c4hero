import { test, expect } from '../fixtures/workspace'

test.describe('Context Menu', () => {
  test('right-click on canvas shows add options', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.rightClickCanvas()
    await expect(workspace.page.getByText('Add Person').first()).toBeVisible()
    await expect(workspace.page.getByText('Add System').first()).toBeVisible()
  })

  test('right-click on node shows delete option', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.waitForTimeout(500)
    // Use the ATM node which should be visible in the landscape view
    const node = workspace.page.locator('.react-flow__node', { hasText: 'ATM' })
    await node.waitFor({ state: 'visible' })
    const box = await node.boundingBox()
    if (box) {
      await workspace.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    }
    await workspace.page.waitForTimeout(300)
    // Context menu has a fixed z-[90] container with menu items
    await expect(workspace.page.locator('.fixed.z-\\[90\\]').getByText('Delete')).toBeVisible()
  })

  test('adding element from context menu', async ({ workspace }) => {
    await workspace.loadBlank()
    const before = await workspace.getNodeCount()
    await workspace.rightClickCanvas()
    await workspace.page.getByText('Add Person').first().click()
    const after = await workspace.getNodeCount()
    expect(after).toBe(before + 1)
  })
})
