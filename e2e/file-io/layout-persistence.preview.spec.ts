import { test, expect, type Page } from '@playwright/test'
import { WorkspaceHelper } from '../fixtures/workspace'
import type { SidecarData } from '../../src/lib/sidecar'

// Runs against the production build without dev-only store hooks. The chooser
// uses Chromium's real origin-private filesystem (OPFS), including persistence
// across reloads. Fault cases control errors/completion at the writable API.
const folder = 'layout-preview'
const retained = { pinned: true, locked: true, x: 800, y: 450 }
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)

test.afterEach(async ({ page }, testInfo) => {
  const screenshot = await page.screenshot({ path: testInfo.outputPath('final-workspace.png') })
  await testInfo.attach('final-workspace', { body: screenshot, contentType: 'image/png' })
})

async function seed(page: Page, dsl: string, sidecar: SidecarData, additionalFiles: Record<string, string> = {}) {
  await page.addInitScript((folderName) => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('c4hero.json', JSON.stringify({ canvasGuideDismissed: true }))
    const observed = window as Window & { __layoutIdleRuns: number }
    observed.__layoutIdleRuns = 0
    const request = window.requestIdleCallback.bind(window)
    window.requestIdleCallback = (callback, options) => request((deadline) => {
      callback(deadline)
      observed.__layoutIdleRuns++
    }, options)
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle(folderName),
    })
  }, folder)
  await page.goto('/')
  await page.evaluate(async ({ folderName, text, data, files }) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true })
    const contents = { 'preview.dsl': text, 'preview.c4hero.json': JSON.stringify(data), ...files }
    for (const [name, content] of Object.entries(contents)) {
      const parts = name.split('/')
      let target = dir
      for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true })
      const file = await target.getFileHandle(parts[parts.length - 1], { create: true })
      const writable = await file.createWritable()
      await writable.write(content)
      await writable.close()
    }
  }, { folderName: folder, text: dsl, data: sidecar, files: additionalFiles })
  await openCollection(page)
}

async function openCollection(page: Page) {
  await page.getByRole('button', { name: 'Open collection', exact: true }).click()
  await page.getByText('preview', { exact: true }).click()
  await expect(page.locator('.react-flow')).toBeVisible()
}

async function readSidecar(page: Page): Promise<SidecarData> {
  return page.evaluate(async (folderName) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const file = await (await dir.getFileHandle('preview.c4hero.json')).getFile()
    return JSON.parse(await file.text())
  }, folder)
}

async function save(page: Page) {
  await page.getByRole('button', { name: /^(Unsaved changes|All changes saved|Saved to file)/ }).click()
  await expect(page.getByRole('button', { name: 'Saved to file', exact: true })).toBeVisible()
}

async function reopen(page: Page) {
  // A fresh document drops all module/store state; the init script also drops
  // crash recovery. The collection loader must read both persisted files.
  await page.goto('/')
  await openCollection(page)
}

async function editDSL(page: Page, text: string) {
  await page.keyboard.press('Control+e')
  const editor = page.locator('[data-code-pane-editor] .cm-content')
  await expect(editor).toBeVisible()
  await editor.fill(text)
  await expect(page.locator('[data-code-pane-footer]')).toContainText('In sync with canvas')
  await expect(page.locator('[data-code-pane-errors]')).toBeHidden()
  await page.keyboard.press('Control+e')
  await expect(editor).toBeHidden()
}

async function arrange(page: Page) {
  await page.keyboard.press('Control+Shift+l')
}

