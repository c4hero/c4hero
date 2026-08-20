import { test, expect } from '../fixtures/workspace'
import type { Page } from '@playwright/test'

/** TEA-81 AC: "Export (PNG/SVG/DSL) works for both [view types]". DSL export
 *  is oracle-verified in unit tests; this covers the canvas image exports for
 *  a deployment and a dynamic view through the real Export dialog. */
const DSL = `workspace "Exportable" {
  model {
    user = person "User"
    shop = softwareSystem "Web Shop" {
      spa = container "Storefront SPA"
      api = container "Shop API"
      db = container "Shop DB"
      spa -> api "Submits order"
      api -> db "Persists order"
    }
    user -> spa "Uses"

    deploymentEnvironment "Live" {
      deploymentNode "AWS" "" "Amazon Web Services" {
        deploymentNode "eu-west-1" "" "AWS region" {
          lb = infrastructureNode "Load Balancer" "Routes" "ELB"
          deploymentNode "App Server" "" "Ubuntu" "" 3 {
            liveApi = containerInstance api
          }
        }
      }
      lb -> liveApi "Forwards to"
    }
  }
  views {
    systemLandscape landscape "Landscape" {
      include *
      autolayout tb
    }
    deployment * "Live" "LiveAll" {
      include *
      autolayout lr
    }
    dynamic shop "Checkout" {
      spa -> api "Submits order"
      api -> db "Persists order"
      api -> spa "Returns confirmation"
      autolayout lr
    }
  }
}`

async function exportImage(page: Page, rowLabel: string, ext: string): Promise<number> {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export workspace' })
  await expect(dialog).toBeVisible()

  // The innermost div that holds both the row label and the action buttons —
  // filtering by text alone would resolve to the label div, which has neither.
  const row = dialog
    .locator('div')
    .filter({ has: page.getByText(rowLabel, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Dark', exact: true }) })
    .last()
  const downloadPromise = page.waitForEvent('download')
  await row.getByRole('button', { name: 'Dark', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`))

  const path = await download.path()
  const { statSync } = await import('node:fs')
  const size = statSync(path!).size

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  return size
}

test.describe('Export for dynamic and deployment views', () => {
  test('deployment view exports PNG and SVG', async ({ workspace, page }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('LiveAll')

    // A real render of the deployment view compresses to well over a blank
    // canvas; a blank/failed export is a few hundred bytes.
    const pngSize = await exportImage(page, 'PNG Image', 'png')
    expect(pngSize).toBeGreaterThan(5_000)

    const svgSize = await exportImage(page, 'SVG Vector', 'svg')
    expect(svgSize).toBeGreaterThan(1_000)
  })

  test('dynamic view exports PNG and SVG', async ({ workspace, page }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Checkout')

    const pngSize = await exportImage(page, 'PNG Image', 'png')
    expect(pngSize).toBeGreaterThan(5_000)

    const svgSize = await exportImage(page, 'SVG Vector', 'svg')
    expect(svgSize).toBeGreaterThan(1_000)
  })
})
