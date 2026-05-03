import { test, expect } from '../fixtures/workspace'

const SAMPLE_DSL = `workspace "Payments Platform" "Architecture for a payments platform" {
  model {
    customer = person "Customer" "Pays for things"
    ops = person "Ops Analyst" "Monitors the system"

    payments = softwareSystem "Payments Platform" "Processes payments" {
      web = container "Web App" "Accepts orders" "React"
      api = container "Payments API" "Processes payment requests" "Node.js"
      db = container "Ledger DB" "Stores ledgers" "PostgreSQL"

      api -> db "Stores ledger entries" "JDBC"
      web -> api "Calls payment APIs" "HTTPS"
    }

    customer -> web "Places orders" "HTTPS"
    ops -> api "Investigates payment issues" "HTTPS"
  }

  views {
    systemContext payments "PaymentsContext" {
      include *
      autoLayout lr
    }

    container payments "PaymentsContainers" {
      include *
      autoLayout lr
    }
  }
}`

test.describe('Core end-to-end journeys', () => {
  test('1. welcome screen can transition from startup into a loaded sample workspace', async ({ workspace }) => {
    await workspace.goto()

    await expect(workspace.page.getByText(/Visual architecture modelling/)).toBeVisible()
    await workspace.page.evaluate(() => (window as Record<string, unknown>).__testLoadSample?.())

    await workspace.page.waitForURL(/\/collection\//)
    await expect(workspace.page.locator('.react-flow')).toBeVisible()
    await expect(workspace.page.getByText('Big Bank plc')).toBeVisible()

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems.length).toBeGreaterThan(0)
    expect(snapshot?.views.systemLandscapeViews[0]?.key).toBe('SystemLandscape')
  })

  test('2. command palette can create a new system context view for an existing system', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.createView('System Context', 'Internet Banking Context', 'Internet Banking System')

    const views = await workspace.getViews()
    expect(views.some((view) => view.title === 'Internet Banking Context' && view.type === 'systemContext')).toBe(true)

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.views.systemContextViews.some((view) => (view.title ?? view.key) === 'Internet Banking Context')).toBe(true)
  })

  test('3. add element panel plus inspector edits let a user create and describe a new external system', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.addElementFromPanel('External System')
    await workspace.expectInspectorFor('New External System')

    await workspace.fillEditableField('Element name', 'Fraud Service')
    await workspace.fillEditableField('Description', 'Scores suspicious transactions in real time')
    await workspace.fillEditableField('Owner', 'Risk Platform')
    await workspace.fillEditableField('URL', 'https://fraud.example.com')
    await workspace.selectStatus('Live')

    const element = await workspace.getElementByName('Fraud Service')
    expect(element).toMatchObject({
      name: 'Fraud Service',
      description: 'Scores suspicious transactions in real time',
      owner: 'Risk Platform',
      url: 'https://fraud.example.com',
      location: 'External',
      status: 'Live',
    })
  })

  test('4. a user can connect two systems and refine the relationship in the inspector', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    await workspace.selectNewestRelationship()

    await workspace.fillEditableField('Description', 'Submits charge requests')
    await workspace.fillEditableField('Technology', 'gRPC')
    await workspace.page.getByRole('button', { name: 'Interaction style: Asynchronous' }).click()
    await workspace.page.getByRole('button', { name: 'Line style: Orthogonal' }).click()

    const relationship = await workspace.getRelationshipByDescription('Submits charge requests')
    expect(relationship).toMatchObject({
      technology: 'gRPC',
      interactionStyle: 'Asynchronous',
      lineStyle: 'Orthogonal',
    })
  })

  test('5. duplicate current view creates a separate navigable view with the same scope', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.setView('Containers')

    const before = await workspace.getViews()
    const containerViewsBefore = before.filter((view) => view.type === 'container').length

    await workspace.runCommand('duplicate current view', 'Duplicate Current View')

    const after = await workspace.getViews()
    const duplicated = after.filter((view) => view.type === 'container')
    expect(duplicated.length).toBe(containerViewsBefore + 1)
    expect(duplicated.some((view) => /copy/i.test(view.title))).toBe(true)
  })

  test('6. search can jump to a component view and select a matching element', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('components')
    await workspace.page.keyboard.press('Enter')

    const views = await workspace.getViews()
    expect(views.some((view) => view.key === 'Components')).toBe(true)

    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('Sign In Controller')
    await workspace.page.keyboard.press('Enter')

    await workspace.expectInspectorFor('Sign In Controller')
    const element = await workspace.getElementByName('Sign In Controller')
    expect(element?.type).toBe('component')
  })

  test('7. authored view switching lets users move between context and container perspectives', async ({ workspace }) => {
    await workspace.parseAndLoad(SAMPLE_DSL)

    await workspace.setView('PaymentsContainers')
    await expect(workspace.getVisibleNodeByName('Payments API')).toBeVisible()
    await expect(workspace.getVisibleNodeByName('Ledger DB')).toBeVisible()

    await workspace.setView('PaymentsContext')
    await expect(workspace.getVisibleNodeByName('Payments Platform')).toBeVisible()
    await expect(workspace.page.locator('.react-flow__node').filter({ has: workspace.page.getByText('Ledger DB', { exact: true }) })).toHaveCount(0)
  })

  test('8. tags added in the inspector become searchable through the search dialog tag filter', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.fillEditableField('Element name', 'Catalog Service')
    await workspace.addTag('Critical')

    await workspace.openSearch()
    await workspace.page.getByRole('dialog', { name: 'Search' }).getByRole('button', { name: 'Critical' }).click()
    // After tag click, focus is on the button — clicking the search input
    // returns focus there so the Enter keydown reaches the dialog's keyboard
    // handler (which selects results[selectedIndex]).
    await workspace.page.getByPlaceholder('Search elements, views, technology...').click()
    await workspace.page.keyboard.press('Enter')
    await workspace.expectInspectorFor('Catalog Service')

    const element = await workspace.getElementByName('Catalog Service')
    expect(element?.tags).toContain('Critical')
  })

  test('9. grouping, undo, and redo preserve model state for selected elements', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.keyboard.press('Control+a')
    await workspace.page.keyboard.press('Shift+G')

    let snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.groups).toHaveLength(1)
    expect(snapshot?.model.groups[0]?.elementIds).toHaveLength(2)

    await workspace.page.keyboard.press('Control+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.groups).toHaveLength(0)

    await workspace.page.keyboard.press('Control+Shift+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.groups).toHaveLength(1)
  })

  test('10. users can load a custom DSL workspace and navigate its authored views', async ({ workspace }) => {
    await workspace.parseAndLoad(SAMPLE_DSL)

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.name).toBe('Payments Platform')
    expect(snapshot?.views.containerViews[0]?.key).toBe('PaymentsContainers')

    await workspace.setView('PaymentsContainers')
    await expect(workspace.getVisibleNodeByName('Ledger DB')).toBeVisible()
    await expect(workspace.getVisibleNodeByName('Payments API')).toBeVisible()
    expect(await workspace.getEdgeCount()).toBeGreaterThanOrEqual(2)
  })
})
