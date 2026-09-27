import { readFile } from 'node:fs/promises'
import { test, expect } from '../fixtures/workspace'

test('workspace properties survive editing, DSL export and reopening (#219)', async ({ workspace, page }) => {
  // Exercise the download fallback; native file pickers cannot be driven by Playwright.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showOpenFilePicker')
    Reflect.deleteProperty(window, 'showSaveFilePicker')
  })
  await workspace.parseAndLoad(`workspace "Property test" {
    properties {
      "team" "platform"
      "c4hero.statuses" "Proposed, Under review"
      api.version 1.2
      123 numeric
    }
    model {
      s = softwareSystem "System"
    }
    views {
      systemLandscape "landscape" {
        include *
        autoLayout lr
      }
    }
  }`)
  await workspace.clickNode('System')
  await workspace.fillEditableField('Element name', 'Edited System')

  async function exportDsl() {
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download Structurizr DSL' }).click()
    const path = await (await download).path()
    expect(path).not.toBeNull()
    return readFile(path!, 'utf8')
  }

  const saved = await exportDsl()
  expect(saved).toContain('"team" "platform"')
  expect(saved).toContain('"c4hero.statuses" "Proposed, Under review"')
  expect(saved).toContain('"api.version" "1.2"')
  expect(saved).toContain('"123" "numeric"')
  expect(saved).toContain('Edited System')
  await workspace.parseAndLoad(saved)
  expect(await exportDsl()).toBe(saved)
})
