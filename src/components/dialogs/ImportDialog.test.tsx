import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ImportDialog from './ImportDialog'

function renderDialog(position: 'center' | 'shade') {
  render(<ImportDialog position={position} onClose={vi.fn()} onImport={vi.fn()} />)
  return screen.getByRole('dialog', { name: 'Import PlantUML or Mermaid' })
}

describe('ImportDialog', () => {
  // Regression (TEA-332): DialogShell ships no default surface, so the centred variant
  // rendered transparent over the welcome screen — the page text showed
  // straight through the dialog body.
  it('gives the centred panel its own opaque surface', () => {
    const dialog = renderDialog('center')
    const style = dialog.getAttribute('style') ?? ''
    expect(style).toContain('background')
    expect(style).toContain('--color-bg-panel')
    expect(style).toContain('border')
  })

  it('leaves the shade variant to the .shade-panel class background', () => {
    const dialog = renderDialog('shade')
    expect(dialog.className).toContain('shade-panel')
    expect(dialog.getAttribute('style') ?? '').not.toContain('--color-bg-panel')
  })
})
