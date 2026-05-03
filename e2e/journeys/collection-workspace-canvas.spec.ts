import { type Page } from '@playwright/test'
import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'
import { parseDSL } from '../../src/lib/dsl'

type MemoryFsWindow = Window & {
  __c4heroMemoryFs?: {
    getFileContent(path: string): string | null
  }
}

async function installMemoryFileSystem(page: Page) {
  await page.addInitScript(() => {
    type FileRecord = {
      kind: 'file'
      name: string
      content: string
      lastModified: number
    }

    type DirectoryRecord = {
      kind: 'directory'
      name: string
      files: Record<string, FileRecord>
      directories: Record<string, DirectoryRecord>
      getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryRecord>
      getFileHandle(name: string, options?: { create?: boolean }): Promise<{
        kind: 'file'
        name: string
        getFile(): Promise<File>
        createWritable(): Promise<{
          write(data: string | Blob | ArrayBuffer | ArrayBufferView): Promise<void>
          close(): Promise<void>
          abort(): Promise<void>
        }>
      }>
      removeEntry(name: string): Promise<void>
      entries(): AsyncGenerator<[string, FileRecord | DirectoryRecord]>
      queryPermission(): Promise<PermissionState>
      requestPermission(): Promise<PermissionState>
    }

    function notFound(name: string) {
      return new DOMException(`${name} was not found`, 'NotFoundError')
    }

    function makeDirectory(name: string): DirectoryRecord {
      const directory: DirectoryRecord = {
        kind: 'directory',
        name,
        files: {},
        directories: {},

        async getDirectoryHandle(childName, options = {}) {
          const existing = directory.directories[childName]
          if (existing) return existing
          if (!options.create) throw notFound(childName)

          const child = makeDirectory(childName)
          directory.directories[childName] = child
          return child
        },

        async getFileHandle(fileName, options = {}) {
          if (!directory.files[fileName]) {
            if (!options.create) throw notFound(fileName)
            directory.files[fileName] = {
              kind: 'file',
              name: fileName,
              content: '',
              lastModified: Date.now(),
            }
          }

          return {
            kind: 'file' as const,
            name: fileName,
            async getFile() {
              const file = directory.files[fileName]
              return new File([file.content], fileName, {
                type: 'text/plain',
                lastModified: file.lastModified,
              })
            },
            async createWritable() {
              let nextContent = ''
              return {
                async write(data: string | Blob | ArrayBuffer | ArrayBufferView) {
                  if (typeof data === 'string') {
                    nextContent += data
                  } else if (data instanceof Blob) {
                    nextContent += await data.text()
                  } else if (data instanceof ArrayBuffer) {
                    nextContent += new TextDecoder().decode(data)
                  } else {
                    nextContent += new TextDecoder().decode(data)
                  }
                },
                async close() {
                  directory.files[fileName] = {
                    kind: 'file',
                    name: fileName,
                    content: nextContent,
                    lastModified: Date.now(),
                  }
                },
                async abort() {
                  nextContent = ''
                },
              }
            },
          }
        },

        async removeEntry(entryName) {
          if (directory.files[entryName]) {
            delete directory.files[entryName]
            return
          }
          if (directory.directories[entryName]) {
            delete directory.directories[entryName]
            return
          }
          throw notFound(entryName)
        },

        async *entries() {
          for (const child of Object.values(directory.directories)) {
            yield [child.name, child]
          }
          for (const file of Object.values(directory.files)) {
            yield [file.name, file]
          }
        },

        async queryPermission() {
          return 'granted'
        },

        async requestPermission() {
          return 'granted'
        },
      }

      return directory
    }

    const root = makeDirectory('e2e-root')

    function getFileContent(path: string): string | null {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return null

      let current = root
      for (const part of parts.slice(0, -1)) {
        const next = current.directories[part]
        if (!next) return null
        current = next
      }

      const file = current.files[parts[parts.length - 1]]
      return file?.content ?? null
    }

    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => root,
    })

    ;(window as MemoryFsWindow).__c4heroMemoryFs = { getFileContent }
  })
}

async function readMemoryFile(page: Page, path: string) {
  return page.evaluate((filePath) => {
    const fs = (window as MemoryFsWindow).__c4heroMemoryFs
    return fs?.getFileContent(filePath) ?? null
  }, path)
}

function elementNamesById(workspace: ReturnType<typeof parseDSL>['workspace']) {
  const names = new Map<string, string>()
  for (const person of workspace.model.people) names.set(person.id, person.name)
  for (const system of workspace.model.softwareSystems) {
    names.set(system.id, system.name)
    for (const container of system.containers) {
      names.set(container.id, container.name)
      for (const component of container.components) {
        names.set(component.id, component.name)
      }
    }
  }
  return names
}

