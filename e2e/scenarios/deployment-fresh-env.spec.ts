import { test, expect } from '../fixtures/workspace'

const DSL = `workspace "Big Bank plc" {
  model {
    ibs = softwareSystem "Internet Banking System" {
      mobile = container "Mobile App"
    }
  }
}`

test('fresh env + view: authored topology appears on the canvas', async ({ workspace }) => {
  const page = workspace.page
  await workspace.parseAndLoad(DSL)

  // Create the deployment view with a brand-new environment via the dialog.
  await workspace.runCommand('new view', 'New View')
  await expect(page.getByRole('dialog', { name: 'Create View' })).toBeVisible()
  await page.locator('#cv-type').selectOption({ label: 'Deployment' })
  await page.locator('#cv-new-environment').fill('Production')
  await page.locator('#cv-title').fill('My Deployment')
  await page.getByRole('button', { name: 'Create View' }).click()
  await expect(page.getByRole('dialog', { name: 'Create View' })).not.toBeVisible()

  // Author the topology: node, then infra + container instance inside it.
  await page.getByRole('button', { name: 'Add element' }).click()
  const panel = page.locator('[data-flyout="add-element"]')
  await expect(panel.getByText('Deployment topology — Production')).toBeVisible()

  await panel.getByLabel('Element kind').selectOption('node')
  await panel.getByRole('button', { name: 'Add topology element' }).click()
  await expect(panel.locator('[data-topology-row="node"]')).toHaveCount(1)

  await panel.getByLabel('Element kind').selectOption('infra')
  await panel.getByLabel('Host deployment node').selectOption({ label: 'New Deployment Node' })
  await panel.getByRole('button', { name: 'Add topology element' }).click()
  await expect(panel.locator('[data-topology-row="infra"]')).toHaveCount(1)

  await panel.getByLabel('Element kind').selectOption('containerInstance')
  await panel.getByLabel('Host deployment node').selectOption({ label: 'New Deployment Node' })
  await panel.getByLabel('Instance of').selectOption({ label: 'Mobile App (Internet Banking System)' })
  await panel.getByRole('button', { name: 'Add topology element' }).click()
  await expect(panel.locator('[data-topology-row="instance"]')).toHaveCount(1)

  // The canvas must show both leaves inside the node's boundary.
  const canvas = page.locator('.react-flow')
  await expect(canvas.getByText('New Infrastructure Node', { exact: true })).toBeVisible()
  await expect(canvas.getByText('Mobile App', { exact: true })).toBeVisible()
})

test('deployment elements get an inspector: instance, infra, and node via boundary label', async ({ workspace }) => {
  const page = workspace.page
  await workspace.parseAndLoad(DSL)

  await workspace.runCommand('new view', 'New View')
  await page.locator('#cv-type').selectOption({ label: 'Deployment' })
  await page.locator('#cv-new-environment').fill('Production')
  await page.getByRole('button', { name: 'Create View' }).click()

  await page.getByRole('button', { name: 'Add element' }).click()
  const panel = page.locator('[data-flyout="add-element"]')
  await panel.getByLabel('Element kind').selectOption('node')
  await panel.getByRole('button', { name: 'Add topology element' }).click()
  await panel.getByLabel('Element kind').selectOption('containerInstance')
  await panel.getByLabel('Host deployment node').selectOption({ label: 'New Deployment Node' })
  await panel.getByLabel('Instance of').selectOption({ label: 'Mobile App (Internet Banking System)' })
  await panel.getByRole('button', { name: 'Add topology element' }).click()
  await page.keyboard.press('Escape') // close the flyout

  // Container instance: click it on the canvas — inspector shows the instance
  // with a pointer back to the deployed container.
  const canvas = page.locator('.react-flow')
  await canvas.getByText('Mobile App', { exact: true }).click()
  const inspector = page.locator('[data-canvas-chrome="inspector"]')
  await expect(inspector.getByText('Container Instance — Production')).toBeVisible()
  await expect(inspector.getByRole('button', { name: 'Edit Mobile App' })).toBeVisible()

  // Deployment node: click its boundary label — inspector opens with editable
  // fields; renaming updates the canvas boundary.
  await canvas.getByText('New Deployment Node', { exact: true }).click()
  await expect(inspector.getByText('Deployment Node — Production')).toBeVisible()
  const nameField = inspector.getByLabel('Deployment element name')
  await nameField.fill('K8s Cluster')
  await nameField.press('Enter')
  await expect(canvas.getByText('K8s Cluster', { exact: true })).toBeVisible()
})
