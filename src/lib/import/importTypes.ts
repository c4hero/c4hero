import type { ViewType, Workspace } from '@/types/model'

export type ForeignFormat = 'c4plantuml' | 'mermaid-c4' | 'structurizr' | 'unknown'

export interface ImportWarning {
  /** 1-based line in the source text. */
  line: number
  message: string
}

export interface ImportResult {
  workspace: Workspace
  warnings: ImportWarning[]
  /** Which view type the source diagram was, so the canvas can open on the
   *  matching generated view instead of the first one. */
  viewHint?: ViewType
  /** Counts for the dialog summary. */
  summary: { people: number; systems: number; containers: number; components: number; relationships: number }
}

export class ImportError extends Error {
  readonly line?: number
  constructor(message: string, line?: number) {
    super(message)
    this.name = 'ImportError'
    this.line = line
  }
}

export function summarize(ws: Workspace): ImportResult['summary'] {
  let containers = 0
  let components = 0
  for (const s of ws.model.softwareSystems) {
    containers += s.containers.length
    for (const c of s.containers) components += c.components.length
  }
  return {
    people: ws.model.people.length,
    systems: ws.model.softwareSystems.length,
    containers,
    components,
    relationships: ws.model.relationships.length,
  }
}
