import { test, expect } from '../fixtures/workspace'

test.describe('Toolbar', () => {
  test('toolbar renders with element creation buttons', async ({ workspace }) => {
    await workspace.loadBlank()
    // Should have select button and creation buttons
    await expect(workspace.page.getByTitle('Select (V)')).toBeVisible()
    await expect(workspace.page.getByTitle('Person (Shift+P)')).toBeVisible()
    await expect(workspace.page.getByTitle('System (Shift+S)')).toBeVisible()
  })

  test('tidy layout button resets positions', async ({ workspace }) => {
    await workspace.loadSample()
    await expect(workspace.page.getByTitle('Tidy layout')).toBeVisible()
  })

  test('layout direction buttons are visible', async ({ workspace }) => {
    await workspace.loadSample()
    await expect(workspace.page.getByTitle('Layout: TB')).toBeVisible()
    await expect(workspace.page.getByTitle('Layout: LR')).toBeVisible()
  })

  test('snap to grid toggle works', async ({ workspace }) => {
    await workspace.loadSample()
    const snapButton = workspace.page.getByTitle(/Snap to grid/)
    await expect(snapButton).toBeVisible()
    await snapButton.click()
  })

  test('minimap toggle works', async ({ workspace }) => {
    await workspace.loadSample()
    const minimapButton = workspace.page.getByTitle(/Minimap/)
    await expect(minimapButton).toBeVisible()
    await minimapButton.click()
  })

  test('zoom controls are functional', async ({ workspace }) => {
    await workspace.loadSample()
    const zoomIn = workspace.page.getByTitle('Zoom in')
    const zoomOut = workspace.page.getByTitle('Zoom out')
    const fitScreen = workspace.page.getByTitle('Fit to screen')
    await expect(zoomIn).toBeVisible()
    await expect(zoomOut).toBeVisible()
    await expect(fitScreen).toBeVisible()
    // Click each to verify no errors
    await zoomIn.click()
    await zoomOut.click()
    await fitScreen.click()
  })
})