async function connectByNearestHandles(workspace: WorkspaceHelper, sourceName: string, targetName: string) {
  const sourceNode = workspace.getVisibleNodeByName(sourceName)
  const targetNode = workspace.getVisibleNodeByName(targetName)
  const sourceBox = await sourceNode.boundingBox()
  const targetBox = await targetNode.boundingBox()
  if (!sourceBox || !targetBox) throw new Error(`Could not get boxes for ${sourceName} -> ${targetName}`)

  const sourceCenter = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  }
  const targetCenter = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  }
  const horizontal = Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y)
  const sourceSide = horizontal
    ? targetCenter.x >= sourceCenter.x ? 'right' : 'left'
    : targetCenter.y >= sourceCenter.y ? 'bottom' : 'top'
  const targetSide = horizontal
    ? targetCenter.x >= sourceCenter.x ? 'left' : 'right'
    : targetCenter.y >= sourceCenter.y ? 'top' : 'bottom'

  await sourceNode.hover()
  const sourceHandle = sourceNode.locator(`[data-handleid="${sourceSide}-b-source"]`).first()
  const targetHandle = targetNode.locator(`[data-handleid="${targetSide}-b-target"]`).first()
  await sourceHandle.waitFor({ state: 'attached' })
  await targetHandle.waitFor({ state: 'attached' })

  const sourceHandleBox = await sourceHandle.boundingBox()
  const targetHandleBox = await targetHandle.boundingBox()
  if (!sourceHandleBox || !targetHandleBox) {
    throw new Error(`Could not get handle boxes for ${sourceName} -> ${targetName}`)
  }

  const start = {
    x: sourceHandleBox.x + sourceHandleBox.width / 2,
    y: sourceHandleBox.y + sourceHandleBox.height / 2,
  }
  const end = {
    x: targetHandleBox.x + targetHandleBox.width / 2,
    y: targetHandleBox.y + targetHandleBox.height / 2,
  }
  const before = await workspace.getEdgeCount()

  await workspace.page.mouse.move(start.x, start.y)
  await workspace.page.mouse.down()
  for (let i = 1; i <= 18; i++) {
    await workspace.page.mouse.move(
      start.x + ((end.x - start.x) * i) / 18,
      start.y + ((end.y - start.y) * i) / 18,
    )
  }
  await workspace.page.mouse.up()

  await expect.poll(() => workspace.getEdgeCount(), {
    message: `expected ${sourceName} -> ${targetName} connection to create an edge`,
    timeout: 3000,
  }).toBe(before + 1)
}

