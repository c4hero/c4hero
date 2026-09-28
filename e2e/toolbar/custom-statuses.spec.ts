import { test, expect } from '../fixtures/workspace'

test('Escape saves custom statuses for the inspector and highlighter', async ({ workspace }) => {
  await workspace.loadSample()
  const page = workspace.page
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Canvas Settings' })
  const input = dialog.getByRole('textbox', { name: 'Custom statuses' })
  await input.fill('Proposed')
  await input.press('Escape')
  await expect(dialog).not.toBeVisible()

  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click()
  await expect(input).toHaveValue('Proposed')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await workspace.clickNode('Personal Banking Customer')
  await workspace.selectStatus('Proposed')
  await expect(page.getByRole('button', { name: 'Status: Proposed', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('highlighter-segment-status').click()
  await expect(page.getByRole('dialog', { name: /Highlight by Status/ }).getByRole('button', { name: /^Proposed\b/ })).toBeVisible()
})
