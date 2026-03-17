import { test, expect } from '../fixtures/workspace'

test.describe('View Management', () => {
  test('create view dialog opens and creates a view', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByTitle('Create view').click()
    await expect(workspace.page.locator('h2', { hasText: 'Create View' })).toBeVisible()

    // Fill in title and create
    await workspace.page.getByPlaceholder('e.g. System Overview').fill('Test View')
    await workspace.page.locator('button', { hasText: 'Create View' }).last().click()

    // Dialog should close and new view should be active
    await workspace.page.waitForTimeout(300)
    await expect(workspace.page.locator('h2', { hasText: 'Create View' })).not.toBeVisible()
  })

  test('switching views updates canvas', async ({ workspace }) => {
    await workspace.loadSample()
    const landscapeNodes = await workspace.getNodeCount()

    // Switch to Containers view via left panel
    const containersView = workspace.page.locator('button', { hasText: 'Containers' }).first()
    await containersView.click()
    await workspace.page.waitForTimeout(300)
    const containerNodes = await workspace.getNodeCount()

    // Container view typically has more nodes (includes containers + external systems)
    expect(containerNodes).toBeGreaterThan(0)
    expect(containerNodes).not.toBe(landscapeNodes)
  })
})