test('canonical files keep their timestamps on reopen and save, while drags and model edits persist', async ({ page }, testInfo) => {
  await seed(page, `workspace "Write timestamps" {
    model {
      payments = softwareSystem "Payments" {
        api = container "API"
      }
    }
    views {
      container payments "Services" {
        include *
      }
    }
  }`, { version: 1, views: { Services: { elements: { api: { pinned: true, x: 100, y: 200 } } } } })
  const files = () => page.evaluate(async folderName => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const read = async (name: string) => {
      const file = await (await dir.getFileHandle(name)).getFile()
      return { content: await file.text(), modified: file.lastModified }
    }
    return { dsl: await read('preview.dsl'), sidecar: await read('preview.c4hero.json') }
  }, folder)

  // Establish files in the app's saved format, including sidecar identity.
  // The first save may canonicalize an externally authored source.
  await save(page)
  const initial = await files()
  await reopen(page)
  // Allow the on-open autosave debounce and idle callback to run, then also
  // exercise manual Save. Identical bytes must never open a writable stream.
  await expect.poll(() => page.evaluate(() => (window as Window & { __layoutIdleRuns: number }).__layoutIdleRuns)).toBeGreaterThan(0)
  await save(page)
  const untouched = await files()
  expect(untouched).toEqual(initial)

  const beforeDrag = (await readSidecar(page)).views!.Services.elements!.api
  await new WorkspaceHelper(page).dragNodeBy('API', { x: 64, y: 44 })
  await expect.poll(async () => (await readSidecar(page)).views!.Services.elements!.api).not.toEqual(beforeDrag)
  const dragged = await files()
  expect(dragged.dsl).toEqual(initial.dsl)
  expect(dragged.sidecar.modified).toBeGreaterThan(initial.sidecar.modified)

  await editDSL(page, dragged.dsl.content.replace('"API"', '"Updated API"'))
  await expect.poll(async () => (await files()).dsl.content).toContain('"Updated API"')
  const edited = await files()
  expect(edited.dsl.modified).toBeGreaterThan(initial.dsl.modified)
  await save(page)
  expect(await files()).toEqual(edited)
  const persistedPosition = (await readSidecar(page)).views!.Services.elements!.api
  await page.screenshot({ path: testInfo.outputPath('edited-and-saved.png') })
  await reopen(page)
  await expect(node(page, 'api')).toContainText('Updated API')
  await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
    .toBe(`translate(${persistedPosition.x}px, ${persistedPosition.y}px)`)
  await testInfo.attach('file-timestamps.json', {
    body: JSON.stringify({ initial, untouched, dragged, edited }, null, 2),
    contentType: 'application/json',
  })
})

test('a failed layout write shows an error and keeps the edit unsaved until retry', async ({ page }, testInfo) => {
  const dsl = `workspace "Save retry" {
    model {
      payments = softwareSystem "Payments" {
        api = container "API"
      }
    }
    views {
      container payments "Services" { include * }
    }
  }`
  await seed(page, dsl, { version: 1, views: { Services: { elements: { api: { pinned: true, x: 100, y: 200 } } } } })
  await save(page)
  const before = await readSidecar(page)
  await page.evaluate(() => {
    const observed = window as Window & { __failLayoutWrite: boolean }
    observed.__failLayoutWrite = true
    const original = FileSystemFileHandle.prototype.createWritable
    FileSystemFileHandle.prototype.createWritable = function (options) {
      if (observed.__failLayoutWrite && this.name.endsWith('.c4hero.json')) {
        return Promise.reject(new DOMException('Layout write denied', 'NotAllowedError'))
      }
      return original.call(this, options)
    }
  })
  await new WorkspaceHelper(page).dragNodeBy('API', { x: 64, y: 44 })
  const retry = page.getByRole('button', { name: 'Save failed — click to retry', exact: true })
  await expect(retry).toBeVisible()
  expect(await readSidecar(page)).toEqual(before)
  await page.screenshot({ path: testInfo.outputPath('layout-save-failed.png') })
  await page.evaluate(() => { (window as Window & { __failLayoutWrite: boolean }).__failLayoutWrite = false })
  await retry.click()
  await expect(page.getByRole('button', { name: 'Saved to file', exact: true })).toBeVisible()
  expect(await readSidecar(page)).not.toEqual(before)
  const persistedPosition = (await readSidecar(page)).views!.Services.elements!.api
  await reopen(page)
  await expect(node(page, 'api')).toContainText('API')
  await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
    .toBe(`translate(${persistedPosition.x}px, ${persistedPosition.y}px)`)
})

