import { test, expect } from '../fixtures/workspace'

test.describe('Search Dialog', () => {
  test('opens with Ctrl+K', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
    await workspace.page.keyboard.press('Control+k')
    await expect(workspace.page.getByPlaceholder('Search elements, views, technology...')).toBeVisible()
  })

  test('shows type filter pills', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
    await workspace.page.keyboard.press('Control+k')
    await workspace.page.waitForTimeout(200)
    // Type filter pills - use text content matching
    await expect(workspace.page.locator('button:text-is("Person")').last()).toBeVisible()
    await expect(workspace.page.locator('button:text-is("System")').last()).toBeVisible()
    await expect(workspace.page.locator('button:text-is("Container")').last()).toBeVisible()
    await expect(workspace.page.locator('button:text-is("Component")').last()).toBeVisible()
  })

  test('searches by name', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
    await workspace.page.keyboard.press('Control+k')
    await workspace.page.getByPlaceholder('Search elements, views, technology...').fill('Internet Banking')
    await workspace.page.waitForTimeout(200)
    // Should find the system - use truncate class to target the name div
    await expect(workspace.page.locator('.truncate.font-medium', { hasText: 'Internet Banking System' }).first()).toBeVisible()
  })

  test('searches by technology', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
    await workspace.page.keyboard.press('Control+k')
    await workspace.page.getByPlaceholder('Search elements, views, technology...').fill('Angular')
    await workspace.page.waitForTimeout(200)
    await expect(workspace.page.locator('.truncate.font-medium', { hasText: 'Single-Page Application' }).first()).toBeVisible()
  })

  test('type filter narrows results', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
    await workspace.page.keyboard.press('Control+k')
    // Click Person filter pill
    await workspace.page.locator('button:text-is("Person")').last().click()
    // Clear search to show all person results
    await workspace.page.getByPlaceholder('Search elements, views, technology...').fill(' ')
    await workspace.page.waitForTimeout(200)
    await expect(workspace.page.locator('.truncate.font-medium', { hasText: 'Personal Banking Customer' }).first()).toBeVisible()
  })

  test('closes with Escape', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
    await workspace.page.keyboard.press('Control+k')
    await expect(workspace.page.getByPlaceholder('Search elements, views, technology...')).toBeVisible()
    await workspace.page.keyboard.press('Escape')
    await expect(workspace.page.getByPlaceholder('Search elements, views, technology...')).not.toBeVisible()
  })
})
