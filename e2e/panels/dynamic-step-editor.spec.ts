import { test, expect } from '../fixtures/workspace'

const DSL = `workspace "Steps" {
  model {
    user = person "User"
    sys = softwareSystem "Sys" {
      web = container "Web"
      api = container "Api"
    }
    user -> web "Uses"
    web -> api "Calls"
  }
  views {
    dynamic sys "Flow" {
      user -> web "Opens app"
      web -> api "Calls"
      autolayout lr
    }
  }
}`

test.describe('Dynamic step editor', () => {
  test('lists, adds, reorders, and deletes steps from the add panel', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Flow')
    await page.getByRole('button', { name: 'Add element' }).click()

    const panel = page.locator('[data-flyout="add-element"]')
    await expect(panel.getByText('Interaction steps')).toBeVisible()
    await expect(panel.locator('[data-step-row]')).toHaveCount(2)

    // Add a response step: Api → Web travels back over the existing web->api
    // relationship instead of creating a new one.
    await panel.getByLabel('Step source').selectOption({ label: 'Api' })
    await panel.getByLabel('Step destination').selectOption({ label: 'Web' })
    await panel.getByLabel('Step description').fill('Returns data')
    await panel.getByRole('button', { name: 'Add step' }).click()

    await expect(panel.locator('[data-step-row]')).toHaveCount(3)
    // The canvas now shows three numbered edges.
    await expect(page.locator('.react-flow__edge')).toHaveCount(3)
    await expect(page.locator('.react-flow').getByLabel('Step 3')).toBeVisible()
    await expect(page.locator('.react-flow').getByText('Returns data')).toBeVisible()

    // Reorder: move the new step up — badges renumber.
    await panel.getByRole('button', { name: 'Move step 3 up' }).click()
    const secondRow = panel.locator('[data-step-row]').nth(1)
    await expect(secondRow).toContainText('Api → Web')

    // Delete it — back to the original two steps.
    await panel.getByRole('button', { name: 'Delete step 2' }).click()
    await expect(panel.locator('[data-step-row]')).toHaveCount(2)
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)

    // The surviving steps kept their content and renumbered 1..2.
    await expect(panel.locator('[data-step-row]').nth(0)).toContainText('User → Web')
    await expect(panel.locator('[data-step-row]').nth(1)).toContainText('Web → Api')
  })

  test('editing a step description shows on the canvas edge', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Flow')
    await page.getByRole('button', { name: 'Add element' }).click()

    const panel = page.locator('[data-flyout="add-element"]')
    await expect(panel.getByText('Interaction steps')).toBeVisible()
    await panel.locator('[data-step-row]').nth(0).getByText('Opens app').click()
    await panel.getByLabel('Step 1 description').fill('Opens the storefront')
    await panel.getByLabel('Step 1 description').press('Enter')

    await expect(page.locator('.react-flow').getByText('Opens the storefront')).toBeVisible()
  })
})
