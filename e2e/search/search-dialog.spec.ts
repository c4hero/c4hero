import { test, expect } from '../fixtures/workspace'

test.describe('Search Dialog', () => {
  test('opens with Ctrl+F', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
  })

  test('shows type filter pills', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
    const dialog = workspace.page.getByRole('dialog', { name: 'Search' })
    await expect(dialog.getByRole('button', { name: 'Person', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'System', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Container', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Component', exact: true })).toBeVisible()
  })

  test('searches by name', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('Internet Banking')
    await expect(workspace.page.locator('.truncate.font-medium', { hasText: 'Internet Banking System' }).first()).toBeVisible()
  })

  test('searches by technology', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('Angular')
    await expect(workspace.page.locator('.truncate.font-medium', { hasText: 'Single-Page Application' }).first()).toBeVisible()
  })

  test('type filter narrows results', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
    const dialog = workspace.page.getByRole('dialog', { name: 'Search' })
    await dialog.getByRole('button', { name: 'Person', exact: true }).click()
    await workspace.page.getByLabel('Search elements and views').fill(' ')
    await expect(workspace.page.locator('.truncate.font-medium', { hasText: 'Personal Banking Customer' }).first()).toBeVisible()
  })

  test('selecting a result closes search and focuses the matching element inspector', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
    await workspace.page.getByLabel('Search elements and views').fill('Internet Banking System')
    await workspace.page.keyboard.press('Enter')
    await expect(workspace.page.getByRole('dialog', { name: 'Search' })).not.toBeVisible()
    await workspace.expectInspectorFor('Internet Banking System')
  })

  test('closes with Escape', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.openSearch()
    await expect(workspace.page.getByPlaceholder('Search elements, views, technology...')).toBeVisible()
    await workspace.page.keyboard.press('Escape')
    await expect(workspace.page.getByPlaceholder('Search elements, views, technology...')).not.toBeVisible()
  })
})
