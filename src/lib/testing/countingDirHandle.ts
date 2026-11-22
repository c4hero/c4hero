/** Test double: a directory whose files remember their content and count how
 *  many times a writable was opened on them, so a test can assert that a write
 *  did NOT happen rather than only that the end state looks right. */
export function makeCountingDirHandle(files: Record<string, string> = {}, name = 'testfolder') {
  const content: Record<string, string> = { ...files }
  const opened: Record<string, number> = {}
  const handleFor = (file: string) => ({
    kind: 'file' as const,
    name: file,
    getFile: async () => new File([content[file] ?? ''], file, { type: 'text/plain' }),
    createWritable: async () => {
      opened[file] = (opened[file] ?? 0) + 1
      let buf = ''
      return { write: (d: string) => { buf += d }, close: async () => { content[file] = buf } }
    },
  })
  const dir = {
    kind: 'directory',
    name,
    entries: async function* () { for (const n of Object.keys(content)) yield [n, handleFor(n)] },
    getFileHandle: async (file: string, opts?: { create?: boolean }) => {
      if (file in content) return handleFor(file)
      if (opts?.create) { content[file] = ''; return handleFor(file) }
      throw new DOMException('Not found', 'NotFoundError')
    },
    queryPermission: async () => 'granted' as PermissionState,
  } as unknown as FileSystemDirectoryHandle
  return { dir, content, opened }
}
