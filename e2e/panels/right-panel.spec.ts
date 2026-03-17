import { test, expect } from '../fixtures/workspace'

test.describe('Right Panel', () => {
  test('shows element properties when node selected', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.page.waitForTimeout(300)
    // The properties tab content should be visible - check for status dropdown as indicator
    await expect(workspace.page.getByTestId('element-status')).toBeVisible()
  })

  test('shows status dropdown', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.page.waitForTimeout(300)
    await expect(workspace.page.getByTestId('element-status')).toBeVisible()
  })

  test('shows owner field', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.page.waitForTimeout(300)
    await expect(workspace.page.getByPlaceholder('e.g. Team Alpha')).toBeVisible()
  })

  test('shows URL field', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.page.waitForTimeout(300)
    await expect(workspace.page.getByPlaceholder('https://...')).toBeVisible()
  })

  test('shows "appears in views" section', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.page.waitForTimeout(300)
    await expect(workspace.page.getByText('Appears in views').first()).toBeVisible()
  })

  test('view properties shows include/exclude checkboxes when nothing selected', async ({ workspace }) => {
    await workspace.loadSample()
    // Click empty area of canvas to clear selection
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } })
    await workspace.page.waitForTimeout(500)
    // Should show view properties with element checkboxes
    await expect(workspace.page.getByText('Elements in view').first()).toBeVisible()
  })
})
