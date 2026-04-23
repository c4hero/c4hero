import { test, expect } from '../fixtures/workspace'

test.describe('Reusable architecture scenarios', () => {
  test('1. blank workspace supports creating a person from the add-element panel', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.addElementFromPanel('Person')
    await expect(workspace.getVisibleNodeByName('New Person')).toBeVisible()

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.people).toHaveLength(1)
    expect(snapshot?.model.people[0]?.name).toBe('New Person')
  })

  test('2. blank workspace supports creating a software system with the keyboard shortcut', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(1)
    expect(snapshot?.model.softwareSystems[0]?.name).toBe('New System')
  })

  test('3. selected element properties persist after editing name, owner, url, and status', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')
    await workspace.expectInspectorFor('New System')

    await workspace.fillEditableField('Element name', 'Billing Platform')
    await workspace.fillEditableField('Owner', 'Platform Team')
    await workspace.fillEditableField('URL', 'https://billing.example.com')
    await workspace.selectStatus('Planned')

    await expect(workspace.getVisibleNodeByName('Billing Platform')).toBeVisible()

    const system = await workspace.getElementByName('Billing Platform')
    expect(system).toMatchObject({
      name: 'Billing Platform',
      owner: 'Platform Team',
      url: 'https://billing.example.com',
    })
  })

  test('4. selected element tags can be added and appear in the workspace model', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.clickNode('New System')

    await workspace.addTag('Critical')
    await expect(workspace.page.getByText('Critical').last()).toBeVisible()

    const system = await workspace.getElementByName('New System')
    expect(system?.tags).toContain('Critical')
  })

  test('5. connecting two nodes creates a reusable relationship in the model and canvas', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    expect(await workspace.getEdgeCount()).toBe(1)

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.relationships).toHaveLength(1)
    expect(snapshot?.model.relationships[0]).toMatchObject({
      sourceId: snapshot?.model.softwareSystems[0]?.id,
      destinationId: snapshot?.model.softwareSystems[1]?.id,
    })
  })

  test('6. command palette can create a scoped system context view', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.createView('System Context', 'Internet Banking Context', 'Internet Banking System')

    const views = await workspace.getViews()
    expect(views.some((view) => view.title === 'Internet Banking Context' && view.type === 'systemContext')).toBe(true)
  })

  test('7. switching from the landscape view to the container view updates the canvas', async ({ workspace }) => {
    await workspace.loadSample()

    const beforeCount = await workspace.getNodeCount()
    const views = await workspace.getViews()
    const containerView = views.find((view) => view.title === 'Containers')
    expect(containerView).toBeTruthy()

    await workspace.setView(containerView!.key)
    await expect(await workspace.getNodeByName('API Application')).toBeVisible()

    const afterCount = await workspace.getNodeCount()
    expect(afterCount).toBeGreaterThan(0)
    expect(afterCount).not.toBe(beforeCount)
  })

  test('8. parsing DSL builds a workspace with expected people, systems, and relationships', async ({ workspace }) => {
    await workspace.parseAndLoad(`workspace "Payments Demo" {
  model {
    customer = person "Customer"
    payments = softwareSystem "Payments Platform"
    customer -> payments "Pays invoices"
  }
  views {
    systemLandscape paymentsLandscape "Payments Landscape" {
      include *
      autolayout lr
    }
  }
}`)

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.name).toBe('Payments Demo')
    expect(snapshot?.model.people).toHaveLength(1)
    expect(snapshot?.model.softwareSystems).toHaveLength(1)
    expect(snapshot?.model.relationships).toHaveLength(1)
    expect(await workspace.getNodeCount()).toBeGreaterThanOrEqual(2)
  })

  test('9. microservices template exposes its container view and core services', async ({ workspace }) => {
    await workspace.loadTemplate('microservices')

    const views = await workspace.getViews()
    expect(views.map((view) => view.title)).toEqual(expect.arrayContaining(['System Landscape', 'Containers']))
    const containerView = views.find((view) => view.title === 'Containers')
    expect(containerView).toBeTruthy()
    await workspace.setView(containerView!.key)
    await expect(await workspace.getNodeByName('API Gateway')).toBeVisible()
    await expect(await workspace.getNodeByName('RabbitMQ')).toBeVisible()

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems[0]?.containers).toHaveLength(7)
    expect(snapshot?.model.relationships).toHaveLength(12)
  })

  test('10. event-driven template renders producer, broker, consumer, and data lake containers', async ({ workspace }) => {
    await workspace.loadTemplate('eventDriven')

    const views = await workspace.getViews()
    const containerView = views.find((view) => view.title === 'Containers')
    expect(containerView).toBeTruthy()
    await workspace.setView(containerView!.key)

    await expect(await workspace.getNodeByName('Ingest Service')).toBeVisible()
    await expect(await workspace.getNodeByName('Apache Kafka')).toBeVisible()
    await expect(await workspace.getNodeByName('Analytics Service')).toBeVisible()
    await expect(await workspace.getNodeByName('Data Lake')).toBeVisible()

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems[0]?.containers).toHaveLength(7)
    expect(snapshot?.model.relationships).toHaveLength(12)
  })
})
