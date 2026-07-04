import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import { fitContentNodesToViewport } from '@/lib/fitViewport'
import type { Workspace } from '@/types/model'
import FloatingZoomHud from './FloatingZoomHud'

const rf = vi.hoisted(() => ({
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => rf,
  useViewport: () => ({ x: 0, y: 0, zoom: 1.5 }),
}))

vi.mock('@/lib/fitViewport', () => ({
  fitContentNodesToViewport: vi.fn(),
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: { people: [], softwareSystems: [], relationships: [], groups: [] },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useSettingsStore.setState({ showZoomControls: false })
})

describe('FloatingZoomHud', () => {
  it('returns null when no workspace is loaded, even if zoom controls are enabled', () => {
    useSettingsStore.setState({ showZoomControls: true })
    const { container } = render(<FloatingZoomHud />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when zoom controls are disabled in settings', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<FloatingZoomHud />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the current zoom percentage from the viewport', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ showZoomControls: true })
    render(<FloatingZoomHud />)
    expect(screen.getByText('150%')).toBeTruthy()
  })

  it('zooms out on the minus button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ showZoomControls: true })
    render(<FloatingZoomHud />)
    fireEvent.click(screen.getByLabelText('Zoom out'))
    expect(rf.zoomOut).toHaveBeenCalledWith({ duration: 200 })
  })

  it('zooms in on the plus button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ showZoomControls: true })
    render(<FloatingZoomHud />)
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(rf.zoomIn).toHaveBeenCalledWith({ duration: 200 })
  })

  it('fits content nodes to the viewport on the fit button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ showZoomControls: true })
    render(<FloatingZoomHud />)
    fireEvent.click(screen.getByLabelText('Fit to screen'))
    expect(fitContentNodesToViewport).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fitContentNodesToViewport).mock.calls[0][0]).toBe(rf)
  })
})
