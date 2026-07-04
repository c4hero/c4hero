import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DialogShell from './DialogShell'

describe('DialogShell', () => {
  beforeEach(() => {
    // Run RAF callbacks synchronously so focus restoration is observable.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children inside a role="dialog" with aria-modal="true"', () => {
    render(
      <DialogShell onClose={() => {}} ariaLabel="Test dialog">
        <p>Dialog body</p>
      </DialogShell>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Dialog body')).toBeTruthy()
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <DialogShell onClose={onClose} ariaLabel="Test">
        <button>Inside</button>
      </DialogShell>,
    )
    const backdrop = container.querySelector('.panel-backdrop') as HTMLElement
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking inside the panel does NOT call onClose (stopPropagation)', () => {
    const onClose = vi.fn()
    render(
      <DialogShell onClose={onClose} ariaLabel="Test">
        <button>Inside</button>
      </DialogShell>,
    )
    fireEvent.click(screen.getByText('Inside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn()
    render(
      <DialogShell onClose={onClose} ariaLabel="Test">
        <button>Inside</button>
      </DialogShell>,
    )
    // Fire keydown on the outer container (the dialog's keydown handler)
    const dialog = screen.getByRole('dialog')
    // The keydown handler is on the outer container, a sibling of the dialog.
    // Fire on the dialog itself — events bubble up through its ancestors.
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('can leave Escape handling to child flows', () => {
    const onClose = vi.fn()
    render(
      <DialogShell onClose={onClose} ariaLabel="Test" closeOnEscape={false}>
        <button>Inside</button>
      </DialogShell>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('non-Escape keys do not trigger onClose', () => {
    const onClose = vi.fn()
    render(
      <DialogShell onClose={onClose} ariaLabel="Test">
        <button>Inside</button>
      </DialogShell>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('applies custom className and style to the panel', () => {
    render(
      <DialogShell
        onClose={() => {}}
        ariaLabel="Test"
        className="my-custom-class"
        style={{ maxWidth: '300px' }}
      >
        <span>x</span>
      </DialogShell>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('my-custom-class')
    expect(dialog.getAttribute('style') ?? '').toContain('max-width: 300px')
  })

  it('restores focus to the previously-focused element on close', () => {
    // Create a button outside the dialog and focus it
    const outsideBtn = document.createElement('button')
    outsideBtn.textContent = 'Outside'
    document.body.appendChild(outsideBtn)
    outsideBtn.focus()
    expect(document.activeElement).toBe(outsideBtn)

    const onClose = vi.fn()
    const { container } = render(
      <DialogShell onClose={onClose} ariaLabel="Test">
        <button>Inside</button>
      </DialogShell>,
    )

    // Click backdrop → handleClose should restore focus to outsideBtn
    const backdrop = container.querySelector('.panel-backdrop') as HTMLElement
    fireEvent.click(backdrop)

    expect(document.activeElement).toBe(outsideBtn)
    outsideBtn.remove()
  })
})
