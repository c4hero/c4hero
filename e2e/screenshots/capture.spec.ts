/**
 * Screenshot capture for README / marketing.
 *
 * Run with:
 *   npm run screenshots
 *
 * Writes PNGs to ./screenshots/ at the repo root. Presentation mode is
 * toggled on for a chrome-free canvas; the minimap is hidden; output is
 * cropped to the canvas element and rendered at 2× device scale factor
 * so diagrams look crisp on retina displays.
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

async function enterPresentationMode(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __testUseWorkspace?: { getState: () => { setPresentationMode?: (v: boolean) => void } }
    }
    void w
    // Flip the store directly — the workspace store is the single source of
    // truth for UI chrome. The test helper module already exposes enough;
    // use keyboard shortcut as a fallback if needed.
  })
  // The `p` key toggles presentation mode (see keyboard shortcuts).
  await page.keyboard.press('p')
  // Wait for the DOM to settle into the chrome-free layout
  await page.waitForTimeout(150)
}

async function disableMinimapAndOverlays(page: Page) {
  await page.addStyleTag({
    content: `
      /* Hide the React Flow minimap in marketing captures */
      .react-flow__minimap { display: none !important; }
      /* Hide the "Press Esc or F to exit" hint shown in presentation mode */
      div:has(> kbd):is(.fixed.bottom-4) { display: none !important; }
      /* Hide any dev-only banner if present */
      [data-dev-banner] { display: none !important; }
    `,
  })
}

async function loadTemplate(page: Page, id: string) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate((tid) => window.__testLoadTemplate?.(tid), id)
  await page.waitForURL(/\/collection\//, { timeout: 5000 })
  await page.locator('.react-flow').waitFor({ state: 'visible' })
  await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
  await enterPresentationMode(page)
  await disableMinimapAndOverlays(page)
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
  const canvas = page.locator('.react-flow')
  await canvas.waitFor({ state: 'visible' })
  await canvas.screenshot({ path: fullPath })
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
        // Re-apply the style overrides in case something re-rendered and
        // clobbered our injected stylesheet.
        await disableMinimapAndOverlays(page)
        await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
        const slug = `${tpl.label}-${v.type}-${v.key}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
        await writeShot(page, `${slug}.png`)
      }
    })
  }
})
