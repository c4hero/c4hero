import { test, expect } from '../fixtures/workspace'

test.describe('Interaction regressions', () => {
  test('duplicating connected elements preserves the relationship and supports undo/redo', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.fitView()
    await workspace.connectNodes('New System', 'New System 2')

    await workspace.page.keyboard.press('Control+a')
    await workspace.page.keyboard.press('Control+d')

    let snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(4)
    expect(snapshot?.model.relationships).toHaveLength(2)
    expect(snapshot?.model.softwareSystems.map((system) => system.name)).toEqual(
      expect.arrayContaining(['New System copy', 'New System 2 copy']),
    )

    await workspace.page.keyboard.press('Control+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(2)
    expect(snapshot?.model.relationships).toHaveLength(1)

    await workspace.page.keyboard.press('Control+Shift+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(4)
    expect(snapshot?.model.relationships).toHaveLength(2)
  })

  test('search can switch views and focus a result from the new view', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('Containers')
    await workspace.page.keyboard.press('Enter')
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('Containers')

    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('Database')
    await workspace.page.keyboard.press('Enter')
    await expect(workspace.page.getByRole('dialog', { name: 'Search' })).not.toBeVisible()
    await workspace.expectInspectorFor('Database')
  })

  test('relationship edits persist across view switches and can be undone', async ({ workspace }) => {
    await workspace.loadSample()

    await workspace.clickNode('Internet Banking System')
    await workspace.toggleInspectorTab('Relations')
    await workspace.page
      .locator('button')
      .filter({ hasText: 'Personal Banking Customer' })
      .filter({ hasText: 'Views account balances and makes payments' })
      .first()
      .click()

    await workspace.fillEditableField('Description', 'Checks balances through the web app')
    await workspace.fillEditableField('URL', 'https://example.com/customer-banking')

    let relationship = await workspace.getRelationshipByDescription('Checks balances through the web app')
    expect(relationship).toMatchObject({
      url: 'https://example.com/customer-banking',
    })

    const containersView = await workspace.getViewByTitle('Containers')
    const landscapeView = await workspace.getViewByTitle('System Landscape')
    expect(containersView).toBeTruthy()
    expect(landscapeView).toBeTruthy()
    await workspace.setView(containersView!.key)
    await workspace.setView(landscapeView!.key)

    relationship = await workspace.getRelationshipByDescription('Checks balances through the web app')
    expect(relationship).toMatchObject({
      url: 'https://example.com/customer-banking',
    })

    await workspace.page.keyboard.press('Control+z')
    relationship = await workspace.getRelationshipByDescription('Checks balances through the web app')
    expect(relationship?.url).toBeUndefined()

    await workspace.page.keyboard.press('Control+z')
    relationship = await workspace.getRelationshipByDescription('Checks balances through the web app')
    expect(relationship).toBeUndefined()
  })
})
