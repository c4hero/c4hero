import { test, expect } from '../fixtures/workspace'

test.describe('spotlight panel', () => {
  test('opens via the Filter rail button and lets you toggle a Tag', async ({ workspace }) => {
    await workspace.loadSample()

    // Open the spotlight panel via the rail button. The label varies by state.
    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    const panel = workspace.page.getByRole('complementary', { name: 'Highlighter' })
    await expect(panel).toBeVisible()

    // Toggle the Customer tag.
    await panel.getByRole('button', { name: /^Customer\b/, exact: false }).click()

    // After toggling, at least one node should carry the spotlit class.
    const spotlit = workspace.page.locator('.react-flow__node.c4-node-spotlit')
    await expect.poll(async () => spotlit.count()).toBeGreaterThan(0)
  })

  test('clicking a facet chip does not close the inspector', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()

    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    const panel = workspace.page.getByRole('complementary', { name: 'Highlighter' })
    await panel.getByRole('button', { name: /^Customer\b/, exact: false }).click()
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()
  })

  test('focus mode: spotlit nodes pop, non-matches fade as ghost context', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.page.getByTestId('spotlight-rail-trigger').getByRole('button').click()
    const panel = workspace.page.getByRole('complementary', { name: 'Highlighter' })
    await panel.getByRole('button', { name: /^Customer\b/, exact: false }).click()

    // At least one node should carry the spotlit class — the focused match.
    const spotlit = workspace.page.locator('.react-flow__node.c4-node-spotlit')
    await expect.poll(async () => spotlit.count()).toBeGreaterThan(0)

    // At least one other node should carry the faded class — ghost context.
    const faded = workspace.page.locator('.react-flow__node.c4-node-spotlit-faded')
    await expect.poll(async () => faded.count()).toBeGreaterThan(0)

    // Faded nodes are visibly dimmed (allow a beat for the opacity transition).
    await expect.poll(
      async () => Number(await faded.first().evaluate((n) => getComputedStyle(n).opacity)),
      { timeout: 2000 },
    ).toBeLessThan(0.5)
  })
})
