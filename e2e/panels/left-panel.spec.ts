import { test, expect } from '../fixtures/workspace'

test.describe('Left Panel', () => {
  test('shows view list', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Switch view' }).click()
    await expect(workspace.page.getByText('System Landscape').first()).toBeVisible()
  })

  test('clicking a view switches the canvas', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Switch view' }).click()
    const containersView = workspace.page.getByRole('button', { name: 'Containers' }).first()
    await containersView.click()
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('Containers')
    await expect(await workspace.getNodeByName('API Application')).toBeVisible()
  })

  test('view switcher groups views by C4 level', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Switch view' }).click()
    await expect(workspace.page.getByText('System Landscape', { exact: true }).last()).toBeVisible()
    await expect(workspace.page.getByText('System Context', { exact: true }).last()).toBeVisible()
    await expect(workspace.page.getByText('Container', { exact: true }).last()).toBeVisible()
  })

  test('create view button opens dialog', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Switch view' }).click()
    await workspace.page.getByRole('button', { name: /New view/i }).click()
    await expect(workspace.page.getByRole('dialog', { name: 'Create View' })).toBeVisible()
  })
})
