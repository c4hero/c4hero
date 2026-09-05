import { test, expect } from '../fixtures/workspace'

// Real File System Access handles can't be driven from Playwright, so these
// tests use the dev-only `window.__testFileSource` stand-in: an in-memory
// "file" the disk watcher polls exactly like a handle.

const BASE = `workspace "Watch" {
  model {
    u = person "User"
    sys = softwareSystem "Sys"
    u -> sys "Uses"
  }
  views {
    systemLandscape "Land" { include * }
    systemContext sys "Ctx" { include * }
  }
}`

const WITH_PAYMENTS = BASE.replace(
  'sys = softwareSystem "Sys"',
  'sys = softwareSystem "Sys"\n    pay = softwareSystem "Payments"',
)

type FileSourceApi = {
  install: (filename: string, content: string, sidecarJson?: string) => void
  set: (content: string, sidecarJson?: string) => void
  remove: () => void
  clear: () => void
}

function fileSource(page: import('@playwright/test').Page) {
  const call = <K extends keyof FileSourceApi>(method: K, ...args: Parameters<FileSourceApi[K]>) =>
    page.evaluate(
      ({ method, args }) => {
        const api = (window as unknown as { __testFileSource: FileSourceApi }).__testFileSource
        ;(api[method] as (...a: unknown[]) => void)(...args)
      },
      { method, args },
    )
  return {
    install: (filename: string, content: string) => call('install', filename, content),
    set: (content: string) => call('set', content),
    remove: () => call('remove'),
    clear: () => call('clear'),
  }
}

test.describe('Watch mode', () => {
  test.afterEach(async ({ page }) => {
    await fileSource(page).clear().catch(() => {})
  })

  test('reloads the canvas when the file changes on disk and keeps the active view', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(BASE)
    await workspace.setView('Ctx')
    await fileSource(page).install('watch.dsl', BASE)

    // The model picks up the new element within a poll interval. (It isn't
    // related to Sys, so the system-context view we're on doesn't show it —
    // which is exactly why the active view must survive the swap.)
    await fileSource(page).set(WITH_PAYMENTS)
    await expect.poll(async () => {
      const ws = await workspace.getWorkspace()
      return ws?.model.softwareSystems.map((s) => s.name) ?? []
    }, { timeout: 6000 }).toContain('Payments')

    // The user's place is preserved and the workspace is clean.
    const state = await page.evaluate(() => {
      const s = (window as unknown as { __testStore: () => { activeViewKey: string; undoStack: unknown[]; diskConflict: unknown } }).__testStore()
      return { activeViewKey: s.activeViewKey, undo: s.undoStack.length, conflict: s.diskConflict }
    })
    expect(state.activeViewKey).toBe('Ctx')
    expect(state.undo).toBe(0)
    expect(state.conflict).toBeNull()
    await expect(page.locator('[data-disk-conflict-bar]')).toBeHidden()

    // On the landscape view the new system is on the canvas.
    await workspace.setView('Land')
    await expect(await workspace.getNodeByName('Payments')).toBeVisible()
  })

  test('never discards unsaved local edits silently: conflict bar with both directions', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(BASE)
    await fileSource(page).install('watch.dsl', BASE)

    // Make a local edit (no handles are linked, so nothing autosaves it to "disk").
    await page.evaluate(() => {
      (window as unknown as { __testStore: () => { updateWorkspaceMeta: (p: { name: string }) => void } })
        .__testStore().updateWorkspaceMeta({ name: 'Renamed locally' })
    })

    await fileSource(page).set(WITH_PAYMENTS)
    const bar = page.locator('[data-disk-conflict-bar]')
    await expect(bar).toBeVisible({ timeout: 6000 })
    await expect(bar).toHaveAttribute('data-reason', 'dirty')
    await expect(bar).toContainText('watch.dsl changed on disk')
    // Not applied yet.
    await expect(await workspace.getNodeByName('Payments')).toHaveCount(0)

    // Keep mine: the bar goes away and stays away for this on-disk state.
    await bar.getByRole('button', { name: 'Keep mine' }).click()
    await expect(bar).toBeHidden()
    await page.waitForTimeout(2500)
    await expect(bar).toBeHidden()
    await expect(await workspace.getNodeByName('Payments')).toHaveCount(0)

    // A further external edit prompts again; this time reload and discard.
    const WITH_BILLING = WITH_PAYMENTS.replace('"Payments"', '"Billing"')
    await fileSource(page).set(WITH_BILLING)
    await expect(bar).toBeVisible({ timeout: 6000 })
    await bar.getByRole('button', { name: /Reload/ }).click()
    await expect(await workspace.getNodeByName('Billing')).toBeVisible({ timeout: 6000 })
    await expect(bar).toBeHidden()
    const name = await page.evaluate(() =>
      (window as unknown as { __testGetWorkspace: () => { name?: string } }).__testGetWorkspace().name)
    expect(name).toBe('Watch')
  })

  test('broken text on disk is reported, not applied', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(BASE)
    await fileSource(page).install('watch.dsl', BASE)

    await fileSource(page).set('workspace "Broken" { model { u = person }')
    const bar = page.locator('[data-disk-conflict-bar]')
    await expect(bar).toBeVisible({ timeout: 6000 })
    await expect(bar).toHaveAttribute('data-reason', 'unparseable')
    await expect(await workspace.getNodeByName('User')).toBeVisible()
  })

  test('a deleted file gives a friendly state, not an empty canvas', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(BASE)
    await fileSource(page).install('watch.dsl', BASE)

    await fileSource(page).remove()
    const bar = page.locator('[data-disk-conflict-bar]')
    await expect(bar).toBeVisible({ timeout: 6000 })
    await expect(bar).toHaveAttribute('data-reason', 'missing')
    await expect(bar).toContainText('no longer on disk')
    await expect(await workspace.getNodeByName('User')).toBeVisible()
  })

  test('with watch mode off nothing is watched', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(BASE)
    await fileSource(page).install('watch.dsl', BASE)
    await page.evaluate(() => {
      (window as unknown as { __testStore: () => { setWatchDisk: (on: boolean) => void } }).__testStore().setWatchDisk(false)
    })

    await fileSource(page).set(WITH_PAYMENTS)
    await page.waitForTimeout(3000)
    await expect(await workspace.getNodeByName('Payments')).toHaveCount(0)
    await expect(page.locator('[data-disk-conflict-bar]')).toBeHidden()
  })
})
