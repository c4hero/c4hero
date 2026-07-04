import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCommands, CATEGORY_ORDER, CATEGORY_LABELS, type Command } from './commands'
import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import { saveDSLFile, writeSidecarToHandle } from '@/lib/fileIO'
import { downloadFile, downloadBlob, exportCanvasAsPNG, exportCanvasAsSVG } from '@/lib/exportUtils'
import type { ReactFlowInstance } from '@xyflow/react'
import type { Workspace } from '@/types/model'

vi.mock('@/lib/fileIO', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fileIO')>()
  return {
    ...actual,
    saveDSLFile: vi.fn().mockResolvedValue(true),
    writeSidecarToHandle: vi.fn().mockResolvedValue(true),
  }
})

vi.mock('@/lib/exportUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportUtils')>()
  return {
    ...actual,
    downloadFile: vi.fn(),
    downloadBlob: vi.fn(),
    exportCanvasAsPNG: vi.fn(),
    exportCanvasAsSVG: vi.fn(),
  }
})

function makeWorkspace(): Workspace {
  return {
    name: 'Commands Test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [
        {
          id: 'api',
          type: 'softwareSystem',
          name: 'API',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [
            {
              id: 'web',
              type: 'container',
              name: 'Web',
              tags: ['Element', 'Container'],
              properties: {},
              components: [
                { id: 'comp1', type: 'component', name: 'Comp', tags: ['Element', 'Component'], properties: {} },
              ],
            },
          ],
        },
      ],
      relationships: [
        { id: 'r1', sourceId: 'alice', destinationId: 'api', tags: ['Relationship'], properties: {} },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'landscape',
          title: 'Landscape',
          elements: [{ id: 'alice', x: 0, y: 0, pinned: true }, { id: 'api', x: 300, y: 0 }],
          relationships: [{ id: 'r1' }],
        },
      ],
      systemContextViews: [],
      containerViews: [
        {
          type: 'container',
          key: 'containers',
          softwareSystemId: 'api',
          elements: [{ id: 'api' }, { id: 'web' }],
          relationships: [],
        },
      ],
      componentViews: [
        {
          type: 'component',
          key: 'components',
          containerId: 'web',
          elements: [{ id: 'comp1' }],
          relationships: [],
        },
      ],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function store() {
  return useWorkspaceStore.getState()
}

function command(id: string, reactFlow: ReactFlowInstance | null = null): Command {
  const found = getCommands(reactFlow).find((c) => c.id === id)
  if (!found) throw new Error(`command not found: ${id}`)
  return found
}

