import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import WelcomeScreen from './WelcomeScreen'

// Mock lucide-react to avoid SVG issues
vi.mock('lucide-react', () => ({
  FileText: () => null,
  Play: () => null,
  LayoutTemplate: () => null,
  Sparkles: () => null,
  Settings: () => null,
  Upload: () => null,
  Server: () => null,
  Box: () => null,
  Radio: () => null,
  Clock: () => null,
  AlertTriangle: () => null,
}))

// Mock AI dialogs (lazy-loaded)
vi.mock('@/components/ai/AISettingsDialog', () => ({ default: () => null }))
vi.mock('@/components/ai/DescribeSystemDialog', () => ({ default: () => null }))

// Mock AI lib
vi.mock('@/lib/ai', () => ({
  getAIConfig: () => null,
  generateDescription: vi.fn(),
}))

// Mock fileIO — hasFileSystemAccess returns false so saveDSLFile won't be called on blank workspace
vi.mock('@/lib/fileIO', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/fileIO')>()
  return {
    ...mod,
    hasFileSystemAccess: () => false,
    openDSLFile: vi.fn(),
    saveDSLFile: vi.fn().mockResolvedValue(true),
  }
})

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
})

describe('WelcomeScreen', () => {
  it('renders without crashing', () => {
    expect(() => render(<WelcomeScreen />)).not.toThrow()
  })

  it('shows tagline', () => {
    render(<WelcomeScreen />)
    expect(screen.getByText('Visual architecture modelling with Structurizr DSL')).toBeTruthy()
  })

  it('shows primary action buttons', () => {
    render(<WelcomeScreen />)
    expect(screen.getByText('Open .dsl file')).toBeTruthy()
    expect(screen.getByText('New workspace (.dsl)')).toBeTruthy()
    expect(screen.getByText('Explore sample')).toBeTruthy()
  })

  it('"Explore sample" loads a workspace', async () => {
    render(<WelcomeScreen />)
    await act(async () => {
      fireEvent.click(screen.getByText('Explore sample'))
    })
    const ws = useWorkspaceStore.getState().workspace
    expect(ws).not.toBeNull()
    expect(ws?.name).toBeTruthy()
  })

  it('"New workspace (.dsl)" loads a workspace', async () => {
    render(<WelcomeScreen />)
    await act(async () => {
      fireEvent.click(screen.getByText('New workspace (.dsl)'))
    })
    const ws = useWorkspaceStore.getState().workspace
    expect(ws).not.toBeNull()
  })

  it('shows template buttons', () => {
    render(<WelcomeScreen />)
    expect(screen.getByText('Microservices')).toBeTruthy()
    expect(screen.getByText('Monolith')).toBeTruthy()
    expect(screen.getByText('Event-Driven')).toBeTruthy()
  })

  it('template click loads workspace', async () => {
    render(<WelcomeScreen />)
    await act(async () => {
      fireEvent.click(screen.getByText('Microservices'))
    })
    const ws = useWorkspaceStore.getState().workspace
    expect(ws).not.toBeNull()
  })

  it('error banner is hidden by default', () => {
    render(<WelcomeScreen />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('import JSON with invalid JSON shows error banner', async () => {
    render(<WelcomeScreen />)
    // Find hidden file input for JSON import
    const inputs = document.querySelectorAll('input[type="file"]')
    const jsonInput = Array.from(inputs).find(el => (el as HTMLInputElement).accept.includes('.json')) as HTMLInputElement
    expect(jsonInput).toBeTruthy()

    const invalidFile = new File(['not valid json !!!'], 'bad.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(jsonInput, { target: { files: [invalidFile] } })
    })
    // FileReader is async — we need to wait for it
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('document title is set to "c4hero"', () => {
    render(<WelcomeScreen />)
    expect(document.title).toBe('c4hero')
  })
})
