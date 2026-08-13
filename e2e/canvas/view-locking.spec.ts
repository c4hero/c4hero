import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'

const DSL = `workspace "ViewLocking" {
  model {
    customer = person "Customer"
    web = softwareSystem "Web App"
    api = softwareSystem "API"

    customer -> web "Uses"
    web -> api "Calls"
  }
  views {
    systemLandscape landscape "Landscape" {
      include *
      autolayout tb
    }
  }
}`

/** Store-side position of an element in the active view. */
async function canvasPosition(workspace: WorkspaceHelper, id: string) {
  return workspace.page.evaluate((elementId) => {
    const store = (window as Record<string, unknown>).__testStore as () => {
      workspace: { views: Record<string, Array<{ key: string; elements: Array<{ id: string; x?: number; y?: number }> }>> }
      activeViewKey: string | null
    }
    const state = store()
    for (const views of Object.values(state.workspace.views)) {
      if (!Array.isArray(views)) continue
      const view = views.find((v) => v.key === state.activeViewKey)
      if (!view) continue
      const el = view.elements.find((e) => e.id === elementId)
      return el ? { x: el.x, y: el.y } : null
    }
    return null
  }, id)
}

async function toggleViewLock(workspace: WorkspaceHelper) {
  await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
  await workspace.page.getByRole('button', { name: /(Lock|Unlock) view layout/ }).click()
  await workspace.clickCanvas() // dismiss the flyout
}

test.describe('View-level layout lock', () => {
  test('a locked view refuses Auto-arrange and dragging; unlocking restores both', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.fitView()

    await toggleViewLock(workspace)

    const before = {
      customer: await canvasPosition(workspace, 'customer'),
      web: await canvasPosition(workspace, 'web'),
      api: await canvasPosition(workspace, 'api'),
    }

    // Auto-arrange direction buttons are disabled while locked.
    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await expect(workspace.page.getByRole('button', { name: 'Left to right' })).toBeDisabled()
    await workspace.clickCanvas()

    // Dragging any node is refused.
    await workspace.dragNodeBy('API', { x: 150, y: 120 })
    expect(await canvasPosition(workspace, 'api')).toEqual(before.api)

    // Unlock: Auto-arrange works again and moves things.
    await toggleViewLock(workspace)
    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await workspace.page.getByRole('button', { name: 'Left to right' }).click()
    await workspace.waitForCanvasSettled()
    const after = await canvasPosition(workspace, 'web')
    expect(after).not.toEqual(before.web)
  })

  test('the lock badge shows on the rail while locked', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.fitView()

    await expect(workspace.page.getByRole('button', { name: 'Auto-arrange', exact: true })).toBeVisible()
    await toggleViewLock(workspace)
    await expect(workspace.page.getByRole('button', { name: 'Auto-arrange (view layout locked)' })).toBeVisible()
    await toggleViewLock(workspace)
    await expect(workspace.page.getByRole('button', { name: 'Auto-arrange', exact: true })).toBeVisible()
  })
})