beforeEach(() => {
  store().loadWorkspace(makeWorkspace())
  useWorkspaceStore.setState({
    searchOpen: false,
    commandPaletteOpen: false,
    canvasSettingsOpen: false,
    canvasGuideOpen: false,
    viewsPanelOpen: false,
    createViewDialogOpen: false,
    highlighterOpenFacet: null,
    presentationMode: false,
    minimapEnabled: true,
    snapToGrid: false,
    multiSelectMode: false,
  })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Create commands ─────────────────────────────────────────────────

describe('create commands', () => {
  it('add-person is enabled on a landscape view and adds a person to the model', () => {
    const cmd = command('add-person')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    const people = store().workspace!.model.people
    expect(people).toHaveLength(2)
    expect(people[1].name).toBe('New Person')
  })

  it('add-system adds a software system', () => {
    const cmd = command('add-system')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    expect(store().workspace!.model.softwareSystems).toHaveLength(2)
  })

  it('add-container is disabled on a landscape view and enabled on a container view', () => {
    expect(command('add-container').when!()).toBe(false)
    store().setActiveView('containers')
    const cmd = command('add-container')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    const api = store().workspace!.model.softwareSystems.find((s) => s.id === 'api')!
    expect(api.containers.some((c) => c.name === 'New Container')).toBe(true)
  })

  it('add-component is disabled on a landscape view and enabled on a component view', () => {
    expect(command('add-component').when!()).toBe(false)
    store().setActiveView('components')
    const cmd = command('add-component')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    const web = store().workspace!.model.softwareSystems[0].containers[0]
    expect(web.components.some((c) => c.name === 'New Component')).toBe(true)
  })

  it('group-selected requires at least two selected elements and creates a group', () => {
    expect(command('group-selected').when!()).toBe(false)
    store().selectElements(['alice', 'api'])
    const cmd = command('group-selected')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    const groups = store().workspace!.model.groups
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('New Group')
    expect(groups[0].elementIds).toEqual(['alice', 'api'])
  })
})

// ─── Edit commands ───────────────────────────────────────────────────

describe('edit commands', () => {
  it('undo and redo round-trip a model change', () => {
    expect(command('undo').when!()).toBe(false)
    expect(command('redo').when!()).toBe(false)

    store().addPerson('Bob')
    expect(command('undo').when!()).toBe(true)
    command('undo').execute()
    expect(store().workspace!.model.people).toHaveLength(1)

    expect(command('redo').when!()).toBe(true)
    command('redo').execute()
    expect(store().workspace!.model.people).toHaveLength(2)
  })

  it('duplicate-selected duplicates the current selection', () => {
    expect(command('duplicate-selected').when!()).toBe(false)
    store().selectElements(['alice'])
    const cmd = command('duplicate-selected')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    expect(store().workspace!.model.people).toHaveLength(2)
  })

  it('delete-selected asks for confirmation then deletes a selected relationship', () => {
    store().selectRelationship('r1')
    const cmd = command('delete-selected')
    expect(cmd.when!()).toBe(true)
    cmd.execute()

    const pending = store().pendingDelete
    expect(pending).not.toBeNull()
    expect(pending!.message).toBe('Delete this relationship?')
    pending!.onConfirm()
    expect(store().workspace!.model.relationships).toHaveLength(0)
  })

  it('delete-selected asks for confirmation with impact then deletes elements', () => {
    store().selectElements(['alice'])
    command('delete-selected').execute()

    const pending = store().pendingDelete
    expect(pending).not.toBeNull()
    expect(pending!.impact).toBeDefined()
    pending!.onConfirm()
    expect(store().workspace!.model.people).toHaveLength(0)
  })

  it('delete-selected ignores the focal scope element of the active view', () => {
    store().setActiveView('containers')
    store().selectElements(['api']) // focal system of the container view
    command('delete-selected').execute()
    expect(store().pendingDelete).toBeNull()
    expect(store().workspace!.model.softwareSystems).toHaveLength(1)
  })

  it('select-all selects every element of the active view', () => {
    const cmd = command('select-all')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    expect(store().selectedElementIds).toEqual(['alice', 'api'])
  })

  it('select-all is disabled without a workspace', () => {
    store().closeWorkspace()
    expect(command('select-all').when!()).toBe(false)
  })

  it('toggle-multi-select flips multi-select mode', () => {
    expect(store().multiSelectMode).toBe(false)
    command('toggle-multi-select').execute()
    expect(store().multiSelectMode).toBe(true)
    command('toggle-multi-select').execute()
    expect(store().multiSelectMode).toBe(false)
  })
})

// ─── View commands ───────────────────────────────────────────────────

describe('view commands', () => {
  it('zoom-in and zoom-out delegate to the React Flow instance', () => {
    const zoomIn = vi.fn()
    const zoomOut = vi.fn()
    const rf = { zoomIn, zoomOut } as unknown as ReactFlowInstance
    command('zoom-in', rf).execute()
    command('zoom-out', rf).execute()
    expect(zoomIn).toHaveBeenCalledWith({ duration: 200 })
    expect(zoomOut).toHaveBeenCalledWith({ duration: 200 })
  })

  it('zoom commands are safe without a React Flow instance', () => {
    expect(() => command('zoom-in').execute()).not.toThrow()
    expect(() => command('zoom-out').execute()).not.toThrow()
    expect(() => command('zoom-to-fit').execute()).not.toThrow()
  })

  it('zoom-to-fit reads nodes from the React Flow instance', () => {
    const getNodes = vi.fn(() => [])
    const rf = { getNodes, setViewport: vi.fn() } as unknown as ReactFlowInstance
    command('zoom-to-fit', rf).execute()
    expect(getNodes).toHaveBeenCalled()
  })

  it('auto-arrange relayouts the active view', () => {
    vi.useFakeTimers()
    try {
      const cmd = command('auto-arrange')
      expect(cmd.when!()).toBe(true)
      cmd.execute()
      vi.runAllTimers()
      expect(store().activeViewKey).toBe('landscape')
    } finally {
      vi.useRealTimers()
    }
  })

  it('auto-arrange is disabled without an active view', () => {
    store().closeWorkspace()
    expect(command('auto-arrange').when!()).toBe(false)
  })

  it('toggle-highlighter opens and closes the highlighter facet', () => {
    command('toggle-highlighter').execute()
    expect(store().highlighterOpenFacet).toBe('tags')
    command('toggle-highlighter').execute()
    expect(store().highlighterOpenFacet).toBeNull()
  })

  it('restore-cleared-highlight-filters restores the stashed filters', () => {
    expect(command('restore-cleared-highlight-filters').when!()).toBe(false)
    useWorkspaceStore.setState({
      lastClearedHighlightFilters: {
        activeTagFilter: ['Web'],
        activeStatusFilter: [],
        activeTechFilter: [],
        activeTeamFilter: [],
      },
    })
    const cmd = command('restore-cleared-highlight-filters')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    expect(store().activeTagFilter).toEqual(['Web'])
    expect(store().lastClearedHighlightFilters).toBeNull()
  })

  it('toggle-views-panel flips the views panel', () => {
    command('toggle-views-panel').execute()
    expect(store().viewsPanelOpen).toBe(true)
  })

  it('new-view opens the create view dialog', () => {
    command('new-view').execute()
    expect(store().createViewDialogOpen).toBe(true)
  })

  it('duplicate-view duplicates the active view', () => {
    const before = getAllViews(store().workspace!).length
    const cmd = command('duplicate-view')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    expect(getAllViews(store().workspace!).length).toBe(before + 1)
  })

  it('toggle-minimap and toggle-snap-to-grid flip their settings', () => {
    command('toggle-minimap').execute()
    expect(store().minimapEnabled).toBe(false)
    command('toggle-snap-to-grid').execute()
    expect(store().snapToGrid).toBe(true)
  })

  it('presentation-mode toggles presentation mode', () => {
    command('presentation-mode').execute()
    expect(store().presentationMode).toBe(true)
    command('presentation-mode').execute()
    expect(store().presentationMode).toBe(false)
  })

  it('canvas-settings and canvas-guide open their dialogs', () => {
    command('canvas-settings').execute()
    expect(store().canvasSettingsOpen).toBe(true)
    command('canvas-guide').execute()
    expect(store().canvasGuideOpen).toBe(true)
  })
})

// ─── Navigation commands ─────────────────────────────────────────────

describe('navigation commands', () => {
  it('open-search opens the search panel', () => {
    command('open-search').execute()
    expect(store().searchOpen).toBe(true)
  })

  it('navigate-back pops the view history', () => {
    expect(command('navigate-back').when!()).toBe(false)
    useWorkspaceStore.setState({ viewHistory: ['containers'] })
    const cmd = command('navigate-back')
    expect(cmd.when!()).toBe(true)
    cmd.execute()
    expect(store().activeViewKey).toBe('containers')
    expect(store().viewHistory).toEqual([])
  })

  it('close-workspace clears the workspace', () => {
    command('close-workspace').execute()
    expect(store().workspace).toBeNull()
  })

  it('creates a Go to command per view that switches the active view', () => {
    const commands = getCommands(null)
    const viewCommands = commands.filter((c) => c.id.startsWith('view-'))
    expect(viewCommands.map((c) => c.id).sort()).toEqual(['view-components', 'view-containers', 'view-landscape'])
    expect(viewCommands.find((c) => c.id === 'view-landscape')!.label).toBe('Go to: Landscape')

    // The active view's command is hidden; others are shown.
    expect(command('view-landscape').when!()).toBe(false)
    const goContainers = command('view-containers')
    expect(goContainers.when!()).toBe(true)
    goContainers.execute()
    expect(store().activeViewKey).toBe('containers')
  })

  it('omits view navigation commands when no workspace is open', () => {
    store().closeWorkspace()
    expect(getCommands(null).some((c) => c.id.startsWith('view-'))).toBe(false)
  })
})

// ─── Export commands ─────────────────────────────────────────────────

describe('export commands', () => {
  it('save serializes the workspace and writes the sidecar', async () => {
    await command('save').execute()
    expect(saveDSLFile).toHaveBeenCalledOnce()
    const [dsl, filename] = vi.mocked(saveDSLFile).mock.calls[0]
    expect(dsl).toContain('Commands Test')
    expect(filename).toBe('Commands Test.dsl')
    // The landscape view has a pinned element, so a sidecar exists.
    expect(writeSidecarToHandle).toHaveBeenCalledOnce()
    expect(vi.mocked(writeSidecarToHandle).mock.calls[0][0]).toContain('"pinned": true')
  })

  it('save does nothing without a workspace', async () => {
    store().closeWorkspace()
    await command('save').execute()
    expect(saveDSLFile).not.toHaveBeenCalled()
  })

  it('export-dsl saves the serialized DSL', async () => {
    await command('export-dsl').execute()
    expect(saveDSLFile).toHaveBeenCalledOnce()
    expect(vi.mocked(saveDSLFile).mock.calls[0][1]).toBe('Commands Test.dsl')
  })

  it('export-png downloads the rendered blob', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    vi.mocked(exportCanvasAsPNG).mockResolvedValue(blob)
    await command('export-png').execute()
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'Commands Test.png')
  })

  it('export-png skips the download when rendering fails', async () => {
    vi.mocked(exportCanvasAsPNG).mockResolvedValue(null)
    await command('export-png').execute()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('export-svg downloads the SVG markup', async () => {
    vi.mocked(exportCanvasAsSVG).mockReturnValue('<svg/>')
    await command('export-svg').execute()
    expect(downloadFile).toHaveBeenCalledWith('<svg/>', 'Commands Test.svg', 'image/svg+xml')
  })

  it('export-svg skips the download when there is no canvas', async () => {
    vi.mocked(exportCanvasAsSVG).mockReturnValue(null)
    await command('export-svg').execute()
    expect(downloadFile).not.toHaveBeenCalled()
  })
})

// ─── AI commands ─────────────────────────────────────────────────────

describe('AI commands', () => {
  it.each([
    ['ai-compose', 'compose'],
    ['ai-interview', 'interview'],
    ['ai-review', 'review'],
    ['ai-adr', 'adr'],
  ] as const)('%s opens the AI panel with the %s feature', (id, feature) => {
    command(id).execute()
    expect(store().aiPanelOpen).toBe(true)
    expect(store().aiPanelFeature).toBe(feature)
  })

  it('ai-interview and ai-review require a workspace', () => {
    expect(command('ai-interview').when!()).toBe(true)
    expect(command('ai-review').when!()).toBe(true)
    store().closeWorkspace()
    expect(command('ai-interview').when!()).toBe(false)
    expect(command('ai-review').when!()).toBe(false)
  })

  it('ai-settings opens the AI settings dialog', () => {
    command('ai-settings').execute()
    expect(store().aiSettingsOpen).toBe(true)
  })
})

// ─── Command metadata ────────────────────────────────────────────────

describe('command metadata', () => {
  it('every command has a unique id and a known category', () => {
    const commands = getCommands(null)
    const ids = commands.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const cmd of commands) {
      expect(CATEGORY_ORDER).toContain(cmd.category)
      expect(cmd.label.length).toBeGreaterThan(0)
    }
  })

  it('CATEGORY_LABELS covers every category in CATEGORY_ORDER', () => {
    for (const category of CATEGORY_ORDER) {
      expect(CATEGORY_LABELS[category]).toBeTruthy()
    }
  })
})
