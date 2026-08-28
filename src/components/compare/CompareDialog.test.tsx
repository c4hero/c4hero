import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CompareDialog from './CompareDialog'
import { useWorkspaceStore } from '@/store/workspace'
import { openComparisonFile } from '@/lib/fileIO'
import { parseDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

vi.mock('@/lib/fileIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fileIO')>()),
  openComparisonFile: vi.fn(),
}))

const openMock = vi.mocked(openComparisonFile)

const V1 = `
workspace "Shop" {
  model {
    cust = person "Customer" "Buys things"
    shop = softwareSystem "Shop" "The store" {
      web = container "Web App" "Storefront UI" "React"
    }
    cust -> web "Browses"
  }
  views {
    container shop "Containers" { include * }
  }
}`

function state() {
  return useWorkspaceStore.getState()
}

/** The `V1` DSL above, as the in-memory model the store would hold. */
function headWorkspace(): Workspace {
  return {
    name: 'Shop',
    model: {
      people: [{ id: 'cust', type: 'person', name: 'Customer', description: 'Buys things', tags: [], properties: {} }],
      softwareSystems: [{
        id: 'shop', type: 'softwareSystem', name: 'Shop', description: 'The store', tags: [], properties: {},
        containers: [{
          id: 'web', type: 'container', name: 'Web App', description: 'Storefront UI',
          technology: 'React', tags: [], properties: {}, components: [],
        }],
      }],
      relationships: [{ id: 'r1', sourceId: 'cust', destinationId: 'web', description: 'Browses', tags: [], properties: {} }],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [{
        type: 'container', key: 'Containers', title: 'Containers', softwareSystemId: 'shop',
        elements: [{ id: 'web' }, { id: 'cust' }], relationships: [{ id: 'r1' }],
      }],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('CompareDialog', () => {
  beforeEach(() => {
    openMock.mockReset()
    state().loadWorkspace(headWorkspace())
  })

  it('offers to pick a revision when nothing is being compared', () => {
    render(<CompareDialog />)
    expect(screen.getByRole('button', { name: /Choose a .dsl file/i })).toBeTruthy()
  })

  it('parses the picked revision and starts the comparison', async () => {
    // Compare the parsed DSL against itself — the round-trip a user gets when
    // they pick the file they are already editing.
    state().loadWorkspace(parseDSL(V1).workspace)
    openMock.mockResolvedValue({ content: V1, name: 'v1.dsl' })
    render(<CompareDialog />)
    fireEvent.click(screen.getByRole('button', { name: /Choose a .dsl file/i }))

    await waitFor(() => expect(state().comparisonLabel).toBe('v1.dsl'))
    expect(state().comparisonBase!.model.people[0].name).toBe('Customer')
    await screen.findByText(/These two revisions describe the same model/i)
  })

  it('leaves the comparison alone when the picker is cancelled', async () => {
    openMock.mockResolvedValue(null)
    render(<CompareDialog />)
    fireEvent.click(screen.getByRole('button', { name: /Choose a .dsl file/i }))
    await waitFor(() => expect(openMock).toHaveBeenCalled())
    expect(state().comparisonBase).toBeNull()
  })

  it('reports a file it cannot read instead of comparing against nothing', async () => {
    openMock.mockResolvedValue({ content: 'this is not a workspace {{{', name: 'broken.dsl' })
    render(<CompareDialog />)
    fireEvent.click(screen.getByRole('button', { name: /Choose a .dsl file/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/broken\.dsl/)
    expect(state().comparisonBase).toBeNull()
  })

  it('lists added, removed and changed items against the picked revision', async () => {
    const base = headWorkspace()
    // Head gains a container, drops the person, and re-techs the web app.
    const head = headWorkspace()
    head.model.people = []
    head.model.relationships = []
    head.model.softwareSystems[0].containers[0].technology = 'Svelte'
    head.model.softwareSystems[0].containers.push({
      id: 'api', type: 'container', name: 'API', tags: [], properties: {}, components: [],
    })
    head.views.containerViews[0].elements = [{ id: 'web' }, { id: 'api' }]
    head.views.containerViews[0].relationships = []
    state().loadWorkspace(head)
    state().startComparison(base, 'v1.dsl')

    render(<CompareDialog />)

    const elements = screen.getByRole('region', { name: 'Elements' })
    expect(within(elements).getByText('Shop / API')).toBeTruthy()
    expect(within(elements).getByText('Customer')).toBeTruthy()
    expect(within(elements).getByText('React')).toBeTruthy()
    expect(within(elements).getByText('Svelte')).toBeTruthy()

    const relationships = screen.getByRole('region', { name: 'Relationships' })
    expect(within(relationships).getByText(/Customer/)).toBeTruthy()

    expect(screen.getByRole('region', { name: 'Views' })).toBeTruthy()
  })

  it('jumps to an element that still exists and closes on the way', () => {
    const base = headWorkspace()
    base.model.softwareSystems[0].containers[0].technology = 'Vue'
    state().startComparison(base, 'v1.dsl')
    render(<CompareDialog />)

    fireEvent.click(screen.getByRole('button', { name: /Show Web App on the canvas/i }))
    expect(state().selectedElementIds).toEqual(['web'])
    expect(state().comparisonPanelOpen).toBe(false)
  })

  it('does not offer a jump for an element the current revision no longer has', () => {
    const base = headWorkspace()
    base.model.softwareSystems[0].containers.push({
      id: 'legacy', type: 'container', name: 'Legacy Batch', tags: [], properties: {}, components: [],
    })
    state().startComparison(base, 'v1.dsl')
    render(<CompareDialog />)

    expect(screen.getByText('Shop / Legacy Batch')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Show Legacy Batch on the canvas/i })).toBeNull()
  })

  it('toggles the canvas overlay from the footer', () => {
    state().startComparison(headWorkspace(), 'v1.dsl')
    render(<CompareDialog />)

    fireEvent.click(screen.getByRole('button', { name: /Canvas highlight on/i }))
    expect(state().comparisonOverlay).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Canvas highlight off/i }))
    expect(state().comparisonOverlay).toBe(true)
  })

  it('stops comparing from the footer', () => {
    state().startComparison(headWorkspace(), 'v1.dsl')
    render(<CompareDialog />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing' }))
    expect(state().comparisonBase).toBeNull()
  })

  it('closes on Escape without dropping the comparison', () => {
    state().startComparison(headWorkspace(), 'v1.dsl')
    render(<CompareDialog />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(state().comparisonPanelOpen).toBe(false)
    expect(state().comparisonBase).not.toBeNull()
  })

  it('tracks edits made while the panel is open', async () => {
    state().startComparison(headWorkspace(), 'v1.dsl')
    const { rerender } = render(<CompareDialog />)
    expect(screen.getByText(/These two revisions describe the same model/i)).toBeTruthy()

    state().addPerson('Ops Engineer')
    rerender(<CompareDialog />)

    await waitFor(() => expect(screen.getByRole('region', { name: 'Elements' })).toBeTruthy())
    expect(screen.getByText('Ops Engineer')).toBeTruthy()
  })
})
