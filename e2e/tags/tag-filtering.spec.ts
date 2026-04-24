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

  test('renaming an active custom tag keeps the filter usable', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    const criticalTag = workspace.page.getByRole('button', { name: 'Critical', exact: true })
    await criticalTag.click()
    await expect(criticalTag).toHaveAttribute('data-active', 'true')

    await workspace.page.getByRole('button', { name: 'Manage tags' }).click()
    const tagInput = workspace.page.locator('input[type="text"]').nth(1)
    await tagInput.fill('Urgent')
    await workspace.page.getByRole('button', { name: 'Confirm rename' }).click()

    const urgentTag = workspace.page.getByRole('button', { name: 'Urgent', exact: true })
    await expect(urgentTag).toBeVisible()
    await expect(urgentTag).toHaveAttribute('data-active', 'true')
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Critical', exact: true })).toHaveCount(0)

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).toContain('Urgent')
  })

  test('removing an active custom tag clears the stale filter', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    const criticalTag = workspace.page.getByRole('button', { name: 'Critical', exact: true })
    await criticalTag.click()
    await expect(criticalTag).toHaveAttribute('data-active', 'true')

    await workspace.page.getByRole('button', { name: 'Manage tags' }).click()
    await workspace.page.getByRole('button', { name: 'Remove tag "Critical" globally' }).click()

    await expect(workspace.page.getByRole('button', { name: 'Critical', exact: true })).toHaveCount(0)
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).not.toContain('Critical')
  })
})
