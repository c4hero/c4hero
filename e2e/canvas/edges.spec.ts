import { test, expect } from '../fixtures/workspace'

/** The DSL from #230: two of the container view's relationships are declared
 *  below the level it shows. */
const IMPLIED_DSL = `workspace "Container view include *" {
  model {
    user = person "User"
    a = softwareSystem "System A" {
      web = container "Web" {
        ctrl = component "Controller"
      }
      db = container "Database"
    }
    b = softwareSystem "System B" {
      api = container "B API"
    }
    user -> ctrl "Uses"
    web -> db "Reads from"
    web -> api "Calls"
  }
  views {
    container a "ContainersA" {
      include *
      autolayout lr
    }
  }
}`

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

  test('an include * view draws the relationships Structurizr implies (#230)', async ({ workspace }) => {
    await workspace.parseAndLoad(IMPLIED_DSL)
    await workspace.setView('ContainersA')

    // Structurizr draws User -> Web (from user -> ctrl) and Web -> System B
    // (from web -> api) besides Web -> Database.
    const edges = workspace.page.locator('.react-flow__edge')
    await expect(edges).toHaveCount(3)
    for (const label of ['Uses', 'Reads from', 'Calls']) {
      await expect(workspace.page.getByText(label, { exact: true })).toBeVisible()
    }

    // Selecting an implied arrow selects the relationship it comes from and
    // says so; there is no hiding it on its own.
    const ids = await edges.evaluateAll((els) => els.map((el) => el.getAttribute('data-id') ?? ''))
    const implied = ids.findIndex((id) => id.startsWith('implied:') && id.endsWith('->web'))
    expect(implied).toBeGreaterThanOrEqual(0)
    await workspace.clickRelationship(implied)
    await expect(workspace.page.getByTestId('implied-relationship-note')).toContainText('Shown in this view as User → Web')
    await expect(workspace.page.getByLabel('Remove relationship from view')).toHaveCount(0)
    await workspace.page.keyboard.press('Backspace')
    await expect(edges).toHaveCount(3)
  })

  test('an include * view draws no arrow its exclude "* -> *" line hides (#230)', async ({ workspace }) => {
    await workspace.parseAndLoad(IMPLIED_DSL.replace('include *\n', 'include *\n      exclude "* -> *"\n'))
    await workspace.setView('ContainersA')

    // Structurizr hides the implied User -> Web and Web -> System B too.
    await expect(workspace.page.locator('.react-flow__node').filter({ hasText: 'System B' })).toHaveCount(1)
    await expect(workspace.page.locator('.react-flow__edge')).toHaveCount(0)
  })
})
