import { test, expect } from '../fixtures/workspace'

const SCOPED_RECONNECT_DSL = `workspace "Scoped Reconnect" {
  model {
    other = softwareSystem "Other System"
    third = softwareSystem "Third System"
    scoped = softwareSystem "Scoped System"
    other -> third "calls"
  }
  views {
    systemLandscape "Landscape" {
      include *
      autoLayout lr
    }
    systemContext scoped "ScopedContext" {
      include *
      autoLayout lr
    }
  }
}`

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

  test('deleting a grouped relationship endpoint updates the group membership and supports undo/redo', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.fitView()
    await workspace.connectNodes('New System', 'New System 2')

    const snapshot = await workspace.getWorkspace()
    const ids = snapshot?.model.softwareSystems.map((system) => system.id) ?? []
    expect(ids).toHaveLength(2)
    await workspace.addGroup('Core Systems', ids)

    let group = await workspace.getGroupByName('Core Systems')
    expect(group?.elementIds).toHaveLength(2)
    expect(snapshot?.model.relationships).toHaveLength(1)

    await workspace.deleteElements([ids[0]])

    let afterDelete = await workspace.getWorkspace()
    group = await workspace.getGroupByName('Core Systems')
    expect(afterDelete?.model.softwareSystems).toHaveLength(1)
    expect(afterDelete?.model.relationships).toHaveLength(0)
    expect(group?.elementIds).toHaveLength(1)

    await workspace.page.keyboard.press('Control+z')
    const restored = await workspace.getWorkspace()
    group = await workspace.getGroupByName('Core Systems')
    expect(restored?.model.softwareSystems).toHaveLength(2)
    expect(restored?.model.relationships).toHaveLength(1)
    expect(group?.elementIds).toHaveLength(2)

    await workspace.page.keyboard.press('Control+Shift+z')
    afterDelete = await workspace.getWorkspace()
    group = await workspace.getGroupByName('Core Systems')
    expect(afterDelete?.model.softwareSystems).toHaveLength(1)
    expect(afterDelete?.model.relationships).toHaveLength(0)
    expect(group?.elementIds).toHaveLength(1)
  })

  test('drag-reconnecting a relationship into the scoped system keeps the context view semantically correct', async ({ workspace }) => {
    await workspace.parseAndLoad(SCOPED_RECONNECT_DSL)

    const landscapeView = await workspace.getViewByTitle('Landscape')
    const contextView = await workspace.getViewByTitle('ScopedContext')
    expect(landscapeView).toBeTruthy()
    expect(contextView).toBeTruthy()

    await workspace.setView(landscapeView!.key)
    await workspace.fitView()

    let snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.relationships).toHaveLength(1)
    const relId = snapshot!.model.relationships[0].id
    expect(snapshot!.model.relationships[0].sourceId).toBe('other')
    expect(snapshot!.model.relationships[0].destinationId).toBe('third')

    // Baseline: scoped context view should contain only the scoped system; the
    // relationship is not yet attached to it.
    const ctxBefore = snapshot!.views.systemContextViews.find((v) => v.key === contextView!.key)!
    expect(ctxBefore.elements.map((e) => e.id)).toEqual(['scoped'])
    expect(ctxBefore.relationships.some((r) => r.id === relId)).toBe(false)

    // Drag the target anchor of the edge from Third System onto Scoped System so
    // the scoped software system becomes one endpoint of the relationship.
    await workspace.reconnectEdgeEndpoint(relId, 'target', 'Scoped System')

    snapshot = await workspace.getWorkspace()
    const rel = snapshot?.model.relationships.find((r) => r.id === relId)
    expect(rel?.sourceId).toBe('other')
    expect(rel?.destinationId).toBe('scoped')

    // Scoped context view should now include the non-scope endpoint plus the
    // relationship; the unrelated third system must not appear.
    const ctxAfter = snapshot!.views.systemContextViews.find((v) => v.key === contextView!.key)!
    const ctxElementIds = ctxAfter.elements.map((e) => e.id)
    expect(ctxElementIds).toContain('scoped')
    expect(ctxElementIds).toContain('other')
    expect(ctxElementIds).not.toContain('third')
    expect(ctxAfter.relationships.some((r) => r.id === relId)).toBe(true)

    // Persistence roundtrip via view switching — the existing E2E suite uses
    // this in place of a full save/reload (matches 'relationship edits persist
    // across view switches' above).
    await workspace.setView(contextView!.key)
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('ScopedContext')
    await expect(workspace.getVisibleNodeByName('Scoped System')).toBeVisible()
    await expect(workspace.getVisibleNodeByName('Other System')).toBeVisible()
    await expect(workspace.getVisibleNodeByName('Third System')).not.toBeVisible()
    expect(await workspace.getEdgeCount()).toBe(1)

    await workspace.setView(landscapeView!.key)
    await workspace.setView(contextView!.key)

    const roundtrip = await workspace.getWorkspace()
    const ctxRoundtrip = roundtrip!.views.systemContextViews.find((v) => v.key === contextView!.key)!
    expect(ctxRoundtrip.elements.map((e) => e.id)).toEqual(expect.arrayContaining(['scoped', 'other']))
    expect(ctxRoundtrip.elements.map((e) => e.id)).not.toContain('third')
    expect(ctxRoundtrip.relationships.some((r) => r.id === relId)).toBe(true)
    await expect(workspace.getVisibleNodeByName('Other System')).toBeVisible()
    await expect(workspace.getVisibleNodeByName('Third System')).not.toBeVisible()
    expect(await workspace.getEdgeCount()).toBe(1)
  })

  test('deleting a scoped system falls back to another view and undo restores the scoped view', async ({ workspace }) => {
    await workspace.loadSample()

    const contextView = await workspace.getViewByTitle('System Context')
    const snapshot = await workspace.getWorkspace()
    const systemId = snapshot?.model.softwareSystems.find((system) => system.name === 'Internet Banking System')?.id
    expect(contextView).toBeTruthy()
    expect(systemId).toBeTruthy()
    await workspace.setView(contextView!.key)
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('System Context')

    await workspace.deleteElements([systemId!])

    let views = await workspace.getViews()
    expect(views.some((view) => view.key === contextView!.key)).toBe(false)
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('System Landscape')
    await expect(workspace.getVisibleNodeByName('Internet Banking System')).not.toBeVisible()

    await workspace.page.keyboard.press('Control+z')
    views = await workspace.getViews()
    expect(views.some((view) => view.key === contextView!.key)).toBe(true)

    await workspace.setView(contextView!.key)
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('System Context')
    await expect(workspace.getVisibleNodeByName('Internet Banking System')).toBeVisible()
  })
})
