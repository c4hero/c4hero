import { useState } from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AdrBody } from './AdrBody'
import { createBlankWorkspace } from '@/lib/templates'
import { useDocsStore } from '@/store/docs'
import type { AiProvider } from '@/lib/ai'

vi.mock('@/lib/host', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/host')>(),
  isVsCodeHost: () => true,
  hasOpenFolder: () => true,
  getCurrentDirHandle: () => null,
}))
vi.mock('./sessionCache', () => ({
  usePersistentState: (key: string, initial: unknown) => useState(key === 'adr.md' ? '# Native decision\n\nUse native documents.' : initial),
}))
vi.mock('./aiHelpers', () => ({
  useAiRun: () => ({ loading: false, error: null, go: vi.fn() }),
}))

it('offers saving a drafted ADR into a VS Code document folder', async () => {
  const create = vi.fn().mockResolvedValue('adrs/native-decision.md')
  useDocsStore.setState({ create })
  const view = render(<AdrBody provider={{} as AiProvider} workspace={createBlankWorkspace()} />)
  fireEvent.click(view.getByRole('button', { name: 'Save to decisions' }))
  await waitFor(() => expect(create).toHaveBeenCalledWith('adrs', {}, {
    title: 'Native decision', body: '# Native decision\n\nUse native documents.',
  }))
  await waitFor(() => expect(view.getByRole('button', { name: 'Saved' })).toBeDefined())
  view.unmount()
})
