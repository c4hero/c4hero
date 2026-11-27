import { test, expect } from '../fixtures/workspace'
import type { Page } from '@playwright/test'

/** TEA-385: technology logos (TEA-381) are inline SVG inside each node, so the
 *  PNG and SVG exports must carry them. Kotlin's mark is a distinctive purple
 *  (#7F52FF) found nowhere else on the canvas, which makes it a cheap pixel
 *  probe for the PNG. */
const DSL = `workspace "Logos" {
  model {
    shop = softwareSystem "Web Shop" {
      spa = container "Storefront" "" "React"
      api = container "Shop API" "" "Kotlin, Micronaut"
      db = container "Shop DB" "" "PostgreSQL"
      spa -> api "Calls"
      api -> db "Reads"
    }
  }
  views {
    container shop "Containers" {
      include *
      autolayout lr
    }
  }
}`

const KOTLIN_PATH = 'M24 24H0V0h24L12 12Z'

async function exportFile(page: Page, rowLabel: string, button: 'Dark' | 'Light'): Promise<string> {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export workspace' })
  await expect(dialog).toBeVisible()
  const row = dialog
    .locator('div')
    .filter({ has: page.getByText(rowLabel, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: button, exact: true }) })
    .last()
  const downloadPromise = page.waitForEvent('download')
  await row.getByRole('button', { name: button, exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  return path
}

/** Count pixels close to Kotlin purple in a PNG, decoded by the browser. */
async function kotlinPixels(page: Page, pngPath: string): Promise<number> {
  const { readFileSync } = await import('node:fs')
  const base64 = readFileSync(pngPath).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let hits = 0
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - 0x7f) < 24 && Math.abs(px[i + 1] - 0x52) < 24 && Math.abs(px[i + 2] - 0xff) < 24) hits++
    }
    return hits
  }, base64)
}

test.describe('Technology logos in image exports (TEA-385)', () => {
  test('SVG export carries every logo on the canvas', async ({ workspace, page }) => {
    await workspace.parseAndLoad(DSL)
    await expect(page.locator('.c4-node-tech-icon')).toHaveCount(3)

    const { readFileSync } = await import('node:fs')
    for (const theme of ['Dark', 'Light'] as const) {
      const svg = readFileSync(await exportFile(page, 'SVG Vector', theme), 'utf8')
      expect(svg.match(/c4-node-tech-icon/g)?.length, theme).toBe(3)
      expect(svg, theme).toContain(KOTLIN_PATH)
      // The logo's own geometry survives the export sanitizer.
      expect(svg, theme).toMatch(/<svg[^>]*viewBox="0 0 24 24"/)
    }
  })

  test('PNG export draws the logos', async ({ workspace, page }) => {
    await workspace.parseAndLoad(DSL)
    await expect(page.locator('.c4-node-tech-icon')).toHaveCount(3)

    for (const theme of ['Dark', 'Light'] as const) {
      const hits = await kotlinPixels(page, await exportFile(page, 'PNG Image', theme))
      // The Kotlin mark is ~16px square at 2x pixel ratio: well over 100 px.
      expect(hits, theme).toBeGreaterThan(100)
    }
  })
})

test('an export started before the logos load still waits for them', async ({ workspace, page }) => {
  // Hold the lazily loaded catalog chunk back, so the export dialog opens while
  // every node is still showing its type glyph.
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route(/techIcons\/catalog|\/catalog-[\w-]+\.js/, async (route) => {
    await held
    await route.continue()
  })
  await workspace.parseAndLoad(DSL)
  await expect(page.locator('[data-tech-icon-pending]')).toHaveCount(3)
  setTimeout(release, 1_500)

  const { readFileSync } = await import('node:fs')
  const svg = readFileSync(await exportFile(page, 'SVG Vector', 'Dark'), 'utf8')
  expect(svg.match(/c4-node-tech-icon/g)?.length).toBe(3)
  expect(svg).not.toContain('data-tech-icon-pending')
})
