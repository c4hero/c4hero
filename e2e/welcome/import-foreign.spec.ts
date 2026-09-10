import { test, expect } from '../fixtures/workspace'

const PUML = `@startuml
title Shop
Person(shopper, "Shopper", "Buys things")
System_Boundary(shop, "Shop") {
  Container(web, "Web App", "React", "The storefront")
  ContainerDb(db, "Shop DB", "Postgres")
}
System_Ext(payments, "Payment Provider")
Rel(shopper, web, "Uses", "HTTPS")
Rel(web, db, "Reads and writes")
Rel(web, payments, "Charges cards")
@enduml`

test.describe('Import PlantUML / Mermaid (TEA-255)', () => {
  test('pastes a C4-PlantUML snippet on the welcome screen and lands on an editable canvas', async ({ workspace }) => {
    const page = workspace.page
    await workspace.goto()
    await page.getByRole('button', { name: 'Import PlantUML or Mermaid' }).click()

    const dialog = page.getByRole('dialog', { name: 'Import PlantUML or Mermaid' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-import-confirm]')).toBeDisabled()

    await dialog.locator('[data-import-source]').fill(PUML)
    const summary = dialog.locator('[data-import-summary]')
    await expect(summary).toContainText('Shop')
    await expect(summary).toContainText('C4-PlantUML')
    await expect(summary).toContainText('1 person, 2 systems, 2 containers, 0 components, 3 relationships')
    await expect(dialog.locator('[data-import-warnings]')).toHaveCount(0)

    await dialog.locator('[data-import-confirm]').click()
    await expect(dialog).toBeHidden()

    // The container diagram is the source type, so the container view opens.
    await expect(await workspace.getNodeByName('Web App')).toBeVisible({ timeout: 10000 })
    await expect(await workspace.getNodeByName('Shop DB')).toBeVisible()
    const ws = await workspace.getWorkspace()
    expect(ws?.name).toBe('Shop')
    expect(ws?.model.softwareSystems.map((s) => s.name).sort()).toEqual(['Payment Provider', 'Shop'])

    // Unsaved single-file flow: nothing linked yet, the save control offers to save to a .dsl.
    await expect(page.getByRole('button', { name: /No file linked|Click to download \.dsl/ })).toBeVisible()
  })

  test('shows warnings for skipped lines and a clear error for unrecognised text', async ({ workspace }) => {
    const page = workspace.page
    await workspace.goto()
    await page.getByRole('button', { name: 'Import PlantUML or Mermaid' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import PlantUML or Mermaid' })

    await dialog.locator('[data-import-source]').fill('just some prose')
    await expect(dialog.locator('[data-import-error]')).toContainText('Not recognised')
    await expect(dialog.locator('[data-import-confirm]')).toBeDisabled()

    await dialog.locator('[data-import-source]').fill(`C4Context
  title Ctx
  Person(a, "A")
  System(s, "S")
  Rel(a, s, "uses")
  UpdateLayoutConfig($c4ShapeInRow="3")`)
    await expect(dialog.locator('[data-import-summary]')).toContainText('Mermaid C4')
    const warnings = dialog.locator('[data-import-warnings]')
    await expect(warnings).toContainText('1 line skipped or adjusted')
    await warnings.locator('summary').click()
    await expect(warnings).toContainText('6: UpdateLayoutConfig')
  })

  test('asks before replacing an open workspace, from the command palette', async ({ workspace }) => {
    const page = workspace.page
    await workspace.loadSample()
    await workspace.runCommand('Import', 'Import PlantUML / Mermaid')
    const dialog = page.getByRole('dialog', { name: 'Import PlantUML or Mermaid' })
    await dialog.locator('[data-import-source]').fill(PUML)
    await dialog.locator('[data-import-confirm]').click()
    await expect(dialog.locator('[data-import-replace]')).toContainText('Replace')
    await expect(dialog.locator('[data-import-confirm]')).toHaveText('Replace and import')
    await dialog.locator('[data-import-confirm]').click()
    await expect(dialog).toBeHidden()
    const ws = await workspace.getWorkspace()
    expect(ws?.name).toBe('Shop')
  })
})
