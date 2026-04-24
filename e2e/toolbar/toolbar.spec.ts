import { test, expect } from '../fixtures/workspace'

test.describe('Toolbar', () => {
  test('tool rail renders the primary canvas actions', async ({ workspace }) => {
    await workspace.loadBlank()
    await expect(workspace.page.getByRole('button', { name: 'Add element' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Auto-arrange' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: /Multi-select/ })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Zoom to fit' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Canvas settings' })).toBeVisible()
  })

  test('auto-arrange menu exposes layout directions', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await expect(workspace.page.getByRole('menu')).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Top to bottom' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Left to right' })).toBeVisible()
    await workspace.page.getByRole('button', { name: 'Left to right' }).click()
  })

  test('canvas settings expose snap to grid and minimap controls', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Canvas settings' }).click()
    await expect(workspace.page.getByText('Snap to grid', { exact: true })).toBeVisible()
    await expect(workspace.page.getByText('Minimap', { exact: true })).toBeVisible()
    await workspace.page.getByLabel('Close dialog').click()
  })

  test('zoom controls are functional', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Canvas settings' }).click()
    await workspace.page.getByRole('switch').nth(1).click()
    await workspace.page.getByLabel('Close dialog').click()

    const zoomIn = workspace.page.getByRole('button', { name: 'Zoom in', exact: true })
    const zoomOut = workspace.page.getByRole('button', { name: 'Zoom out', exact: true })
    const fitScreen = workspace.page.getByRole('button', { name: 'Fit to screen', exact: true })
    await expect(zoomIn).toBeVisible()
    await expect(zoomOut).toBeVisible()
    await expect(fitScreen).toBeVisible()
    await zoomIn.click()
    await zoomOut.click()
    await fitScreen.click()
  })
})
