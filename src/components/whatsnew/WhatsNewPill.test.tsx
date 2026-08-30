import { render, screen, fireEvent } from '@testing-library/react'
import WhatsNewPill from './WhatsNewPill'
import type { WhatsNewRelease } from '@/lib/whatsNew'

vi.mock('lucide-react', () => ({
  ExternalLink: () => null,
  Megaphone: () => null,
  X: () => null,
}))

const KEY = 'c4hero.whatsNewDismissed'

const release: WhatsNewRelease = {
  id: '2026-09-01-test',
  date: 'September 1, 2026',
  items: [
    { title: 'Deployment views', body: 'Model environments and instances.' },
    { title: 'Dynamic views', body: 'Ordered interaction steps.' },
  ],
}

beforeEach(() => localStorage.clear())

describe('WhatsNewPill', () => {
  it('renders nothing when there is no release', () => {
    render(<WhatsNewPill release={null} />)
    expect(screen.queryByRole('button', { name: /what's new/i })).toBeNull()
  })

  it('renders nothing on first-ever launch, and seeds the stored id', () => {
    render(<WhatsNewPill release={release} />)
    expect(screen.queryByRole('button', { name: /what's new/i })).toBeNull()
    expect(localStorage.getItem(KEY)).toBe(release.id)
  })

  it('shows the pill for an undismissed release and opens the details dialog', () => {
    localStorage.setItem(KEY, 'older-release')
    render(<WhatsNewPill release={release} />)

    fireEvent.click(screen.getByRole('button', { name: /what's new in c4hero/i }))
    const dialog = screen.getByRole('dialog', { name: /what's new/i })
    expect(dialog.textContent).toContain('Deployment views')
    expect(dialog.textContent).toContain('Dynamic views')
    expect(dialog.textContent).toContain('September 1, 2026')
  })

  it('"Got it" dismisses: dialog and pill disappear, id is stored', () => {
    localStorage.setItem(KEY, 'older-release')
    render(<WhatsNewPill release={release} />)

    fireEvent.click(screen.getByRole('button', { name: /what's new in c4hero/i }))
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /what's new in c4hero/i })).toBeNull()
    expect(localStorage.getItem(KEY)).toBe(release.id)
  })

  it('the pill ✕ dismisses without opening the dialog', () => {
    localStorage.setItem(KEY, 'older-release')
    render(<WhatsNewPill release={release} />)

    fireEvent.click(screen.getByRole('button', { name: /dismiss what's new/i }))
    expect(screen.queryByRole('button', { name: /what's new in c4hero/i })).toBeNull()
    expect(localStorage.getItem(KEY)).toBe(release.id)
  })

  it('shows a release-notes link when the entry provides one, external-safe', () => {
    localStorage.setItem(KEY, 'older-release')
    const linked = { ...release, link: { label: 'Full release notes', url: 'https://example.com/notes' } }
    render(<WhatsNewPill release={linked} />)

    fireEvent.click(screen.getByRole('button', { name: /what's new in c4hero/i }))
    const link = screen.getByRole('link', { name: /full release notes/i }) as HTMLAnchorElement
    expect(link.href).toBe('https://example.com/notes')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('shows no link when the entry has none', () => {
    localStorage.setItem(KEY, 'older-release')
    render(<WhatsNewPill release={release} />)
    fireEvent.click(screen.getByRole('button', { name: /what's new in c4hero/i }))
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('closing the dialog without dismissing keeps the pill armed', () => {
    localStorage.setItem(KEY, 'older-release')
    render(<WhatsNewPill release={release} />)

    fireEvent.click(screen.getByRole('button', { name: /what's new in c4hero/i }))
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /what's new in c4hero/i })).toBeTruthy()
    expect(localStorage.getItem(KEY)).toBe('older-release')
  })
})