test('a pending save cannot mark a different same-name workspace saved', async ({ page }, testInfo) => {
  const dsl = (name: string) => `workspace "Shared name" {
    model {
      payments = softwareSystem "Payments" {
        api = container "${name}"
      }
    }
    views {
      container payments "Services" { include * }
    }
  }`
  await seed(page, dsl('First API'), { version: 1, views: { Services: { elements: { api: { pinned: true, x: 100, y: 200 } } } } })
  await save(page)
  await page.evaluate(async ({ folderName, text }) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const stream = await (await dir.getFileHandle('second.dsl', { create: true })).createWritable()
    await stream.write(text)
    await stream.close()
    const observed = window as Window & {
      __pendingSaveStarted: boolean
      __pendingSaveClosed: boolean
      __releasePendingSave: () => void
    }
    observed.__pendingSaveStarted = false
    observed.__pendingSaveClosed = false
    const held = new Promise<void>((resolve) => { observed.__releasePendingSave = resolve })
    const original = FileSystemFileHandle.prototype.createWritable
    FileSystemFileHandle.prototype.createWritable = async function (options) {
      const writable = await original.call(this, options)
      if (this.name === 'preview.dsl') {
        const close = writable.close.bind(writable)
        writable.close = async () => {
          observed.__pendingSaveStarted = true
          await held
          await close()
          observed.__pendingSaveClosed = true
        }
      }
      return writable
    }
    // The test controls Save explicitly so the new workspace cannot save
    // itself while the first workspace's completion is being checked.
    let idleId = 0
    window.requestIdleCallback = () => ++idleId
  }, { folderName: folder, text: dsl('Second API') })
  await editDSL(page, dsl('Saved first API'))
  await page.getByRole('button', { name: /^(Unsaved changes|All changes saved|Saved to file)/ }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __pendingSaveStarted: boolean }).__pendingSaveStarted)).toBe(true)
  await page.getByRole('button', { name: 'Shared name', exact: true }).click()
  await page.getByText('second', { exact: true }).click()
  await expect(node(page, 'api')).toContainText('Second API')
  await editDSL(page, dsl('Unsaved second API'))
  await page.evaluate(() => { (window as Window & { __releasePendingSave: () => void }).__releasePendingSave() })
  await expect.poll(() => page.evaluate(() => (window as Window & { __pendingSaveClosed: boolean }).__pendingSaveClosed)).toBe(true)
  await expect(page.getByRole('button', { name: 'Unsaved changes — click to save', exact: true })).toBeVisible()
  const secondText = await page.evaluate(async (folderName) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    return (await (await dir.getFileHandle('second.dsl')).getFile()).text()
  }, folder)
  expect(secondText).toContain('"Second API"')
  expect(secondText).not.toContain('"Unsaved second API"')
  await page.screenshot({ path: testInfo.outputPath('switched-workspace-stays-unsaved.png') })
  await save(page)
  await page.getByRole('button', { name: 'Shared name', exact: true }).click()
  await page.getByText('preview', { exact: true }).click()
  await expect(node(page, 'api')).toContainText('Saved first API')
})

test('watch mode reloads an external restore of previously saved bytes', async ({ page }, testInfo) => {
  await seed(page, `workspace "External restore" {
    model {
      payments = softwareSystem "Payments" {
        api = container "API"
      }
    }
    views {
      container payments "Services" { include * }
    }
  }`, { version: 1, views: { Services: { elements: { api: { pinned: true, x: 100, y: 200 } } } } })
  await save(page)
  await expect(page.locator('[data-watching-disk="true"]')).toBeVisible()
  const original = await page.evaluate(async (folderName) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    return (await (await dir.getFileHandle('preview.dsl')).getFile()).text()
  }, folder)
  await editDSL(page, original.replace('"API"', '"Updated API"'))
  await save(page)
  await expect(node(page, 'api')).toContainText('Updated API')
  // Let the watcher acknowledge the successful save before a different
  // writer restores the old canonical bytes. Old self-write history must
  // not classify this later external operation as our own save.
  await page.waitForTimeout(2200)
  await page.evaluate(async ({ folderName, text }) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const stream = await (await dir.getFileHandle('preview.dsl')).createWritable()
    await stream.write(text)
    await stream.close()
  }, { folderName: folder, text: original })
  await expect(node(page, 'api').getByText('API', { exact: true })).toBeVisible({ timeout: 6000 })
  await expect(node(page, 'api').getByText('Updated API', { exact: true })).toHaveCount(0)
  await expect(page.locator('[data-disk-conflict-bar]')).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('external-old-bytes-restored.png') })
})

