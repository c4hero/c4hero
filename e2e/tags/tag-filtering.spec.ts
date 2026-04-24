import { test, expect } from '../fixtures/workspace'

test.describe('Tag Filtering', () => {
  test('bottom bar shows custom tags', async ({ workspace }) => {
    await workspace.loadSample()
    await expect(workspace.page.getByRole('button', { name: 'Customer', exact: true })).toBeVisible()
  })

  test('clicking a tag filters the view', async ({ workspace }) => {
    await workspace.loadSample()
    const tagButton = workspace.page.getByRole('button', { name: 'Customer', exact: true })
    await tagButton.click()
    await expect(tagButton).toHaveAttribute('data-active', 'true')
  })

  test('clicking active tag clears the filter', async ({ workspace }) => {
    await workspace.loadSample()
    const tagButton = workspace.page.getByRole('button', { name: 'Customer', exact: true })
    await tagButton.click()
    await tagButton.click()
    await expect(tagButton).not.toHaveAttribute('data-active', 'true')
  })
})
