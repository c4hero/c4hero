import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { saveDSLFile } from '@/lib/fileIO'
import FloatingTopPill from './FloatingTopPill'

vi.mock('@/lib/fileIO', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fileIO')>(),
  saveDSLFile: vi.fn(async () => true),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useWorkspaceStore.getState().loadWorkspace(parseDSL('workspace "Export test" { model { s = softwareSystem "System" } }').workspace)
})

describe('DSL export result', () => {
  it.each([false, true])('reflects the DSL save result %s in its completion check', async (saved) => {
    vi.mocked(saveDSLFile).mockResolvedValueOnce(saved)
    render(<FloatingTopPill />)
    fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }))
    const button = await screen.findByRole('button', { name: 'Download Structurizr DSL', exact: true })
    fireEvent.click(button)
    await waitFor(() => expect(saveDSLFile).toHaveBeenCalledOnce())
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))
    expect(button.querySelector('.lucide-check') !== null).toBe(saved)
  })
})
