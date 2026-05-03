import { test, expect } from '../fixtures/workspace'

test.describe('Welcome Screen', () => {
  test('renders welcome screen with the current startup actions', async ({ workspace }) => {
    await workspace.goto()
    await expect(workspace.page.getByText('Visual architecture modelling')).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Open collection' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'New collection' })).toBeVisible()
    // Footer slogan was removed in the welcome redesign; the headline carries
    // the diagram-y framing now.
    await expect(workspace.page.getByRole('heading', { name: /Diagram your architecture/ })).toBeVisible()
  })

  test('loads sample workspace and shows canvas', async ({ workspace }) => {
    await workspace.loadSample()
    // Should show the Big Bank canvas with nodes
    const nodeCount = await workspace.getNodeCount()
    expect(nodeCount).toBeGreaterThan(0)
    // Should have the System Landscape view active (check breadcrumb area)
    await expect(workspace.page.locator('.react-flow')).toBeVisible()
  })

  test('loads blank workspace and shows empty canvas', async ({ workspace }) => {
    await workspace.loadBlank()
    const nodeCount = await workspace.getNodeCount()
    expect(nodeCount).toBe(0)
  })

  test('welcome screen shows capability pills for the supported workflow', async ({ workspace }) => {
    await workspace.goto()
    await expect(workspace.page.getByText('.dsl files', { exact: true })).toBeVisible()
    await expect(workspace.page.getByText('Git-friendly')).toBeVisible()
    await expect(workspace.page.getByText('C4 model')).toBeVisible()
    await expect(workspace.page.getByText('Export PNG/SVG')).toBeVisible()
  })

  test('keeps welcome back actions clear of the recent collection count', async ({ page }) => {
    const recentFolders = [
      {
        name: 'platform-architecture',
        path: 'platform-architecture',
        displayName: 'Platform Architecture',
        openedAt: '2026-04-30T12:00:00.000Z',
      },
      {
        name: 'customer-portal',
        path: 'customer-portal',
        displayName: 'Customer Portal',
        openedAt: '2026-04-29T12:00:00.000Z',
      },
    ]

    await page.goto('/')
    await page.evaluate(async (folders) => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem('c4hero_recent_folders', JSON.stringify(folders))

      const opfsRoot = await navigator.storage.getDirectory()
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('c4hero', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('handles')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const handles = await Promise.all(folders.map(async (folder) => ({
        name: folder.name,
        handle: await opfsRoot.getDirectoryHandle(folder.name, { create: true }),
      })))

      const tx = db.transaction('handles', 'readwrite')
      const store = tx.objectStore('handles')
      for (const { name, handle } of handles) {
        store.put(handle, `folder:${name}`)
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      db.close()
    }, recentFolders)

    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
    const newCollection = page.getByRole('button', { name: 'New collection' })
    const openCollection = page.getByRole('button', { name: 'Open collection' })
    const collectionCount = page.getByText('2 collections')

    await expect(newCollection).toBeVisible()
    await expect(openCollection).toBeVisible()
    await expect(collectionCount).toBeVisible()

    const [newBox, openBox, countBox] = await Promise.all([
      newCollection.boundingBox(),
      openCollection.boundingBox(),
      collectionCount.boundingBox(),
    ])

    expect(newBox).not.toBeNull()
    expect(openBox).not.toBeNull()
    expect(countBox).not.toBeNull()
    expect(newBox!.y + newBox!.height).toBeLessThan(countBox!.y)
    expect(openBox!.y + openBox!.height).toBeLessThan(countBox!.y)
  })
})