test('an unrelated autosave preserves an externally edited included fragment and stays unsaved', async ({ page }, testInfo) => {
  await seed(page, `workspace "Include protection" {
    model {
      !include model/fragment.dsl
    }
    views {
      container payments "Services" { include * }
    }
  }`, { version: 1, views: { Services: { elements: { api: { pinned: true, x: 100, y: 200 } } } } }, {
    'model/fragment.dsl': 'payments = softwareSystem "Payments" {\n  api = container "API"\n}\n',
  })
  await save(page)
  const beforePosition = (await readSidecar(page)).views!.Services.elements!.api
  const disk = await page.evaluate(async (folderName) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const model = await dir.getDirectoryHandle('model')
    const fragment = await (await model.getFileHandle('fragment.dsl')).getFile()
    return { fragment: await fragment.text() }
  }, folder)
  const external = disk.fragment.replace('"API"', '"External API"')
  await page.evaluate(async ({ folderName, text }) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const model = await dir.getDirectoryHandle('model')
    const stream = await (await model.getFileHandle('fragment.dsl')).createWritable()
    await stream.write(text)
    await stream.close()
  }, { folderName: folder, text: external })
  const idleRuns = await page.evaluate(() => (window as Window & { __layoutIdleRuns: number }).__layoutIdleRuns)
  await new WorkspaceHelper(page).dragNodeBy('API', { x: 64, y: 44 })
  await expect.poll(() => page.evaluate(() => (window as Window & { __layoutIdleRuns: number }).__layoutIdleRuns)).toBeGreaterThan(idleRuns)
  await expect.poll(async () => (await readSidecar(page)).views!.Services.elements!.api).not.toEqual(beforePosition)
  const preserved = await page.evaluate(async (folderName) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName)
    const model = await dir.getDirectoryHandle('model')
    return (await (await model.getFileHandle('fragment.dsl')).getFile()).text()
  }, folder)
  expect(preserved).toBe(external)
  await expect(page.getByRole('button', { name: 'Save failed — click to retry', exact: true })).toBeVisible()
  await expect(page.locator('[data-disk-conflict-bar]')).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('external-include-preserved.png') })
})

