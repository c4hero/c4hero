import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ImpactDialog from './ImpactDialog'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'

function state() {
  return useWorkspaceStore.getState()
}

/**
 *   Customer -> Web App -> Database
 *   Ops      -> Web App
 *
 * Web App and Database live in the Shop system; the container view is scoped
 * to Shop, and there is a component view scoped to Web App.
 */
function makeWorkspace(): Workspace {
  return {
    name: 'Shop',
    model: {
      people: [
        { id: 'cust', type: 'person', name: 'Customer', tags: [], properties: {} },
        { id: 'ops', type: 'person', name: 'Ops', tags: [], properties: {} },
      ],
      softwareSystems: [{
        id: 'shop', type: 'softwareSystem', name: 'Shop', tags: [], properties: {},
        containers: [
          {
            id: 'web', type: 'container', name: 'Web App', tags: [], properties: {},
            components: [{ id: 'router', type: 'component', name: 'Router', tags: [], properties: {} }],
          },
          { id: 'db', type: 'container', name: 'Database', tags: [], properties: {}, components: [] },
        ],
      }],
      relationships: [
        { id: 'r1', sourceId: 'cust', destinationId: 'web', description: 'Browses', tags: [], properties: {} },
        { id: 'r2', sourceId: 'web', destinationId: 'db', description: 'Reads from', tags: [], properties: {} },
        { id: 'r3', sourceId: 'ops', destinationId: 'web', description: 'Operates', tags: [], properties: {} },
      ],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [{
        type: 'container', key: 'containers', title: 'Shop containers', softwareSystemId: 'shop',
        elements: [{ id: 'web' }, { id: 'db' }], relationships: [{ id: 'r2' }],
      }],
      componentViews: [{
        type: 'component', key: 'web-components', title: 'Web App components', containerId: 'web',
        elements: [{ id: 'router' }], relationships: [],
      }],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function section(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('ImpactDialog', () => {
  beforeEach(() => {
    state().loadWorkspace(makeWorkspace())
  })

  it('renders nothing until a target is set', () => {
    const { container } = render(<ImpactDialog />)
    expect(container.firstChild).toBeNull()
  })

  it('leads with a plain-language headline', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)
    expect(screen.getByText(/Removing "Web App" breaks/)).toBeTruthy()
  })

  it('lists the element and everything removed with it', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    const goes = section('Goes away')
    expect(goes.getByText('Shop / Web App')).toBeTruthy()
    expect(goes.getByText('Shop / Web App / Router')).toBeTruthy()
    expect(goes.getByText(/removed with its parent/)).toBeTruthy()
  })

  it('names what breaks directly', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    const breaks = section('Breaks now')
    expect(breaks.getByText('Customer')).toBeTruthy()
    expect(breaks.getByText('Ops')).toBeTruthy()
  })

  it('lists the relationships that go with it', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    const links = section('Relationships removed')
    expect(links.getByText(/Browses/)).toBeTruthy()
    expect(links.getByText(/Reads from/)).toBeTruthy()
  })

  it('warns which views disappear and which just lose elements', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    const views = section('Views affected')
    expect(views.getByText('Web App components')).toBeTruthy()
    expect(views.getByText(/deleted — its scope element is going/)).toBeTruthy()
    expect(views.getByText('Shop containers')).toBeTruthy()
    expect(views.getByText(/loses 1 element/)).toBeTruthy()
  })

  it('flags elements left with nothing attached', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    const orphans = section('Left with nothing attached')
    expect(orphans.getByText('Customer')).toBeTruthy()
    expect(orphans.getByText('Shop / Database')).toBeTruthy()
  })

  it('says plainly when a removal is local', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'lonely', type: 'person', name: 'Lonely', tags: [], properties: {} })
    state().loadWorkspace(ws)
    state().openImpactPanel(['lonely'])
    render(<ImpactDialog />)

    expect(screen.getByText(/Removing "Lonely" affects nothing else/)).toBeTruthy()
    expect(screen.getByText(/is a local change/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Breaks now' })).toBeNull()
  })

  it('selects the blast radius on the canvas and closes', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    fireEvent.click(screen.getByRole('button', { name: /Select affected/ }))
    expect([...state().selectedElementIds].sort()).toEqual(['cust', 'db', 'ops', 'router', 'web'])
    expect(state().impactTargetIds).toBeNull()
  })

  it('hands off to the existing delete confirmation rather than deleting outright', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    fireEvent.click(screen.getByRole('button', { name: /Delete anyway/ }))
    expect(state().impactTargetIds).toBeNull()
    const pending = state().pendingDelete!
    expect(pending).toBeTruthy()
    expect(pending.message).toContain('Web App')
    // Still nothing deleted until the confirmation is accepted.
    expect(state().workspace!.model.softwareSystems[0].containers).toHaveLength(2)

    pending.onConfirm()
    expect(state().workspace!.model.softwareSystems[0].containers.map((c) => c.id)).toEqual(['db'])
  })

  it('closes without touching the model', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(state().impactTargetIds).toBeNull()
    expect(state().workspace!.model.softwareSystems[0].containers).toHaveLength(2)
  })

  it('closes on Escape', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(state().impactTargetIds).toBeNull()
  })

  it('analyses several targets at once', () => {
    state().openImpactPanel(['web', 'db'])
    render(<ImpactDialog />)

    expect(screen.getByText(/Removing 2 elements breaks/)).toBeTruthy()
    const goes = section('Goes away')
    expect(goes.getByText('Shop / Web App')).toBeTruthy()
    expect(goes.getByText('Shop / Database')).toBeTruthy()
  })

  it('keeps analysing the elements it opened with, not the live selection', () => {
    state().openImpactPanel(['web'])
    render(<ImpactDialog />)
    state().selectElements(['db'])

    expect(screen.getByText(/Removing "Web App"/)).toBeTruthy()
  })
})
