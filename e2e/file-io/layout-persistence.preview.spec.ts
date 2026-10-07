import { test, expect, type Page } from '@playwright/test'
import { WorkspaceHelper } from '../fixtures/workspace'
import type { SidecarData } from '../../src/lib/sidecar'

// Runs against the production build without dev-only store hooks. Only the
// chooser is replaced: every handle, write, close, and reopen uses Chromium's
// real origin-private filesystem (OPFS), including persistence across reloads.
const folder = 'layout-preview'
const retained = { pinned: true, locked: true, x: 800, y: 450 }
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)

async function seed(page: Page, dsl: string, sidecar: SidecarData) {
  await page.addInitScript((folderName) => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('c4hero.json', JSON.stringify({ canvasGuideDismissed: true }))
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle(folderName),
    })
  }, folder)
  await page.goto('/')
  await page.evaluate(async ({ folderName, text, data }) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true })
    for (const [name, content] of [['preview.dsl', text], ['preview.c4hero.json', JSON.stringify(data)]]) {
      const file = await dir.getFileHandle(name, { create: true })
      const writable = await file.createWritable()
      await writable.write(content)
      await writable.close()
    }
  }, { folderName: folder, text: dsl, data: sidecar })
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