for (const lockOnly of [false, true]) {
  test(`${lockOnly ? 'lock-only' : 'sparse'} keyless layouts survive unchanged real save/reopen`, async ({ page }) => {
    const dsl = `workspace "Preview" {
      model {
        payments = softwareSystem "Payments" {
          api = container "API"
          db = container "Database"
        }
      }
      views {
        container payments {
          title "Wide"
          include *
        }
        container payments {
          title "Narrow"
          include api
        }
      }
    }`
    // Start with a legacy sidecar so the save also verifies migration to
    // complete membership. Only a shared node has a persisted position.
    await seed(page, dsl, { version: 1, views: lockOnly ? {
      'Containers-payments-2': { locked: true },
    } : {
      'Containers-payments': { elements: { api: { pinned: true, locked: true, x: 100, y: 200 } } },
      'Containers-payments-2': { elements: { api: retained } },
    } })
    await save(page)
    const saved = await readSidecar(page)
    expect(saved.views?.['Containers-payments-2'].view?.elementIds).toEqual(['api'])
    if (!lockOnly) expect(saved.views?.['Containers-payments'].view?.elementIds).toEqual(['api', 'db'])
    await reopen(page)
    if (!lockOnly) {
      await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
        .toBe('translate(100px, 200px)')
      await expect(node(page, 'api').getByRole('img', { name: 'API is locked in place' })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Switch view' }).click()
    await page.getByText('Narrow', { exact: true }).click()
    await expect(node(page, 'db')).toHaveCount(0)
    if (lockOnly) {
      await expect(page.getByRole('button', { name: 'Auto-arrange (view layout locked)', exact: true })).toBeVisible()
    } else {
      await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
        .toBe('translate(800px, 450px)')
      await expect(node(page, 'api').getByRole('img', { name: 'API is locked in place' })).toBeVisible()
    }
    await save(page)
    expect(await readSidecar(page)).toEqual(saved)
  })
}

for (const [type, key] of [['container', ''], ['dynamic', '!!!']] as const) {
  test(`${type} layout survives a generated key written before its header description`, async ({ page }, testInfo) => {
    const viewKey = `${type === 'container' ? 'Containers' : 'Dynamic'}-payments`
    await seed(page, `workspace "Preview" {
      model {
        payments = softwareSystem "Payments" {
          api = container "API"
          db = container "Database"
        }
        api -> db "Reads"
      }
      views {
        ${type} payments "${key}" "Description" {
          ${type === 'container' ? 'include *' : 'api -> db "Reads"'}
        }
      }
    }`, { version: 1, views: {
      [viewKey]: { locked: true, elements: { api: { pinned: true, locked: true, x: 100, y: 200 } } },
    } })
    await save(page)
    const saved = await readSidecar(page)
    expect(saved.views?.[viewKey].view?.key).toBe(viewKey)
    await reopen(page)
    await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
      .toBe('translate(100px, 200px)')
    await expect(node(page, 'api').getByRole('img', { name: 'API is locked in place' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Auto-arrange (view layout locked)', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('materialized-key-after-reopen.png') })
    await save(page)
    expect(await readSidecar(page)).toEqual(saved)
  })
}

test('keyless layouts follow reordered and surviving views through real save/reopen', async ({ page }, testInfo) => {
  const wide = 'container payments {\n include *\n }'
  const narrow = 'container payments {\n include api\n }'
  const dsl = (views: string) => `workspace "Preview" {
    model {
      payments = softwareSystem "Payments" {
        api = container "API"
        db = container "Database"
      }
    }
    views {
      ${views}
    }
  }`
  const identity = { type: 'container' as const, softwareSystemId: 'payments' }
  const wideLayout = { view: { ...identity, elementIds: ['api', 'db'] }, elements: {
    api: { pinned: true, x: 100, y: 200 },
    db: { pinned: true, x: 400, y: 200 },
  } }
  const narrowLayout = { view: { ...identity, elementIds: ['api'] }, locked: true, elements: { api: retained } }
  await seed(page, dsl(`${wide}\n${narrow}`), { version: 1, views: {
    'Containers-payments': wideLayout,
    'Containers-payments-2': narrowLayout,
  } })
  await expect(node(page, 'db')).toBeVisible()
  await editDSL(page, dsl(`${narrow}\n${wide}`))
  await expect(node(page, 'db')).toHaveCount(0)
  await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
    .toBe('translate(800px, 450px)')
  await save(page)
  expect((await readSidecar(page)).views).toEqual({
    'Containers-payments': narrowLayout,
    'Containers-payments-2': wideLayout,
  })
  await reopen(page)
  await expect(node(page, 'db')).toHaveCount(0)
  await editDSL(page, dsl(`${wide}\n${narrow}`))
  await expect(node(page, 'db')).toBeVisible()
  await editDSL(page, dsl(narrow))
  await expect(node(page, 'db')).toHaveCount(0)
  await save(page)
  await reopen(page)
  await expect.poll(() => node(page, 'api').evaluate(el => (el as HTMLElement).style.transform))
    .toBe('translate(800px, 450px)')
  await save(page)
  const saved = (await readSidecar(page)).views!
  expect(saved['Containers-payments']).toEqual(narrowLayout)
  expect(Object.values(saved)).toContainEqual(wideLayout)
  await page.screenshot({ path: testInfo.outputPath('keyless-survivor.png') })
})

test('dynamic restoration, reset, undo/redo and real save/reopen', async ({ page }) => {
  await seed(page, `workspace "Preview" {
    model {
      payments = softwareSystem "Payments" {
        web = container "Web"
        api = container "API"
        db = container "Database"
      }
      web -> api "Calls"
      api -> db "Reads"
    }
    views {
      dynamic payments "Flow" {
        web -> api
      }
    }
  }`, { version: 1, views: { Flow: { elements: { db: retained } } } })
  await expect(node(page, 'db')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add element', exact: true }).click()
  const panel = page.locator('[data-flyout="add-element"]')
  await panel.getByLabel('Step source').selectOption({ label: 'API' })
  await panel.getByLabel('Step destination').selectOption({ label: 'Database' })
  await panel.getByRole('button', { name: 'Add step', exact: true }).click()
  await page.getByRole('button', { name: 'Add element', exact: true }).click()
  await expect(node(page, 'db')).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(node(page, 'db')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await expect(node(page, 'db')).toBeVisible()
  await save(page)
  expect((await readSidecar(page)).views?.Flow.elements?.db).toEqual(retained)
  const position = await node(page, 'db').evaluate(el => (el as HTMLElement).style.transform)
  await reopen(page)
  await expect(node(page, 'db')).toBeVisible()
  await expect.poll(() => node(page, 'db').evaluate(el => (el as HTMLElement).style.transform)).toBe(position)
  await node(page, 'db').click()
  await expect(page.getByRole('button', { name: 'Unlock position', exact: true })).toBeVisible()
  await arrange(page)
  await save(page)
  expect((await readSidecar(page)).views?.Flow.elements?.db).toEqual(retained)
  await page.getByRole('button', { name: 'Unlock position', exact: true }).click()
  await arrange(page)
  await save(page)
  expect(await readSidecar(page)).toEqual({ version: 1, views: {} })
  await page.keyboard.press('Control+z')
  await save(page)
  expect((await readSidecar(page)).views?.Flow.elements?.db).toEqual({ pinned: true, x: 800, y: 450 })
  await page.keyboard.press('Control+Shift+z')
  await save(page)
  expect(await readSidecar(page)).toEqual({ version: 1, views: {} })
  await reopen(page)
  await save(page)
  expect(await readSidecar(page)).toEqual({ version: 1, views: {} })
})

test('same-name elements keep exact retained positions through DSL edits and reopen', async ({ page }) => {
  const dsl = (include: string) => `workspace "Preview" {
    model {
      payments = softwareSystem "Payments" {
        a = container "Database"
        b = container "Database"
      }
    }
    views {
      container payments "View" {
        include ${include}
      }
    }
  }`
  const original = { version: 1 as const, views: { View: {
    view: { type: 'container' as const, key: 'View', softwareSystemId: 'payments', elementIds: ['a', 'b'] },
    elements: {
    a: { pinned: true, locked: true, x: 100, y: 200 },
    b: { pinned: true, x: 800, y: 900 },
  } } } }
  const withMembership = (elementIds: string[]) => ({ ...original, views: { View: {
    ...original.views.View, view: { ...original.views.View.view, elementIds },
  } } })
  await seed(page, dsl('*'), original)
  await editDSL(page, dsl('a'))
  await expect(node(page, 'b')).toHaveCount(0)
  await save(page)
  expect(await readSidecar(page)).toEqual(withMembership(['a']))
  await editDSL(page, dsl('b'))
  await expect(node(page, 'a')).toHaveCount(0)
  await expect(node(page, 'b')).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(node(page, 'a')).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(node(page, 'b')).toBeVisible()
  await save(page)
  expect(await readSidecar(page)).toEqual(withMembership(['b']))
  await reopen(page)
  await expect(node(page, 'b')).toBeVisible()
  await node(page, 'b').click()
  await expect(page.getByRole('button', { name: 'Lock position', exact: true })).toBeVisible()
  await save(page)
  expect(await readSidecar(page)).toEqual(withMembership(['b']))
})

test('deployment refresh restores a hidden instance through real save/reopen', async ({ page }) => {
  await seed(page, `workspace "Preview" {
    model {
      payments = softwareSystem "Payments" {
        api = container "API"
      }
      deploymentEnvironment "Live" {
        server = deploymentNode "Server" {
          liveApi = containerInstance api
        }
      }
    }
    views {
      deployment * "Live" "Deployment" {
        include server
      }
    }
  }`, { version: 1, views: { Deployment: { elements: { liveApi: retained } } } })
  await expect(node(page, 'liveApi')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add element', exact: true }).click()
  const panel = page.locator('[data-flyout="add-element"]')
  await panel.getByLabel('Element kind').selectOption('infra')
  await panel.getByLabel('Host deployment node').selectOption({ label: 'Server' })
  await panel.getByRole('button', { name: 'Add topology element' }).click()
  await page.getByRole('button', { name: 'Add element', exact: true }).click()
  await expect(node(page, 'liveApi')).toBeVisible()
  await save(page)
  expect((await readSidecar(page)).views?.Deployment.elements?.liveApi).toEqual(retained)
  await reopen(page)
  await expect(node(page, 'liveApi')).toBeVisible()
  await save(page)
  expect((await readSidecar(page)).views?.Deployment.elements?.liveApi).toEqual(retained)
})

test('context relationship restores a hidden actor through real save/reopen', async ({ page }) => {
  await seed(page, `workspace "Preview" {
    model {
      user = person "User"
      payments = softwareSystem "Payments"
    }
    views {
      systemLandscape "Landscape" {
        include *
      }
      systemContext payments "Context" {
        include payments
      }
    }
  }`, { version: 1, views: { Context: { elements: { user: retained } } } })
  const helper = new WorkspaceHelper(page)
  await helper.waitForCanvasSettled()
  await helper.connectNodes('User', 'Payments')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: 'Switch view' }).click()
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await expect(node(page, 'user')).toBeVisible()
  await save(page)
  expect((await readSidecar(page)).views?.Context.elements?.user).toEqual(retained)
  await reopen(page)
  await page.getByRole('button', { name: 'Switch view' }).click()
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await expect(node(page, 'user')).toBeVisible()
  await save(page)
  expect((await readSidecar(page)).views?.Context.elements?.user).toEqual(retained)
})
