import { test, expect } from '../fixtures/workspace'

test.describe('Canvas Edges', () => {
  test('edges render between connected nodes', async ({ workspace }) => {
    await workspace.loadSample()
    const edgeCount = await workspace.getEdgeCount()
    expect(edgeCount).toBeGreaterThan(0)
  })

  test('edge labels show description text', async ({ workspace }) => {
    await workspace.loadSample()
    // Check for a known relationship description
    await expect(workspace.page.getByText('Views account balances').first()).toBeVisible()
  })
})
