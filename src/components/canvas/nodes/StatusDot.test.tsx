import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusDot from './StatusDot'

describe('StatusDot', () => {
  it('renders nothing when status is undefined', () => {
    const { container } = render(<StatusDot />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a dot when status is Live', () => {
    render(<StatusDot status="Live" />)
    const dot = screen.getByTestId('status-dot')
    expect(dot).toBeTruthy()
    expect(dot.getAttribute('title')).toBe('Live')
  })

  it('exposes accessible label via aria-label', () => {
    render(<StatusDot status="Planned" />)
    const dot = screen.getByRole('img', { name: 'Status: Planned' })
    expect(dot).toBeTruthy()
  })

  it('has role="img" for screen readers', () => {
    render(<StatusDot status="Deprecated" />)
    const dot = screen.getByTestId('status-dot')
    expect(dot.getAttribute('role')).toBe('img')
  })

  it('uses the correct CSS variable for each status', () => {
    const statuses = ['Live', 'Planned', 'Deprecated', 'Removed'] as const
    for (const status of statuses) {
      const { unmount } = render(<StatusDot status={status} />)
      const dot = screen.getByTestId('status-dot')
      const style = dot.getAttribute('style') ?? ''
      expect(style).toContain(`--color-status-${status.toLowerCase()}`)
      unmount()
    }
  })

  it('renders a derived colour for a status outside the built-in set', () => {
    // No `--color-status-beyond mvp` custom property exists, so the dot falls
    // back to a hue derived from the name — a custom status still gets a dot.
    render(<StatusDot status="Beyond MVP" />)
    const dot = screen.getByTestId('status-dot')
    const style = dot.getAttribute('style') ?? ''
    expect(style).not.toContain('--color-status-')
    // jsdom normalizes the hsl() the component emits to rgb() on read-back.
    expect(style).toMatch(/background:\s*(hsl|rgb)\(/)
    expect(dot.getAttribute('aria-label')).toBe('Status: Beyond MVP')
  })

  it('applies positional classes for absolute placement', () => {
    render(<StatusDot status="Removed" />)
    const dot = screen.getByTestId('status-dot')
    expect(dot.className).toContain('absolute')
    expect(dot.className).toContain('rounded-full')
  })
})
