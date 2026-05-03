import { test, expect } from '../fixtures/workspace'

test.describe('spotlight panel', () => {
  test('opens via the Filter rail button and lets you toggle a Tag', async ({ workspace }) => {
    await workspace.loadSample()

    // Open the spotlight panel via the rail button. The label varies by state.
    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    const panel = workspace.page.getByRole('complementary', { name: 'Spotlight filters' })
    await expect(panel).toBeVisible()

    // Toggle the Customer tag.
    await panel.getByRole('button', { name: 'Customer', exact: true }).click()

    // After toggling, at least one node should carry the spotlit class.
    const spotlit = workspace.page.locator('.react-flow__node.c4-node-spotlit')
    await expect.poll(async () => spotlit.count()).toBeGreaterThan(0)
  })

  test('clicking a facet chip does not close the inspector', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()

    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    const panel = workspace.page.getByRole('complementary', { name: 'Spotlight filters' })
    await panel.getByRole('button', { name: 'Customer', exact: true }).click()
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()
  })

  test('spotlit nodes are not dimmed; non-matches stay at full opacity', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    const panel = workspace.page.getByRole('complementary', { name: 'Spotlight filters' })
    await panel.getByRole('button', { name: 'Customer', exact: true }).click()

    const nodes = workspace.page.locator('.react-flow__node:not(.react-flow__node-group)')
    const count = await nodes.count()
    for (let i = 0; i < count; i++) {
      const opacity = await nodes.nth(i).evaluate((n) => Number(getComputedStyle(n).opacity))
      expect(opacity).toBeGreaterThanOrEqual(0.95)
    }
  })
})
