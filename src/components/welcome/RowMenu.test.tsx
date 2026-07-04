import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RowMenu from './RowMenu'

vi.mock('lucide-react', () => ({
  MoreHorizontal: () => null,
}))

describe('RowMenu', () => {
  let onRename: ReturnType<typeof vi.fn>
  let onDelete: ReturnType<typeof vi.fn>

  const items = () => [
    { label: 'Rename', onSelect: onRename },
    { label: 'Delete', onSelect: onDelete, danger: true },
  ]

  beforeEach(() => {
    onRename = vi.fn()
    onDelete = vi.fn()
    localStorage.clear()
  })

  function renderMenu() {
    return render(<RowMenu ariaLabel="More actions" items={items()} />)
  }

  it('renders a trigger button with the given aria label, menu closed', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens the menu on trigger click and renders all items', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'More actions' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('marks danger items with the danger class', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain('danger')
    expect(screen.getByRole('menuitem', { name: 'Rename' }).className).not.toContain('danger')
  })

  it('invokes onSelect and closes the menu when an item is clicked', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRename).toHaveBeenCalledOnce()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('toggles closed when the trigger is clicked again', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape without selecting anything', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('closes on outside mousedown', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open on mousedown inside the popup', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('closes on window resize', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.resize(window)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renders the popup into document.body via a portal', () => {
    const { container } = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(document.body.contains(menu)).toBe(true)
  })
})
