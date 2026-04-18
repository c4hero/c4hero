// Auto-mock react-router-dom for tests that don't wrap in a Router.
// Tests that need real routing should mock it themselves.
import { vi } from 'vitest'

// window.matchMedia is not implemented in jsdom. Stub it so any module that
// calls matchMedia at import time (e.g. settings.ts isMobile check) doesn't throw.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
    useParams: () => ({}),
  }
})
