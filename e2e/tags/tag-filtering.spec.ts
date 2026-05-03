import { test, expect } from '../fixtures/workspace'

test.describe('Tag Filtering', () => {
  test('Tags popover lists custom tags from the view', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: /^Tags/ }).click()
    const popover = workspace.page.getByRole('dialog', { name: 'Tags filter' })
    await expect(popover.getByRole('button', { name: 'Customer', exact: true })).toBeVisible()
  })

  test('toggling a tag from the popover surfaces a removable chip', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: /^Tags/ }).click()
    const popover = workspace.page.getByRole('dialog', { name: 'Tags filter' })
    await popover.getByRole('button', { name: 'Customer', exact: true }).click()
    await workspace.page.keyboard.press('Escape')
    // Chip button has title="Remove Customer" but text content "Customer"
    // Use the title attribute selector for a unique match
    await expect(workspace.page.locator('button[title="Remove Customer"]')).toBeVisible()
  })

  test('clicking the active tag chip clears that filter', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: /^Tags/ }).click()
    await workspace.page.getByRole('dialog', { name: 'Tags filter' })
      .getByRole('button', { name: 'Customer', exact: true }).click()
    await workspace.page.keyboard.press('Escape')
    const chip = workspace.page.locator('button[title="Remove Customer"]')
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(chip).toHaveCount(0)
  })

  test('renaming an active custom tag keeps the filter usable', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    // Select the Critical tag from the Tags popover
    await workspace.page.getByRole('button', { name: /^Tags/ }).click()
    await workspace.page.getByRole('dialog', { name: 'Tags filter' })
      .getByRole('button', { name: 'Critical', exact: true }).click()
    await workspace.page.keyboard.press('Escape')

    // Chip for Critical should now be visible
    await expect(workspace.page.locator('button[title="Remove Critical"]')).toBeVisible()

    // Open the Manage tags panel and rename Critical -> Urgent
    await workspace.page.getByRole('button', { name: 'Manage tags' }).click()
    const tagInput = workspace.page.locator('input[type="text"][value="Critical"]')
    await tagInput.click()
    await tagInput.fill('Urgent')
    await workspace.page.getByRole('button', { name: 'Confirm rename' }).click()

    // After rename: Urgent chip appears, Critical chip is gone, filter still active
    await expect(workspace.page.locator('button[title="Remove Urgent"]')).toBeVisible()
    await expect(workspace.page.locator('button[title="Remove Critical"]')).toHaveCount(0)
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).toContain('Urgent')
  })

  test('removing an active custom tag clears the stale filter', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    // Select the Critical tag from the Tags popover
    await workspace.page.getByRole('button', { name: /^Tags/ }).click()
    await workspace.page.getByRole('dialog', { name: 'Tags filter' })
      .getByRole('button', { name: 'Critical', exact: true }).click()
    await workspace.page.keyboard.press('Escape')

    await expect(workspace.page.locator('button[title="Remove Critical"]')).toBeVisible()

    // Open Manage tags and delete Critical globally
    await workspace.page.getByRole('button', { name: 'Manage tags' }).click()
    await workspace.page.getByRole('button', { name: 'Remove tag "Critical" globally' }).click()

    // Critical chip is gone
    await expect(workspace.page.locator('button[title="Remove Critical"]')).toHaveCount(0)
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).not.toContain('Critical')
  })
})
