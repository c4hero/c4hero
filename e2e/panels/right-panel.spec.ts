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
    await expect(workspace.page.getByLabel('Element properties')).toHaveCount(0)
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

  test('relationship controls stay neutral by default and can be reset to defaults', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.locator('[aria-label^="Edge from "]').first().click({ force: true })

    const defaultInteraction = workspace.page.getByRole('button', { name: 'Interaction style: Default' })
    const asyncInteraction = workspace.page.getByRole('button', { name: 'Interaction style: Asynchronous' })
    const defaultLineStyle = workspace.page.getByRole('button', { name: 'Line style: Default' })
    const straightLineStyle = workspace.page.getByRole('button', { name: 'Line style: Straight' })

    await expect(defaultInteraction).toHaveAttribute('aria-pressed', 'true')
    await expect(asyncInteraction).toHaveAttribute('aria-pressed', 'false')
    await expect(defaultLineStyle).toHaveAttribute('aria-pressed', 'true')
    await expect(straightLineStyle).toHaveAttribute('aria-pressed', 'false')

    await asyncInteraction.click()
    await straightLineStyle.click()
    let current = await workspace.getWorkspace()
    let relationship = current?.model.relationships.find((item) => item.interactionStyle === 'Asynchronous')
    expect(relationship?.lineStyle).toBe('Straight')

    await defaultInteraction.click()
    await defaultLineStyle.click()

    current = await workspace.getWorkspace()
    relationship = current?.model.relationships.find((item) => item.id === relationship?.id)
    expect(relationship?.interactionStyle).toBeUndefined()
    expect(relationship?.lineStyle).toBeUndefined()
  })
})
