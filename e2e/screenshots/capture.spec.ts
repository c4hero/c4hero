/**
 * Screenshot capture for README / marketing.
 *
 * Run with:
 *   npx playwright test e2e/screenshots/capture.spec.ts --project=chromium --workers=1
 *
 * Writes PNGs to ./screenshots/ at the repo root. Each template/view pair
 * produces one full-page screenshot; Big Bank also gets one "clean canvas"
 * screenshot with the side panels hidden.
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

interface ViewInfo {
  key: string
  type: string
  title: string
}

declare global {
  interface Window {
    __testLoadTemplate?: (name: string) => void
    __testSetView?: (key: string) => void
    __testListViews?: () => ViewInfo[]
  }
}

const OUT_DIR = resolve(process.cwd(), 'screenshots')

const TEMPLATES: { id: string; label: string }[] = [
  { id: 'bigBank', label: 'big-bank' },
  { id: 'microservices', label: 'microservices' },
  { id: 'monolith', label: 'monolith' },
  { id: 'eventDriven', label: 'event-driven' },
]

async function loadTemplate(page: Page, id: string) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate((tid) => window.__testLoadTemplate?.(tid), id)
  await page.waitForURL(/\/collection\//, { timeout: 5000 })
  await page.locator('.react-flow').waitFor({ state: 'visible' })
  // Wait for at least one node to render
  await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
}

async function switchView(page: Page, key: string) {
  await page.evaluate((k) => window.__testSetView?.(k), key)
  // Give fit animation a moment to settle
  await page.waitForTimeout(600)
}

async function listViews(page: Page): Promise<ViewInfo[]> {
  return (await page.evaluate(() => window.__testListViews?.() ?? [])) as ViewInfo[]
}

async function writeShot(page: Page, filename: string) {
  const fullPath = resolve(OUT_DIR, filename)
  await mkdir(dirname(fullPath), { recursive: true })
  await page.screenshot({ path: fullPath, fullPage: false })
}

test.use({
  viewport: { width: 1600, height: 1000 },
  // Headed captures are easier on some platforms; headless is fine for CI
  // deviceScaleFactor: 2, // uncomment for retina output
})

test.describe('capture README screenshots', () => {
  test.describe.configure({ mode: 'serial' })

  for (const tpl of TEMPLATES) {
    test(`${tpl.label}`, async ({ page }) => {
      await loadTemplate(page, tpl.id)
      const views = await listViews(page)
      expect(views.length).toBeGreaterThan(0)

      for (const v of views) {
        await switchView(page, v.key)
        // Wait for nodes to settle after the view switch
        await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
        await page.waitForTimeout(400) // let fit animation finish
        await page.locator('.c4-node').first().waitFor({ state: 'visible' })
        const slug = `${tpl.label}-${v.type}-${v.key}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
        await writeShot(page, `${slug}.png`)
      }
    })
  }
})
