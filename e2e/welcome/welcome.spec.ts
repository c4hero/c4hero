import { test, expect } from '../fixtures/workspace'

test.describe('Welcome Screen', () => {
  test('renders welcome screen with the current startup actions', async ({ workspace }) => {
    await workspace.goto()
    await expect(workspace.page.getByText('Visual architecture modelling')).toBeVisible()
    await expect(workspace.page.getByText('Open collection')).toBeVisible()
    await expect(workspace.page.getByText('New collection')).toBeVisible()
    await expect(workspace.page.getByText('Architecture diagrams that')).toBeVisible()
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

  test('welcome screen shows capability pills for the supported workflow', async ({ workspace }) => {
    await workspace.goto()
    await expect(workspace.page.getByText('.dsl files')).toBeVisible()
    await expect(workspace.page.getByText('Git-friendly')).toBeVisible()
    await expect(workspace.page.getByText('C4 model')).toBeVisible()
    await expect(workspace.page.getByText('Export PNG/SVG')).toBeVisible()
  })
})
