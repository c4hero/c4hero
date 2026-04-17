/**
 * Screenshot capture for README / marketing.
 *
 * Default run (chrome-free, presentation mode):
 *   npm run screenshots
 *
 * Include tools (top pill, left rail, bottom strip) + right inspector:
 *   npm run screenshots:full
 *   # or: SCREENSHOT_CHROME=all npm run screenshots
 *
 * Output goes to ./screenshots/ at the repo root, rendered at 2×
 * device scale factor so diagrams look crisp on retina displays.
 * "Chrome=all" outputs land in ./screenshots/with-chrome/ so they
 * don't overwrite the clean set.
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

const CHROME = (process.env.SCREENSHOT_CHROME ?? 'none') === 'all' ? 'all' : 'none'
const OUT_DIR = CHROME === 'all'
  ? resolve(process.cwd(), 'screenshots', 'with-chrome')
  : resolve(process.cwd(), 'screenshots')

const TEMPLATES: { id: string; label: string }[] = [
  { id: 'bigBank', label: 'big-bank' },
  { id: 'microservices', label: 'microservices' },
  { id: 'monolith', label: 'monolith' },
  { id: 'eventDriven', label: 'event-driven' },
]

async function enterPresentationMode(page: Page) {
  await page.keyboard.press('p')
  await page.waitForTimeout(150)
}

async function disableOverlays(page: Page) {
  const extra = CHROME === 'all'
    ? ''
    : `
      /* Hide the React Flow minimap in marketing captures */
      .react-flow__minimap { display: none !important; }
      /* Hide the "Press Esc or F to exit" hint shown in presentation mode */
      div:has(> kbd):is(.fixed.bottom-4) { display: none !important; }
    `
  await page.addStyleTag({
    content: `
      ${extra}
      /* Hide any dev-only banner if present */
      [data-dev-banner] { display: none !important; }
    `,
  })
}

async function selectFirstNode(page: Page) {
  // Click the first content node so the right inspector opens. Use a
  // center-of-bbox click to avoid hitting a handle or action button.
  const node = page.locator('.react-flow__node').filter({ has: page.locator('.c4-node') }).first()
  await node.waitFor({ state: 'visible' })
  await node.click({ position: { x: 20, y: 20 } })
  // Let the right panel animate in
  await page.waitForTimeout(250)
}

async function loadTemplate(page: Page, id: string) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate((tid) => window.__testLoadTemplate?.(tid), id)
  await page.waitForURL(/\/collection\//, { timeout: 5000 })
  await page.locator('.react-flow').waitFor({ state: 'visible' })
  await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
  if (CHROME === 'none') await enterPresentationMode(page)
  await disableOverlays(page)
}

async function switchView(page: Page, key: string) {
  await page.evaluate((k) => window.__testSetView?.(k), key)
  // Let fit-to-view animation settle (300ms transition + a little buffer)
  await page.waitForTimeout(700)
}

async function listViews(page: Page): Promise<ViewInfo[]> {
  return (await page.evaluate(() => window.__testListViews?.() ?? [])) as ViewInfo[]
}

async function writeShot(page: Page, filename: string) {
  const fullPath = resolve(OUT_DIR, filename)
  await mkdir(dirname(fullPath), { recursive: true })
  if (CHROME === 'all') {
    // Full-viewport screenshot so the floating tools and right inspector
    // are included in the frame.
    await page.screenshot({ path: fullPath, fullPage: false })
  } else {
    const canvas = page.locator('.react-flow')
    await canvas.waitFor({ state: 'visible' })
    await canvas.screenshot({ path: fullPath })
  }
}

test.use({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
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
        await disableOverlays(page)
        await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
        if (CHROME === 'all') await selectFirstNode(page)
        const slug = `${tpl.label}-${v.type}-${v.key}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
        await writeShot(page, `${slug}.png`)
      }
    })
  }
})
