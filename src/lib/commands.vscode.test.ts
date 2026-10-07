import { expect, it, vi } from 'vitest'
import { getCommands } from './commands'
import { useWorkspaceStore } from '@/store/workspace'
import { createBlankWorkspace } from '@/lib/templates'
import { saveDSLFile, saveVsCodeDocument, writeSidecarToHandle } from '@/lib/host'

vi.mock('@/lib/host', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/host')>(),
  isVsCodeHost: () => true,
  saveVsCodeDocument: vi.fn().mockResolvedValue(undefined),
  saveDSLFile: vi.fn().mockResolvedValue(true),
  writeSidecarToHandle: vi.fn().mockResolvedValue(true),
}))

it('command-palette Save uses the acknowledged native document save', async () => {
  useWorkspaceStore.getState().loadWorkspace(createBlankWorkspace())
  await getCommands(null).find(command => command.id === 'save')!.execute()
  expect(saveVsCodeDocument).toHaveBeenCalledOnce()
  expect(saveDSLFile).not.toHaveBeenCalled()
  expect(writeSidecarToHandle).not.toHaveBeenCalled()
})
