import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TechIconField from './TechIconField'
import { loadTechIconCatalog } from '@/lib/techIcons/loader'

beforeAll(async () => { await loadTechIconCatalog() })

describe('TechIconField', () => {
  it('summarises auto-detect from the technology field', () => {
    render(<TechIconField properties={{}} technology="Kotlin, Micronaut" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Icon: Auto · Kotlin' })).toBeTruthy()
  })

  it('says when auto-detect finds nothing', () => {
    render(<TechIconField properties={{}} technology="Micronaut" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Icon: Auto · no match' })).toBeTruthy()
  })

  it('pins an icon picked from the searchable grid', () => {
    const onChange = vi.fn()
    render(<TechIconField properties={{}} technology="Kotlin" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^Icon:/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search icons' }), { target: { value: 'postgres' } })
    const choices = screen.getAllByRole('listitem')
    expect(choices.map((c) => c.getAttribute('aria-label'))).toEqual(['PostgreSQL'])
    fireEvent.click(choices[0])
    expect(onChange).toHaveBeenCalledWith('postgresql')
    // Picking closes the panel.
    expect(screen.queryByRole('textbox', { name: 'Search icons' })).toBeNull()
  })

  it('sets None and returns to Auto', () => {
    const onChange = vi.fn()
    const { rerender } = render(<TechIconField properties={{}} technology="Kotlin" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^Icon:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenLastCalledWith('none')

    rerender(<TechIconField properties={{ 'c4hero.icon': 'none' }} technology="Kotlin" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Icon: None' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Icon: None' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auto (Kotlin)' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('shows a pinned icon by name and marks it pressed in the grid', () => {
    render(<TechIconField properties={{ 'c4hero.icon': 'redis' }} technology="Kotlin" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Icon: Redis' }))
    expect(screen.getByRole('listitem', { name: 'Redis' }).getAttribute('aria-pressed')).toBe('true')
  })
})
