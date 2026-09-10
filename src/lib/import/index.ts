// Import foreign C4 formats into a c4hero workspace (TEA-255).
//
// Every importer builds a Workspace, then the result is pushed through
// `parseDSL(serializeDSL(ws))`. That round trip is the safety net: it proves
// the imported model is fully representable in Structurizr DSL, reuses the
// serializer's escaping, and synthesises default views. If it fails, the
// import fails loudly with the parser's errors rather than loading a model
// that could never be saved.

import type { View, ViewType, Workspace } from '@/types/model'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { parseC4PlantUML } from './c4plantuml'
import { parseMermaidC4, stripMermaidFence } from './mermaidC4'
import { ImportError, summarize, type ForeignFormat, type ImportResult } from './importTypes'

export type { ForeignFormat, ImportResult, ImportWarning } from './importTypes'
export { ImportError } from './importTypes'

export function detectFormat(content: string): ForeignFormat {
  const text = stripMermaidFence(content)
  if (/^\s*(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/m.test(text)) return 'mermaid-c4'
  if (/^\s*@startuml\b/m.test(text) || /^\s*!include(url)?\s+.*C4/m.test(text)) return 'c4plantuml'
  if (/^\s*workspace\b[^\n]*\{/m.test(text)) return 'structurizr'
  // A bare list of C4 macros with no header is still importable.
  if (/^\s*(Person|System|Container|Component)(Db|Queue)?(_Ext)?\s*\(/m.test(text)) return 'c4plantuml'
  return 'unknown'
}

export interface ForeignImport extends ImportResult {
  format: 'c4plantuml' | 'mermaid-c4'
  /** Key of the generated view matching the source diagram type, if any. */
  initialViewKey?: string
}

function pickInitialView(ws: Workspace, hint: ViewType | undefined): string | undefined {
  const all: View[] = [
    ...ws.views.systemLandscapeViews, ...ws.views.systemContextViews,
    ...ws.views.containerViews, ...ws.views.componentViews,
  ]
  const match = hint ? all.find((v) => v.type === hint) : undefined
  return (match ?? all[0])?.key
}

/** Parse, then normalise through the DSL round trip. Throws ImportError
 *  when the text isn't a supported format or the result can't be expressed
 *  in Structurizr DSL. */
export function importForeign(content: string): ForeignImport {
  if (content.length === 0 || content.trim() === '') throw new ImportError('Nothing to import')
  const format = detectFormat(content)
  if (format === 'structurizr') throw new ImportError('This is already Structurizr DSL — open it with "Open .dsl file" instead')
  if (format === 'unknown') throw new ImportError('Not recognised as C4-PlantUML (@startuml with C4 macros) or Mermaid C4 (C4Context / C4Container / C4Component)')

  const raw = format === 'mermaid-c4' ? parseMermaidC4(content) : parseC4PlantUML(content)
  if (raw.summary.people + raw.summary.systems === 0) {
    throw new ImportError('No people or software systems found — check the warnings for what was skipped')
  }

  let dsl: string
  try {
    dsl = serializeDSL(raw.workspace)
  } catch (err) {
    throw new ImportError(`The imported model cannot be written as Structurizr DSL: ${err instanceof Error ? err.message : String(err)}`)
  }
  const { workspace, errors } = parseDSL(dsl)
  if (errors.length > 0) {
    throw new ImportError(`The imported model did not round-trip through Structurizr DSL: ${errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('; ')}`)
  }
  if (!workspace.name) workspace.name = raw.workspace.name
  return {
    format,
    workspace,
    warnings: raw.warnings,
    viewHint: raw.viewHint,
    summary: summarize(workspace),
    initialViewKey: pickInitialView(workspace, raw.viewHint),
  }
}
