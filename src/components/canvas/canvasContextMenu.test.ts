import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommands } from '@/lib/commands'
import { createBigBankSample } from '@/lib/templates'
import { getActiveView, useWorkspaceStore } from '@/store/workspace'
import { canvasMenuSections, menuTargetFor, selectForMenu, type CanvasMenuTarget } from './canvasContextMenu'

const zoomInto = vi.fn()
const sectionsFor = (target: CanvasMenuTarget, canZoomInto = (id: string) => id === 'internetBanking') => {
  selectForMenu(target)
  return canvasMenuSections(target, { commands: getCommands(null), canZoomInto, zoomInto })
}
const ids = (sections: ReturnType<typeof sectionsFor>) => sections.map(items => items.map(item => item.id))
const item = (sections: ReturnType<typeof sectionsFor>, id: string) => sections.flat().find(i => i.id === id)!
const view = () => { const s = useWorkspaceStore.getState(); return getActiveView(s.workspace!, s.activeViewKey!)! }

beforeEach(() => {
  zoomInto.mockClear()
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.getState().loadWorkspace(createBigBankSample())
  useWorkspaceStore.getState().setActiveView('SystemLandscape')
  useWorkspaceStore.getState().clearSelection()
})

describe('menuTargetFor', () => {
  const lookup = { isElement: (id: string) => id === 'customer', relationshipOf: (id: string) => (id === 'edge-r1' ? 'r1' : undefined) }
  const dom = (html: string) => { document.body.innerHTML = `<div class="react-flow">${html}</div>`; return document.querySelector('#hit')! }

  it('finds elements, relationships and their labels, and treats the rest as the canvas', () => {
    expect(menuTargetFor(dom('<div class="react-flow__node" data-id="customer"><span id="hit"></span></div>'), lookup)).toEqual({ kind: 'element', id: 'customer' })
    expect(menuTargetFor(dom('<div class="react-flow__node" data-id="group-x"><span id="hit"></span></div>'), lookup)).toEqual({ kind: 'canvas' })
    expect(menuTargetFor(dom('<svg><g class="react-flow__edge" data-id="edge-r1"><path id="hit"></path></g></svg>'), lookup)).toEqual({ kind: 'relationship', id: 'r1' })
    expect(menuTargetFor(dom('<div data-relationship-label="edge-r1"><span id="hit"></span></div>'), lookup)).toEqual({ kind: 'relationship', id: 'r1' })
    expect(menuTargetFor(dom('<div class="react-flow__pane" id="hit"></div>'), lookup)).toEqual({ kind: 'canvas' })
  })
})

describe('canvasMenuSections', () => {
  it('offers canvas actions on empty canvas without changing the selection', () => {
    useWorkspaceStore.getState().selectElements(['customer'])
    const sections = sectionsFor({ kind: 'canvas' })
    expect(ids(sections)).toEqual([['add-element'], ['select-all', 'zoom-to-fit', 'auto-arrange']])
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['customer'])
    item(sections, 'add-element').run()
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)
  })

  it('selects an unselected element and offers its actions', () => {
    useWorkspaceStore.getState().selectElements(['customer'])
    const sections = sectionsFor({ kind: 'element', id: 'internetBanking' })
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['internetBanking'])
    expect(ids(sections)).toEqual([
      ['zoom-into'],
      ['duplicate-selected', 'lock', 'impact-of-removal'],
      ['remove-from-view', 'delete-from-model'],
    ])
    expect(item(sections, 'delete-from-model').danger).toBe(true)
    item(sections, 'zoom-into').run()
    expect(zoomInto).toHaveBeenCalledWith('internetBanking')
  })

  it('keeps a multi-selection when right clicking inside it, and acts on all of it', () => {
    useWorkspaceStore.getState().selectElements(['customer', 'internetBanking'])
    const sections = sectionsFor({ kind: 'element', id: 'customer' })
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['customer', 'internetBanking'])
    expect(ids(sections)[0]).toEqual(['duplicate-selected', 'group-selected', 'lock', 'impact-of-removal'])

    item(sections, 'lock').run()
    expect(view().elements.filter(e => e.locked).map(e => e.id).sort()).toEqual(['customer', 'internetBanking'])
    expect(ids(sectionsFor({ kind: 'element', id: 'customer' }))[0]).toContain('unlock')

    item(sections, 'remove-from-view').run()
    expect(view().elements.map(e => e.id)).not.toContain('customer')
    expect(view().elements.map(e => e.id)).not.toContain('internetBanking')
  })

  it('asks before deleting from the model, like Shift+Delete', () => {
    const sections = sectionsFor({ kind: 'element', id: 'customer' })
    item(sections, 'delete-from-model').run()
    expect(useWorkspaceStore.getState().pendingDelete).toBeTruthy()
  })

  it('offers relationship actions and selects the relationship', () => {
    const sections = sectionsFor({ kind: 'relationship', id: 'r1' })
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBe('r1')
    expect(ids(sections)).toEqual([['remove-selected-from-view', 'delete-selected']])
    expect(sections[0].map(i => i.label)).toEqual(['Remove from view', 'Delete from model'])
  })

  it('only offers looking around in presentation mode', () => {
    useWorkspaceStore.getState().setPresentationMode(true)
    expect(ids(sectionsFor({ kind: 'canvas' }))).toEqual([['zoom-to-fit']])
    expect(ids(sectionsFor({ kind: 'element', id: 'internetBanking' }))).toEqual([['zoom-into']])
    expect(sectionsFor({ kind: 'relationship', id: 'r1' })).toEqual([])
  })
})
