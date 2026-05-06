import { test, expect } from '../fixtures/workspace'

async function openHighlighter(workspace: { page: import('@playwright/test').Page }) {
  await workspace.page.getByTestId('highlighter-segment-tags').click()
  return workspace.page.getByRole('dialog', { name: /Highlight by Tag/ })
}

test.describe('Tag Filtering', () => {
  test('Highlighter Tag flyout lists custom tags from the view', async ({ workspace }) => {
    await workspace.loadSample()
    const panel = await openHighlighter(workspace)
    await expect(panel.getByRole('button', { name: /^Customer\b/, exact: false })).toBeVisible()
  })

  test('toggling a tag in the flyout marks it pressed', async ({ workspace }) => {
    await workspace.loadSample()
    const panel = await openHighlighter(workspace)
    const btn = panel.getByRole('button', { name: /^Customer\b/, exact: false })
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  test('toggling an active tag clears that filter', async ({ workspace }) => {
    await workspace.loadSample()
    const panel = await openHighlighter(workspace)
    const btn = panel.getByRole('button', { name: /^Customer\b/, exact: false })
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

    const panel = await openHighlighter(workspace)
    await panel.getByRole('button', { name: /^Critical\b/, exact: false }).click()
    await expect(panel.getByRole('button', { name: /^Critical\b/, exact: false })).toHaveAttribute('aria-pressed', 'true')

    // Open the new modal-style Manage tags dialog from the Highlighter Tag flyout.
    await panel.getByRole('button', { name: 'Edit tag styles' }).click()
    const dialog = workspace.page.getByRole('dialog', { name: 'Manage tags' })
    await expect(dialog).toBeVisible()

    const tagInput = dialog.getByRole('textbox', { name: 'Rename tag Critical' })
    await tagInput.click()
    await tagInput.fill('Urgent')
    await tagInput.press('Enter')

    await dialog.getByRole('button', { name: 'Close tag manager' }).click()
    const urgent = panel.getByRole('button', { name: /^Urgent\b/, exact: false })
    await expect(urgent).toBeVisible()
    await expect(urgent).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByRole('button', { name: /^Critical\b/, exact: false })).toHaveCount(0)
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).toContain('Urgent')
  })

  test('removing an active custom tag clears the stale filter', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.addTag('Critical')

    const panel = await openHighlighter(workspace)
    await panel.getByRole('button', { name: /^Critical\b/, exact: false }).click()
    await expect(panel.getByRole('button', { name: /^Critical\b/, exact: false })).toHaveAttribute('aria-pressed', 'true')

    await panel.getByRole('button', { name: 'Edit tag styles' }).click()
    const dialog = workspace.page.getByRole('dialog', { name: 'Manage tags' })
    await dialog.getByRole('button', { name: 'Remove tag Critical' }).click()

    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).not.toContain('Critical')
  })
})
