import { test, expect } from '../fixtures/workspace'

test.describe('Canvas Elements', () => {
  test('sample workspace renders nodes on canvas', async ({ workspace }) => {
    await workspace.loadSample()
    const nodeCount = await workspace.getNodeCount()
    expect(nodeCount).toBeGreaterThan(3)
  })

  test('sample workspace renders edges on canvas', async ({ workspace }) => {
    await workspace.loadSample()
    const edgeCount = await workspace.getEdgeCount()
    expect(edgeCount).toBeGreaterThan(0)
  })

  test('clicking a node selects it and shows in right panel', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.clickNode('Personal Banking Customer')
    // Right panel should show the element name and Properties tab
    await expect(workspace.page.getByTestId('element-status')).toBeVisible()
  })

  test('adding a person via Shift+P creates a new node', async ({ workspace }) => {
    await workspace.loadBlank()
    const before = await workspace.getNodeCount()
    await workspace.page.keyboard.press('Shift+P')
    const after = await workspace.getNodeCount()
    expect(after).toBe(before + 1)
  })

  test('adding a system via Shift+S creates a new node', async ({ workspace }) => {
    await workspace.loadBlank()
    const before = await workspace.getNodeCount()
    await workspace.page.keyboard.press('Shift+S')
    const after = await workspace.getNodeCount()
    expect(after).toBe(before + 1)
  })

  test('Shift+Backspace on a selected node deletes it from the model after confirmation', async ({ workspace }) => {
    await workspace.loadSample()
    const before = await workspace.getNodeCount()
    await workspace.clickNode('ATM')
    await workspace.expectInspectorFor('ATM')
    await workspace.page.keyboard.press('Shift+Backspace')
    await workspace.page.getByRole('dialog', { name: 'Confirm delete' }).getByRole('button', { name: /delete from model/i }).click()
    await expect(await workspace.getNodeByName('ATM')).toHaveCount(0)
    const after = await workspace.getNodeCount()
    expect(after).toBe(before - 1)
  })
})
