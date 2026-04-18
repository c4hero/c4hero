/**
 * Canvas basics walkthrough for the landing page.
 *
 * Runs a scripted sequence against the Big Bank sample and records the
 * browser session as WebM via Playwright's built-in video feature. The
 * test then copies + converts the video into ./screenshots/walkthrough/
 * (raw .webm plus an MP4 suitable for <video> autoplay).
 *
 * Run with:
 *   npm run walkthrough
 */
import { test, type Page } from '@playwright/test'
import { mkdir, copyFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

interface ViewInfo { key: string; type: string; title: string }
declare global {
  interface Window {
    __testLoadTemplate?: (name: string) => void
    __testSetView?: (key: string) => void
    __testListViews?: () => ViewInfo[]
  }
}

const OUT_DIR = resolve(process.cwd(), 'screenshots', 'walkthrough')

/** Smoothly move the mouse between two points over `steps` frames. */
async function glide(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 24) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
    await page.waitForTimeout(12)
  }
}

async function loadSample(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => window.__testLoadTemplate?.('bigBank'))
  await page.waitForURL(/\/collection\//, { timeout: 5000 })
  await page.locator('.react-flow').waitFor({ state: 'visible' })
  await page.locator('.c4-node').first().waitFor({ state: 'visible', timeout: 5000 })
  // Let the initial fit-on-view-switch land
  await page.waitForTimeout(800)
}

async function switchToView(page: Page, key: string) {
  await page.evaluate((k) => window.__testSetView?.(k), key)
  await page.waitForTimeout(900) // fit animation + settle
}

async function hoverAndPause(page: Page, selector: string, pauseMs = 800) {
  const loc = page.locator(selector).first()
  try { await loc.waitFor({ state: 'visible', timeout: 3000 }) } catch { return }
  const box = await loc.boundingBox()
  if (!box) return
  const target = { x: box.x + Math.min(60, box.width / 2), y: box.y + Math.min(24, box.height / 2) }
  await glide(page, { x: 640, y: 400 }, target, 20)
  await page.waitForTimeout(pauseMs)
}

async function clickFirstNodeSafely(page: Page) {
  const node = page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.c4-node') })
    .first()
  try { await node.waitFor({ state: 'visible', timeout: 3000 }) } catch { return }
  const box = await node.boundingBox()
  if (!box) return
  const target = { x: box.x + Math.min(60, box.width / 2), y: box.y + Math.min(24, box.height / 2) }
  await glide(page, { x: 640, y: 400 }, target, 20)
  try {
    await node.click({ position: { x: Math.min(60, box.width / 2), y: Math.min(24, box.height / 2) }, timeout: 2000 })
  } catch { /* skip click if node moved during animation */ }
}

test('canvas basics', async ({ page }) => {
  test.setTimeout(120_000)

  // ── Opening scene: L1 landscape ──────────────────────────────────
  await loadSample(page)
  await page.waitForTimeout(700)

  // Select a node so the inspector opens
  await clickFirstNodeSafely(page)
  await page.waitForTimeout(1100)

  // ── L2 container view ────────────────────────────────────────────
  await switchToView(page, 'Containers')
  await page.waitForTimeout(500)
  await hoverAndPause(page, '.react-flow__node', 900)

  // ── L3 component view ────────────────────────────────────────────
  await switchToView(page, 'Components')
  await page.waitForTimeout(500)
  await hoverAndPause(page, '.react-flow__node', 900)

  // ── Back to L1 ───────────────────────────────────────────────────
  await switchToView(page, 'SystemLandscape')
  await page.waitForTimeout(1000)
})

test.afterAll(async () => {
  // Find the latest captured video(s) under test-results/ and copy the
  // newest one into ./screenshots/walkthrough/. Also produce an .mp4 via
  // ffmpeg when available so landing pages can <video> autoplay it.
  await mkdir(OUT_DIR, { recursive: true })
  const findVideos = spawnSync('sh', ['-c', 'ls -t test-results/**/video.webm 2>/dev/null | head -1'])
  const path = findVideos.stdout.toString().trim()
  if (!path) {
    // eslint-disable-next-line no-console
    console.warn('no video.webm found under test-results/')
    return
  }
  const targetWebm = resolve(OUT_DIR, 'canvas-basics.webm')
  await copyFile(path, targetWebm)

  // Try to produce an mp4 too. Silently skip if ffmpeg isn't available.
  const targetMp4 = resolve(OUT_DIR, 'canvas-basics.mp4')
  await rm(targetMp4, { force: true })
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i', targetWebm,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      targetMp4,
    ],
    { stdio: 'pipe' },
  )
  if (ff.status !== 0) {
    // eslint-disable-next-line no-console
    console.warn('ffmpeg mp4 conversion failed or unavailable; .webm only')
  }
})
