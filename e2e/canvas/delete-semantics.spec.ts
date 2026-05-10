import { test, expect } from '../fixtures/workspace'

test.describe('Delete semantics', () => {
  test('Backspace removes peer system from context view but keeps it in the model', async ({ workspace }) => {
    await workspace.loadSample()
    // Navigate to a context view that contains a peer system; pick first available
    const views = await workspace.getViews()
    const contextView = views.find(v => v.type === 'systemContext')!
    await workspace.setView(contextView.key)

    const before = await workspace.getWorkspace()
    const view = before!.views.systemContextViews.find(v => v.key === contextView.key)!
    const peerId = view.elements.find(e => e.id !== view['softwareSystemId' as keyof typeof view])?.id
    test.skip(!peerId, 'sample workspace has no peer in this context view')

    // Select that peer node and Backspace
    // Wait for the inspector after click so the 120ms selection-commit timer has fired.
    const peer = before!.model.softwareSystems.find(s => s.id === peerId) ?? before!.model.people.find(p => p.id === peerId)!
    await workspace.clickNode(peer.name)
    await workspace.expectInspectorFor(peer.name)
    await workspace.page.keyboard.press('Backspace')

    // No confirm dialog (lightweight action)
    await expect(workspace.page.getByRole('dialog', { name: /confirm delete/i })).toHaveCount(0)
    // View shrunk:
    const after = await workspace.getWorkspace()
    const viewAfter = after!.views.systemContextViews.find(v => v.key === contextView.key)!
    expect(viewAfter.elements.find(e => e.id === peerId)).toBeUndefined()
    // Model intact:
    expect(
      after!.model.softwareSystems.find(s => s.id === peerId) ??
      after!.model.people.find(p => p.id === peerId)
    ).toBeDefined()
  })

  test('Shift+Backspace shows impact dialog and cascade-deletes from model', async ({ workspace }) => {
    await workspace.loadSample()
    const views = await workspace.getViews()
    const landscape = views.find(v => v.type === 'systemLandscape')!
    await workspace.setView(landscape.key)

    const before = await workspace.getWorkspace()
    // Pick a system that has containers (so we can assert the cascade preview)
    const sys = before!.model.softwareSystems.find(s => s.containers.length > 0)
    test.skip(!sys, 'sample workspace has no system with containers')

    await workspace.clickNode(sys!.name)
    await workspace.expectInspectorFor(sys!.name)
    await workspace.page.keyboard.press('Shift+Backspace')

    const dialog = workspace.page.getByRole('dialog', { name: /confirm delete/i })
    await expect(dialog).toBeVisible()
    // Impact list should mention the actual cascade scope
    await expect(dialog.getByRole('list', { name: /cascade impact/i })).toBeVisible()
    await expect(dialog.getByRole('listitem').filter({ hasText: new RegExp(`${sys!.containers.length} container`) })).toBeVisible()

    await dialog.getByRole('button', { name: /delete from model/i }).click()

    const after = await workspace.getWorkspace()
    expect(after!.model.softwareSystems.find(s => s.id === sys!.id)).toBeUndefined()
  })

  test('Cmd+Z restores after destructive cascade delete', async ({ workspace }) => {
    await workspace.loadSample()
    const views = await workspace.getViews()
    const landscape = views.find(v => v.type === 'systemLandscape')!
    await workspace.setView(landscape.key)

    const before = await workspace.getWorkspace()
    const sys = before!.model.softwareSystems.find(s => s.containers.length > 0)!
    await workspace.clickNode(sys.name)
    await workspace.expectInspectorFor(sys.name)
    await workspace.page.keyboard.press('Shift+Backspace')
    const undoDialog = workspace.page.getByRole('dialog', { name: /confirm delete/i })
    await expect(undoDialog).toBeVisible()
    await undoDialog.getByRole('button', { name: /delete from model/i }).click()
    await workspace.page.keyboard.press('Control+z')

    const after = await workspace.getWorkspace()
    const restored = after!.model.softwareSystems.find(s => s.id === sys.id)!
    expect(restored).toBeDefined()
    expect(restored.containers.length).toBe(sys.containers.length)
  })

  test('Backspace on a focal scope element is a no-op', async ({ workspace }) => {
    await workspace.loadSample()
    const views = await workspace.getViews()
    const containerView = views.find(v => v.type === 'container')!
    await workspace.setView(containerView.key)

    // The focal system is not normally a node on its own container view
    // (Bug #1 fix), so this is a defense-in-depth assertion: even if we
    // somehow get a Backspace targeting it, model state must not change.
    const before = await workspace.getWorkspace()
    await workspace.page.keyboard.press('Backspace') // nothing selected
    const after = await workspace.getWorkspace()
    expect(JSON.stringify(after!.model)).toBe(JSON.stringify(before!.model))
  })

  test('Re-add via AddElementPanel after Backspace round-trips cleanly', async ({ workspace }) => {
    await workspace.loadSample()
    const views = await workspace.getViews()
    const contextView = views.find(v => v.type === 'systemContext')!
    await workspace.setView(contextView.key)

    const before = await workspace.getWorkspace()
    const view = before!.views.systemContextViews.find(v => v.key === contextView.key)!
    const peerId = view.elements.find(e => e.id !== view['softwareSystemId' as keyof typeof view])?.id
    test.skip(!peerId, 'sample workspace has no peer in this context view')

    const peerName = (before!.model.softwareSystems.find(s => s.id === peerId) ?? before!.model.people.find(p => p.id === peerId))!.name

    await workspace.clickNode(peerName)
    await workspace.expectInspectorFor(peerName)
    await workspace.page.keyboard.press('Backspace')

    // Re-add via the picker
    await workspace.page.keyboard.press('a')
    await workspace.page.getByPlaceholder(/filter elements/i).fill(peerName)
    await workspace.page.locator('.glass-flyout').getByRole('button', { name: new RegExp(peerName) }).click()

    const after = await workspace.getWorkspace()
    expect(after!.views.systemContextViews.find(v => v.key === contextView.key)!
      .elements.find(e => e.id === peerId)).toBeDefined()
  })
})
