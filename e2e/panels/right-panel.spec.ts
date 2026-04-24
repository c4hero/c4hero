import { test, expect } from '../fixtures/workspace'

test.describe('Right Panel', () => {
  test('shows element properties when node selected', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByTestId('element-status')).toBeVisible()
  })

  test('shows status dropdown', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByTestId('element-status')).toBeVisible()
  })

  test('shows owner field', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByPlaceholder('e.g. Team Alpha')).toBeVisible()
  })

  test('shows URL field', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByPlaceholder('https://...')).toBeVisible()
  })

  test('shows "appears in views" section', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByText('Appears in views').first()).toBeVisible()
  })

  test('inspector stays hidden when nothing is selected', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } })
    await expect(workspace.page.getByLabel('Element properties')).toHaveCSS('pointer-events', 'none')
  })

  test('multi-select mode hides the inspector until it is turned off', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByLabel('Element properties')).toHaveCSS('pointer-events', 'auto')

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await expect(workspace.page.getByLabel('Element properties')).toHaveCount(0)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await expect(workspace.page.getByLabel('Element properties')).toHaveCSS('pointer-events', 'auto')
  })
})
