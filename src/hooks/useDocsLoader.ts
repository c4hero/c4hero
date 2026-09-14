import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { useDocsStore } from '@/store/docs'
import { allDocsDirs } from '@/lib/docs/bundle'

/** Keep the docs store in step with the workspace: re-read the `!docs` /
 *  `!adrs` bundles whenever the set of folders the DSL names changes, and
 *  clear them when the workspace closes. Cheap to key on — it walks the model
 *  for directives, not the disk — so an edit that doesn't touch a directive
 *  never reloads. */
export function useDocsLoader(): void {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const key = workspace ? allDocsDirs(workspace).map((d) => `${d.kind}:${d.dir}`).join('|') : null
  const load = useDocsStore((s) => s.load)
  const reset = useDocsStore((s) => s.reset)

  useEffect(() => {
    const ws = useWorkspaceStore.getState().workspace
    if (ws && key !== null) void load(ws)
    else reset()
  }, [key, load, reset])

  // The canvas unmounts when the workspace closes, so clear here too: the next
  // folder must not briefly show this one's bundles under a matching key.
  useEffect(() => reset, [reset])
}
