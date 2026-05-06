import { test, expect } from '../fixtures/workspace'

test.describe('highlighter bar', () => {
  test('opens the Tag flyout via the segment and lets you toggle a Tag', async ({ workspace }) => {
    await workspace.loadSample()

    // Open the Tag facet flyout via the bottom-bar segment.
    await workspace.page.getByTestId('highlighter-segment-tags').click()
    const flyout = workspace.page.getByRole('dialog', { name: /Highlight by Tag/ })
    await expect(flyout).toBeVisible()

    // Toggle the Customer tag.
    await flyout.getByRole('button', { name: /^Customer\b/, exact: false }).click()

    // After toggling, at least one node should carry the highlighted class.
    const highlighted = workspace.page.locator('.react-flow__node.c4-node-highlighted')
    await expect.poll(async () => highlighted.count()).toBeGreaterThan(0)
  })

  test('clicking a facet chip does not close the inspector', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.clickNode('Personal Banking Customer')
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()

    await workspace.page.getByTestId('highlighter-segment-tags').click()
    const flyout = workspace.page.getByRole('dialog', { name: /Highlight by Tag/ })
    await flyout.getByRole('button', { name: /^Customer\b/, exact: false }).click({ force: true })
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()
  })

  test('focus mode: highlighted nodes pop, non-matches fade as ghost context', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.page.getByTestId('highlighter-segment-tags').click()
    const flyout = workspace.page.getByRole('dialog', { name: /Highlight by Tag/ })
    await flyout.getByRole('button', { name: /^Customer\b/, exact: false }).click()

    // At least one node should carry the highlighted class — the focused match.
    const highlighted = workspace.page.locator('.react-flow__node.c4-node-highlighted')
    await expect.poll(async () => highlighted.count()).toBeGreaterThan(0)

    // At least one other node should carry the faded class — ghost context.
    const faded = workspace.page.locator('.react-flow__node.c4-node-faded')
    await expect.poll(async () => faded.count()).toBeGreaterThan(0)

    // Faded nodes are visibly dimmed (allow a beat for the opacity transition).
    await expect.poll(
      async () => Number(await faded.first().evaluate((n) => getComputedStyle(n).opacity)),
      { timeout: 2000 },
    ).toBeLessThan(0.5)
  })

  test('bar is always visible and the count badge appears on a segment when filters are active', async ({ workspace }) => {
    await workspace.loadSample()

    // The four segments are visible without any user action.
    await expect(workspace.page.getByTestId('highlighter-segment-tags')).toBeVisible()
    await expect(workspace.page.getByTestId('highlighter-segment-status')).toBeVisible()
    await expect(workspace.page.getByTestId('highlighter-segment-tech')).toBeVisible()
    await expect(workspace.page.getByTestId('highlighter-segment-teams')).toBeVisible()

    // Apply a filter, close the flyout, and verify the segment shows a count badge.
    await workspace.page.getByTestId('highlighter-segment-tags').click()
    const flyout = workspace.page.getByRole('dialog', { name: /Highlight by Tag/ })
    await flyout.getByRole('button', { name: /^Customer\b/, exact: false }).click()
    await workspace.page.keyboard.press('Escape')
    await expect(flyout).not.toBeVisible()
    await expect(workspace.page.getByTestId('highlighter-segment-tags')).toContainText('1')
  })
})
