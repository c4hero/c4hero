import { test, expect } from '../fixtures/workspace'

test.describe('Canvas Navigation', () => {
  test('double-click drills into a system', async ({ workspace }) => {
    await workspace.loadSample()
    // Double-click Internet Banking System to drill into container view
    await workspace.doubleClickNode('Internet Banking System')
    // Should see container-level nodes like API Application
    const apiNode = await workspace.getNodeByName('API Application')
    await expect(apiNode).toBeVisible()
  })

  test('backspace navigates back', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.doubleClickNode('Internet Banking System')
    // Wait for drill-down to complete
    await expect(await workspace.getNodeByName('API Application')).toBeVisible()
    // Navigate back
    await workspace.page.keyboard.press('Backspace')
    // Should be back at landscape - ATM visible again
    const atm = await workspace.getNodeByName('ATM')
    await expect(atm).toBeVisible()
  })

  test('dragging inside a scoped view keeps the scope boundary visible and wrapping the content', async ({ workspace }) => {
    await workspace.loadSample()
    const containersView = await workspace.getViewByTitle('Containers')
    expect(containersView).toBeTruthy()
    await workspace.setView(containersView!.key)

    const beforeBoundary = await workspace.getCanvasNodeBoxById('__scope_boundary__')
    expect(beforeBoundary).toBeTruthy()

    await workspace.dragNodeBy('Web Application', { x: 80, y: 40 })

    const boundaryState = await workspace.page.evaluate(() => {
      const boundary = document.querySelector('.react-flow__node[data-id="__scope_boundary__"]') as HTMLElement | null
      const webApp = Array.from(document.querySelectorAll('.react-flow__node')).find((node) =>
        node.textContent?.includes('Web Application'),
      ) as HTMLElement | null
      if (!boundary || !webApp) {
        return { hasBoundary: !!boundary, hasWebApp: !!webApp }
      }
      const boundaryRect = boundary.getBoundingClientRect()
      const webAppRect = webApp.getBoundingClientRect()
      return {
        hasBoundary: true,
        hasWebApp: true,
        containsWebApp:
          webAppRect.left >= boundaryRect.left - 1 &&
          webAppRect.top >= boundaryRect.top - 1 &&
          webAppRect.right <= boundaryRect.right + 1 &&
          webAppRect.bottom <= boundaryRect.bottom + 1,
      }
    })

    expect(boundaryState).toMatchObject({ hasBoundary: true, hasWebApp: true, containsWebApp: true })
  })

  test('undo/redo works', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+P')
    const after = await workspace.getNodeCount()
    expect(after).toBe(1)
    // Undo
    await workspace.page.keyboard.press('Control+z')
    const afterUndo = await workspace.getNodeCount()
    expect(afterUndo).toBe(0)
    // Redo
    await workspace.page.keyboard.press('Control+Shift+z')
    const afterRedo = await workspace.getNodeCount()
    expect(afterRedo).toBe(1)
  })
})
