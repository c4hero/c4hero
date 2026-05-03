import { test, expect } from '../fixtures/workspace'

async function openSpotlight(workspace: { page: import('@playwright/test').Page }) {
  await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
  return workspace.page.getByRole('complementary', { name: 'Spotlight filters' })
}

test.describe('Tag Filtering', () => {
  test('Spotlight panel lists custom tags from the view', async ({ workspace }) => {
    await workspace.loadSample()
    const panel = await openSpotlight(workspace)
    await expect(panel.getByRole('button', { name: 'Customer', exact: true })).toBeVisible()
  })

  test('toggling a tag in the panel marks it pressed', async ({ workspace }) => {
    await workspace.loadSample()
    const panel = await openSpotlight(workspace)
    const btn = panel.getByRole('button', { name: 'Customer', exact: true })
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  test('toggling an active tag clears that filter', async ({ workspace }) => {
    await workspace.loadSample()
    const panel = await openSpotlight(workspace)
    const btn = panel.getByRole('button', { name: 'Customer', exact: true })
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await btn.click()
    await expect(btn).not.toHaveAttribute('aria-pressed', 'true')
  })

  test('renaming an active custom tag keeps the filter usable', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    let panel = await openSpotlight(workspace)
    await panel.getByRole('button', { name: 'Critical', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Critical', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // Close the spotlight panel before opening tag manager
    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()

    await workspace.page.getByRole('button', { name: 'Manage tags' }).click()
    const tagInput = workspace.page.locator('input[type="text"][value="Critical"]')
    await tagInput.click()
    await tagInput.fill('Urgent')
    await workspace.page.getByRole('button', { name: 'Confirm rename' }).click()

    // Close the TagManagerPanel before re-opening spotlight (its full-screen
    // close overlay would otherwise intercept the rail button click).
    await workspace.page.getByRole('button', { name: 'Close tag manager' }).click()

    panel = await openSpotlight(workspace)
    const urgent = panel.getByRole('button', { name: 'Urgent', exact: true })
    await expect(urgent).toBeVisible()
    await expect(urgent).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByRole('button', { name: 'Critical', exact: true })).toHaveCount(0)
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).toContain('Urgent')
  })

  test('removing an active custom tag clears the stale filter', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    const panel = await openSpotlight(workspace)
    await panel.getByRole('button', { name: 'Critical', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Critical', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    await workspace.page.getByRole('button', { name: 'Manage tags' }).click()
    await workspace.page.getByRole('button', { name: 'Remove tag "Critical" globally' }).click()

    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).not.toContain('Critical')
  })
})
