import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ExportDialog from './ExportDialog'

function renderDialog(overrides: Partial<ComponentProps<typeof ExportDialog>> = {}) {
  const props: ComponentProps<typeof ExportDialog> = {
    onExport: vi.fn().mockResolvedValue(undefined),
    onCopy: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<ExportDialog {...props} />)
  return props
}

describe('ExportDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes when Escape is pressed', () => {
    const props = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('disables actions while an export action is pending', async () => {
    let resolveCopy!: () => void
    const onCopy = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve }))
    renderDialog({ onCopy })

    const copyButton = screen.getByRole('button', { name: 'Copy' })
    fireEvent.click(copyButton)

    expect(onCopy).toHaveBeenCalledWith('dsl')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' }).hasAttribute('disabled')).toBe(true))
    expect(screen.getByRole('button', { name: 'Copy' }).getAttribute('aria-busy')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledTimes(1)

    await act(async () => { resolveCopy() })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' }).hasAttribute('disabled')).toBe(false))
  })

  it('offers the standalone HTML export', async () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Download interactive HTML' }))
    await waitFor(() => expect(props.onExport).toHaveBeenCalledWith('html'))
  })

  it('offers the OKF bundle as a zip everywhere, and as a folder only where the directory picker exists', async () => {
    const orig = (window as Record<string, unknown>).showDirectoryPicker
    delete (window as Record<string, unknown>).showDirectoryPicker
    try {
      const props = renderDialog()
      expect(screen.queryByRole('button', { name: 'Save OKF bundle to a folder' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Download OKF bundle as zip' }))
      await waitFor(() => expect(props.onExport).toHaveBeenCalledWith('okf-zip'))
    } finally {
      if (orig !== undefined) (window as Record<string, unknown>).showDirectoryPicker = orig
    }
  })

  it('offers the folder target when showDirectoryPicker is available', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    try {
      const props = renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Save OKF bundle to a folder' }))
      await waitFor(() => expect(props.onExport).toHaveBeenCalledWith('okf-folder'))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('marks an export that went through, and one that was cancelled', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    try {
      // A folder export the user cancelled resolves false: nothing was
      // written, so the row must not claim success.
      const cancelled = vi.fn().mockResolvedValue(false)
      const { unmount } = render(<ExportDialog onExport={cancelled} onCopy={vi.fn()} onClose={vi.fn()} />)
      const button = screen.getByRole('button', { name: 'Save OKF bundle to a folder' })
      fireEvent.click(button)
      await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
      expect(button.getAttribute('style')).not.toContain('tint-success')
      unmount()

      const exported = vi.fn().mockResolvedValue(undefined)
      render(<ExportDialog onExport={exported} onCopy={vi.fn()} onClose={vi.fn()} />)
      const second = screen.getByRole('button', { name: 'Save OKF bundle to a folder' })
      fireEvent.click(second)
      await waitFor(() => expect(second.getAttribute('style')).toContain('tint-success'))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gives the two Download buttons distinct accessible names', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Download interactive HTML' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download Structurizr DSL' })).toBeTruthy()
  })

  it('clears the busy state when an action rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onCopy = vi.fn().mockRejectedValue(new Error('clipboard blocked'))
    renderDialog({ onCopy })

    const copyButton = screen.getByRole('button', { name: 'Copy' })
    fireEvent.click(copyButton)

    await waitFor(() => expect(copyButton.hasAttribute('disabled')).toBe(false))
    expect(console.warn).toHaveBeenCalled()
  })
})
