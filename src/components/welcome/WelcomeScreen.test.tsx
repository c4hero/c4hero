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
  FolderOpen: () => null,
  Plus: () => null,
  Pencil: () => null,
  Trash2: () => null,
  ChevronRight: () => null,
  X: () => null,
}))

// Mock fileIO — hasFileSystemAccess returns false so saveDSLFile won't be called on blank workspace
vi.mock('@/lib/fileIO', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/fileIO')>()
  return {
    ...mod,
    hasFileSystemAccess: () => false,
    openDSLFile: vi.fn(),
    saveDSLFile: vi.fn().mockResolvedValue(true),
    getRecentFolders: () => [],
    addRecentFolder: vi.fn(),
  }
})

// Mock folderIO — hasFolderAccess returns false (jsdom has no showDirectoryPicker)
vi.mock('@/lib/folderIO', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/folderIO')>()
  return {
    ...mod,
    hasFolderAccess: () => false,
    getCurrentDirHandle: () => null,
    openFolder: vi.fn().mockResolvedValue(null),
    readDSLFile: vi.fn(),
    writeDSLFile: vi.fn().mockResolvedValue(true),
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
    expect(screen.getByRole('heading', { name: /Diagram your architecture/ })).toBeTruthy()
  })

  it('shows fallback action when folder access unavailable', () => {
    render(<WelcomeScreen />)
    // In jsdom hasFolderAccess() = false, so fallback "Open .dsl file" shows
    expect(screen.getByText('Open .dsl file')).toBeTruthy()
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

  it('document title describes c4hero on the startup view', () => {
    render(<WelcomeScreen />)
    expect(document.title).toBe('c4hero — visual architecture modelling')
  })
})
