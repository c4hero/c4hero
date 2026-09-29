import { create } from 'zustand'
export const useHostStatus = create<{
  dirty: boolean; loading: boolean; error: string | null
}>(() => ({ dirty: false, loading: true, error: null }))
export function reportHostError(error: unknown): void {
  useHostStatus.setState({ error: error instanceof Error ? error.message : String(error), loading: false })
}
