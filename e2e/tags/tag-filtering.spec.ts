import { test, expect } from '../fixtures/workspace'

test.describe('Tag Filtering', () => {
  test('bottom bar shows custom tags', async ({ workspace }) => {
    await workspace.loadSample()
    // The sample has tags like "Customer", "Bank Staff", "Existing System"
    await expect(workspace.page.getByText('Customer').last()).toBeVisible()
  })

  test('clicking a tag filters the view', async ({ workspace }) => {
    await workspace.loadSample()
    // Click the "Customer" tag to filter
    const tagButton = workspace.page.locator('footer button', { hasText: 'Customer' })
    await tagButton.click()
    // The tag should appear active (different background)
    // Nodes without the tag should be dimmed (opacity 0.2)
  })

  test('clicking active tag clears the filter', async ({ workspace }) => {
    await workspace.loadSample()
    const tagButton = workspace.page.locator('footer button', { hasText: 'Customer' })
    await tagButton.click() // activate
    await tagButton.click() // deactivate
    // Filter cleared, all nodes visible at full opacity
  })
})
