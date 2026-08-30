import { test, expect } from '../fixtures/workspace'

const DSL = `workspace "Topology" {
  model {
    sys = softwareSystem "Sys" {
      web = container "Web"
      db = container "DB"
    }
    web -> db "Reads"
    deploymentEnvironment "Live" {
      server = deploymentNode "Server" {
        liveWeb = containerInstance web
      }
    }
  }
  views {
    deployment * "Live" "Dep" {
      include *
      autolayout lr
    }
  }
}`

test.describe('Deployment topology editor', () => {
  test('lists the topology and authors nodes, instances, and deletes', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Dep')
    await page.getByRole('button', { name: 'Add element' }).click()

    const panel = page.locator('[data-flyout="add-element"]')
    const rows = panel.locator('[data-topology-row]')
    await expect(panel.getByText('Deployment topology — Live')).toBeVisible()
    await expect(panel.locator('[data-topology-row="node"]')).toHaveCount(1)
    await expect(panel.locator('[data-topology-row="instance"]')).toHaveCount(1)

    // Add a nested deployment node under Server.
    await panel.getByLabel('Element kind').selectOption('node')
    await panel.getByLabel('Host deployment node').selectOption({ label: 'Server' })
    await panel.getByRole('button', { name: 'Add topology element' }).click()
    await expect(panel.locator('[data-topology-row="node"]')).toHaveCount(2)
    await expect(rows.getByText('New Deployment Node', { exact: true })).toBeVisible()

    // Rename it inline.
    await rows.getByText('New Deployment Node', { exact: true }).click()
    await panel.getByLabel('Rename New Deployment Node').fill('Pod')
    await panel.getByLabel('Rename New Deployment Node').press('Enter')
    await expect(rows.getByText('Pod', { exact: true })).toBeVisible()

    // Put a DB container instance inside it — the canvas gains the node.
    await panel.getByLabel('Element kind').selectOption('containerInstance')
    await panel.getByLabel('Host deployment node').selectOption({ label: 'Server › Pod' })
    await panel.getByLabel('Instance of').selectOption({ label: 'DB (Sys)' })
    await panel.getByRole('button', { name: 'Add topology element' }).click()
    await expect(panel.locator('[data-topology-row="instance"]')).toHaveCount(2)
    await expect(page.locator('.react-flow').getByText('DB', { exact: true })).toBeVisible()
    // The Pod boundary now wraps its instance on the canvas.
    await expect(page.locator('.react-flow').getByText('Pod', { exact: true })).toBeVisible()
    // The derived web -> db edge appears between the two instances.
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)

    // Delete the Pod node — its instance goes with it.
    await panel.getByRole('button', { name: 'Delete Pod' }).click()
    await expect(panel.locator('[data-topology-row="node"]')).toHaveCount(1)
    await expect(panel.locator('[data-topology-row="instance"]')).toHaveCount(1)
    await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  })
})
