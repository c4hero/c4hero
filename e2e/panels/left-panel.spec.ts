import { test, expect } from '../fixtures/workspace'

test.describe('Left Panel', () => {
  test('shows view list', async ({ workspace }) => {
    await workspace.loadSample()
    await expect(workspace.page.locator('text=Views').first()).toBeVisible()
  })

  test('clicking a view switches the canvas', async ({ workspace }) => {
    await workspace.loadSample()
    // Switch to Containers view via left panel
    const containersView = workspace.page.locator('button', { hasText: 'Containers' }).first()
    await containersView.click()
    await workspace.page.waitForTimeout(300)
    const afterCount = await workspace.getNodeCount()
    expect(afterCount).toBeGreaterThan(0)
  })

  test('model tree shows elements after clicking Model tab', async ({ workspace }) => {
    await workspace.loadSample()
    // Click the "Model" tab - look for it by its text directly
    await workspace.page.locator('button').filter({ hasText: /^Model$/ }).first().click()
    await workspace.page.waitForTimeout(300)
    // Should show system names in the model tree
    await expect(workspace.page.getByText('Internet Banking System').first()).toBeVisible()
  })

  test('create view button opens dialog', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByTitle('Create view').click()
    await expect(workspace.page.locator('h2', { hasText: 'Create View' })).toBeVisible()
  })
})
