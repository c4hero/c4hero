import { test, expect } from '../fixtures/workspace'

test.describe('Welcome Screen', () => {
  test('renders welcome screen with action cards', async ({ workspace }) => {
    await workspace.goto()
    await expect(workspace.page.getByText('Visual architecture modelling')).toBeVisible()
    await expect(workspace.page.getByText('Open .dsl file')).toBeVisible()
    await expect(workspace.page.getByText('Blank workspace')).toBeVisible()
    await expect(workspace.page.getByText('Explore sample')).toBeVisible()
  })

  test('loads sample workspace and shows canvas', async ({ workspace }) => {
    await workspace.loadSample()
    // Should show the Big Bank canvas with nodes
    const nodeCount = await workspace.getNodeCount()
    expect(nodeCount).toBeGreaterThan(0)
    // Should have the System Landscape view active (check breadcrumb area)
    await expect(workspace.page.locator('.react-flow')).toBeVisible()
  })

  test('loads blank workspace and shows empty canvas', async ({ workspace }) => {
    await workspace.loadBlank()
    const nodeCount = await workspace.getNodeCount()
    expect(nodeCount).toBe(0)
  })

  test('templates are visible', async ({ workspace }) => {
    await workspace.goto()
    await expect(workspace.page.getByText('Microservices')).toBeVisible()
    await expect(workspace.page.getByText('Monolith')).toBeVisible()
    await expect(workspace.page.getByText('Event-Driven')).toBeVisible()
  })
})
