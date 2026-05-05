import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingDot from './LoadingDot'

describe('LoadingDot', () => {
  it('renders with accessible "Loading" label', () => {
    render(<LoadingDot />)
    expect(screen.getByLabelText('Loading')).toBeTruthy()
  })

  it('renders an animated inner dot', () => {
    render(<LoadingDot />)
    const wrapper = screen.getByLabelText('Loading')
    const inner = wrapper.firstElementChild
    expect(inner).not.toBeNull()
    const style = inner?.getAttribute('style') ?? ''
    expect(style).toContain('animation')
    expect(style).toContain('pulse')
  })

  it('has no props and is deterministic', () => {
    const { container: a } = render(<LoadingDot />)
    const { container: b } = render(<LoadingDot />)
    expect(a.innerHTML).toBe(b.innerHTML)
  })
})