test.describe('Collection workspace canvas DSL journey', () => {
  test('creates a collection and workspace, edits the canvas, and autosaves Structurizr-compatible DSL', async ({ workspace }) => {
    const page = workspace.page
    const collectionName = 'C4Hero E2E Collection'
    const collectionSlug = 'c4hero-e2e-collection'
    const workspaceName = 'Checkout Platform'
    const workspaceDescription = 'Customer checkout architecture'
    const dslPath = `${collectionSlug}/checkout-platform.dsl`

    await installMemoryFileSystem(page)
    await workspace.goto()

    await page.getByRole('button', { name: /New collection/ }).click()
    await page.locator('input:not([type="file"])').first().fill(collectionName)
    await page.getByRole('button', { name: /Choose location/ }).click()

    await expect(page).toHaveURL(new RegExp(`/collection/${collectionSlug}$`))
    await expect(page.getByText('No workspaces yet.')).toBeVisible()

    const settingsText = await readMemoryFile(page, `${collectionSlug}/.c4hero/settings.json`)
    if (settingsText === null) throw new Error('Expected collection settings to be written')
    expect(JSON.parse(settingsText) as { name?: string }).toMatchObject({ name: collectionName })

    await page.getByRole('button', { name: /New Workspace/ }).first().click()
    await page.locator('input:not([type="file"]):not([type="checkbox"])').first().fill(workspaceName)
    await page.getByPlaceholder('Briefly describe this workspace...').fill(workspaceDescription)
    await page.getByRole('button', { name: 'Create Workspace' }).click()

    await page.waitForURL(new RegExp(`/collection/${collectionSlug}/checkout-platform$`))
    await page.locator('.react-flow').waitFor({ state: 'visible' })
    await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()

    await workspace.clickNode('New System')
    await workspace.fillEditableField('Element name', workspaceName)
    await workspace.fillEditableField('Description', 'Handles customer checkout traffic')

    await workspace.clickCanvas({ x: 30, y: 180 })
    await page.keyboard.press('Shift+P')
    await workspace.expectInspectorFor('New Person')
    await workspace.fillEditableField('Element name', 'Shopper')
    await workspace.fillEditableField('Description', 'Browses and buys products')

    await workspace.fitView()
    await connectByNearestHandles(workspace, 'Shopper', workspaceName)
    await workspace.selectNewestRelationship()
    await workspace.fillEditableField('Description', 'Places orders')
    await workspace.fillEditableField('Technology', 'HTTPS')

    await workspace.clickCanvas({ x: 30, y: 180 })
    await workspace.createView('Container', 'Checkout Containers', workspaceName)
    await expect(page.getByRole('button', { name: 'Switch view' })).toContainText('Checkout Containers')

    await page.keyboard.press('Shift+C')
    await workspace.expectInspectorFor('New Container')
    await workspace.fillEditableField('Element name', 'Web App')
    await workspace.fillEditableField('Description', 'Serves checkout UI')
    await workspace.fillEditableField('Technology', 'React')

    await workspace.clickCanvas({ x: 30, y: 180 })
    await page.keyboard.press('Shift+C')
    await workspace.expectInspectorFor('New Container')
    await workspace.fillEditableField('Element name', 'Order API')
    await workspace.fillEditableField('Description', 'Processes orders')
    await workspace.fillEditableField('Technology', 'Node.js')

    await workspace.fitView()
    await connectByNearestHandles(workspace, 'Web App', 'Order API')
    await workspace.selectNewestRelationship()
    await workspace.fillEditableField('Description', 'Calls order APIs')
    await workspace.fillEditableField('Technology', 'JSON/HTTPS')

    const snapshot = await workspace.getWorkspace()
    expect(snapshot?.scope).toBe('softwaresystem')
    expect(snapshot?.model.people.map((person) => person.name)).toContain('Shopper')
    expect(snapshot?.model.softwareSystems).toHaveLength(1)
    expect(snapshot?.model.softwareSystems[0]?.name).toBe(workspaceName)
    expect(snapshot?.model.softwareSystems[0]?.containers.map((container) => container.name)).toEqual(
      expect.arrayContaining(['Web App', 'Order API']),
    )

    await page.waitForFunction((path) => {
      const dsl = (window as MemoryFsWindow).__c4heroMemoryFs?.getFileContent(path)
      return Boolean(
        dsl?.includes('person "Shopper" "Browses and buys products"') &&
        dsl.includes('container "Web App" "Serves checkout UI" "React"') &&
        dsl.includes('container "Order API" "Processes orders" "Node.js"') &&
        dsl.includes('"Places orders" "HTTPS"') &&
        dsl.includes('"Calls order APIs" "JSON/HTTPS"'),
      )
    }, dslPath, { timeout: 7000 })

    const dsl = await readMemoryFile(page, dslPath)
    if (dsl === null) throw new Error('Expected workspace DSL to be autosaved')

    expect(dsl).toContain(`workspace "${workspaceName}" "${workspaceDescription}" {`)
    expect(dsl).toContain('title "System Context"')
    expect(dsl).toContain('title "Checkout Containers"')
    expect(dsl).toContain('configuration {')
    expect(dsl).toContain('scope softwaresystem')
    expect(dsl).not.toContain('"SystemContext" "System Context"')
    expect(dsl).not.toMatch(/^\s*(status|owner|lineStyle|interactionStyle)\b/m)

    const { workspace: reparsed, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(reparsed.scope).toBe('softwaresystem')

    const parsedSystem = reparsed.model.softwareSystems.find((system) => system.name === workspaceName)
    if (!parsedSystem) throw new Error('Expected reparsed DSL to include the checkout system')

    expect(parsedSystem.containers.map((container) => ({
      name: container.name,
      description: container.description,
      technology: container.technology,
    }))).toEqual(expect.arrayContaining([
      { name: 'Web App', description: 'Serves checkout UI', technology: 'React' },
      { name: 'Order API', description: 'Processes orders', technology: 'Node.js' },
    ]))

    const namesById = elementNamesById(reparsed)
    const relationships = reparsed.model.relationships.map((relationship) => ({
      source: namesById.get(relationship.sourceId),
      destination: namesById.get(relationship.destinationId),
      description: relationship.description,
      technology: relationship.technology,
    }))
    expect(relationships).toEqual(expect.arrayContaining([
      { source: 'Shopper', destination: workspaceName, description: 'Places orders', technology: 'HTTPS' },
      { source: 'Web App', destination: 'Order API', description: 'Calls order APIs', technology: 'JSON/HTTPS' },
    ]))
  })
})
