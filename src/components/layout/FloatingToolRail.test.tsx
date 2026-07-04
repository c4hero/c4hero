import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useAiSettingsStore } from '@/store/ai-settings'
import { fitContentNodesToViewport } from '@/lib/fitViewport'
import type { Workspace } from '@/types/model'
import FloatingToolRail from './FloatingToolRail'

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ getNodes: () => [], setViewport: () => {} }),
}))

vi.mock('@/lib/fitViewport', () => ({
  fitContentNodesToViewport: vi.fn(),
}))

vi.mock('@/components/settings/CanvasSettingsDialog', () => ({
  default: () => <div data-testid="canvas-settings-dialog" />,
}))

function makeWs(systemCount = 2): Workspace {
  const systems = Array.from({ length: systemCount }, (_, i) => ({
    id: `sys${i}`,
    type: 'softwareSystem' as const,
    name: `System ${i}`,
    // No description → each system is one "missing info" gap
    tags: ['Element', 'Software System'],
    properties: {},
    containers: [],
  }))
  return {
    name: 'Test',
    model: { people: [], softwareSystems: systems, relationships: [], groups: [] },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'land',
        elements: systems.map((s) => ({ id: s.id })), relationships: [],
      }],
      systemContextViews: [], containerViews: [], componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function setAiKey(key: string) {
  const s = useAiSettingsStore.getState()
  useAiSettingsStore.setState({
    enabled: true,
    provider: 'anthropic',
    apiKeys: { ...s.apiKeys, anthropic: key },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.setState({
    addElementPanelOpen: false,
    canvasSettingsOpen: false,
    multiSelectMode: false,
    aiPanelOpen: false,
    aiSettingsOpen: false,
  })
  setAiKey('')
})

describe('FloatingToolRail', () => {
  it('renders nothing without a workspace', () => {
    const { container } = render(<FloatingToolRail />)
    expect(container.firstChild).toBeNull()
  })

  it('AI button toggles the assistant panel open and closed', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    const btn = screen.getByRole('button', { name: 'AI assistant' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(true)

    fireEvent.click(btn)
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(false)
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(false)
  })

  it('AI button also dismisses a settings-opened panel', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ aiSettingsOpen: true })
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: /AI assistant/ }))
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(false)
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(false)
  })

  it('shows a pending-fixes badge scoped to the current view when AI is ready', () => {
    setAiKey('sk-test')
    useWorkspaceStore.getState().loadWorkspace(makeWs(2))
    render(<FloatingToolRail />)

    // Two systems missing descriptions → 2 gaps
    const btn = screen.getByRole('button', { name: 'AI assistant — 2 pending' })
    expect(btn.textContent).toContain('2')
  })

  it('caps the badge at 9+ and hides it while the panel is open', () => {
    setAiKey('sk-test')
    useWorkspaceStore.getState().loadWorkspace(makeWs(11))
    const { rerender } = render(<FloatingToolRail />)
    expect(screen.getByRole('button', { name: 'AI assistant — 11 pending' }).textContent).toContain('9+')

    useWorkspaceStore.setState({ aiPanelOpen: true })
    rerender(<FloatingToolRail />)
    expect(screen.getByRole('button', { name: 'AI assistant — 11 pending' }).textContent).not.toContain('9+')
  })

  it('shows no badge when AI is not configured', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs(2))
    render(<FloatingToolRail />)
    expect(screen.queryByRole('button', { name: /pending/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'AI assistant' })).toBeTruthy()
  })

  it('Add element toggles the flyout and opening Auto-arrange closes it', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    const addBtn = screen.getByRole('button', { name: 'Add element' })
    fireEvent.click(addBtn)
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)
    expect(document.querySelector('[data-flyout="add-element"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange' }))
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(false)
    expect(screen.getByRole('menu')).toBeTruthy()

    // Toggling the add button back closes the arrange flyout
    fireEvent.click(addBtn)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)
  })

  it('Auto-arrange menu marks the current direction and applies a new one', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange' }))
    // Default direction is TB → "Top to bottom" marked current
    const tb = screen.getByRole('button', { name: /Top to bottom/ })
    expect(tb.textContent).toContain('current')

    fireEvent.click(screen.getByRole('button', { name: /Left to right/ }))
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout?.direction).toBe('LR')
    // Flyout closes and the viewport re-fits after the layout settles
    expect(screen.queryByRole('menu')).toBeNull()
    await waitFor(() => expect(fitContentNodesToViewport).toHaveBeenCalled())
  })

  it('Escape closes an open flyout', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Add element' }))
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(false)
  })

  it('outside pointerdown closes open flyouts', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Auto-arrange' }))
    expect(screen.getByRole('menu')).toBeTruthy()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('pointerdown inside the flyout keeps it open', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Add element' }))
    const flyout = document.querySelector('[data-flyout="add-element"]')!
    fireEvent.pointerDown(flyout)
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)
  })

  it('toggles multi-select mode', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Multi-select (tap multiple nodes)' }))
    expect(useWorkspaceStore.getState().multiSelectMode).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Multi-select: ON (tap to turn off)' }))
    expect(useWorkspaceStore.getState().multiSelectMode).toBe(false)
  })

  it('Zoom to fit calls the viewport fitter', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to fit' }))
    expect(fitContentNodesToViewport).toHaveBeenCalledTimes(1)
  })

  it('Canvas settings opens the settings dialog', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<FloatingToolRail />)

    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }))
    expect(useWorkspaceStore.getState().canvasSettingsOpen).toBe(true)
    expect(screen.getByTestId('canvas-settings-dialog')).toBeTruthy()
  })
})
