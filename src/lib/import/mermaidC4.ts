// Mermaid C4 importer: `C4Context` / `C4Container` / `C4Component` /
// `C4Dynamic` / `C4Deployment` blocks, whose syntax mirrors C4-PlantUML's.

import type { ViewType } from '@/types/model'
import { tokenizeMacroLines } from './macroCall'
import { ModelBuilder, elementVariant, relationshipVariant, boundaryVariant } from './modelBuilder'
import { summarize, type ImportResult } from './importTypes'

const BLOCK_KINDS: Record<string, ViewType | 'dynamic' | 'deployment'> = {
  C4Context: 'systemContext',
  C4Container: 'container',
  C4Component: 'component',
  C4Dynamic: 'dynamic',
  C4Deployment: 'deployment',
}

/** Strip a ```` ```mermaid ```` fence when the text is a markdown snippet. */
export function stripMermaidFence(content: string): string {
  const m = content.match(/```\s*mermaid\s*\r?\n([\s\S]*?)```/i)
  return m ? m[1] : content
}

const SKIPPED_CALLS: Array<[RegExp, string]> = [
  [/^(UpdateElementStyle|UpdateRelStyle|UpdateBoundaryStyle|UpdateLayoutConfig)$/, 'styling/layout directive (not imported yet)'],
  [/^(Deployment_Node|Node|Node_L|Node_R)$/, 'deployment node (deployment import is a follow-up)'],
]

export function parseMermaidC4(input: string): ImportResult {
  const content = stripMermaidFence(input)
  const b = new ModelBuilder()
  const lines = tokenizeMacroLines(content)
  let blockKind: string | null = null
  let blocksSeen = 0
  let depthOfSkippedBlock = 0

  for (const l of lines) {
    if (depthOfSkippedBlock > 0) {
      if (l.kind === 'close') depthOfSkippedBlock--
      else if (l.kind === 'call' && l.opensBlock) depthOfSkippedBlock++
      continue
    }
    if (l.kind === 'bare') {
      const head = l.text.match(/^(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/)
      if (head) {
        blocksSeen++
        if (blocksSeen === 1) blockKind = head[1]
        else b.warn(l.line, `Second diagram "${head[1]}" ignored — only the first block is imported`)
        continue
      }
      if (blocksSeen > 1) continue
      const title = l.text.match(/^title\s+(.+)$/i)
      if (title) { b.name = title[1].trim().replace(/^"(.*)"$/, '$1'); continue }
      if (/^accTitle\b|^accDescr\b/i.test(l.text)) continue
      if (!blockKind) { b.warn(l.line, `Line before the C4 block skipped: "${l.text.slice(0, 40)}"`); continue }
      b.warn(l.line, `Unrecognised line "${l.text.slice(0, 50)}" skipped`)
      continue
    }
    if (blocksSeen > 1) continue
    if (l.kind === 'close') { b.closeBoundary(l.line); continue }

    const ev = elementVariant(l.name)
    if (ev) { b.addElement(l, ev); continue }
    const rv = relationshipVariant(l.name)
    if (rv) { b.addRelationship(l, rv.bidirectional); continue }
    const bv = boundaryVariant(l.name)
    if (bv) {
      b.openBoundary(l, bv)
      if (!l.opensBlock) b.closeBoundary(l.line)
      continue
    }
    const skipped = SKIPPED_CALLS.find(([re]) => re.test(l.name))
    if (skipped) {
      b.warn(l.line, `${l.name}(…): ${skipped[1]} skipped`)
      if (l.opensBlock) depthOfSkippedBlock = 1
      continue
    }
    b.warn(l.line, `Unrecognised macro ${l.name}(…) skipped`)
    if (l.opensBlock) depthOfSkippedBlock = 1
  }

  if (!blockKind) b.warn(1, 'No C4Context / C4Container / C4Component block found')
  const workspace = b.build()
  const kind = blockKind ? BLOCK_KINDS[blockKind] : undefined
  const viewHint: ViewType = kind === 'systemContext' || kind === 'container' || kind === 'component' ? kind : b.viewHint()
  if (kind === 'dynamic' || kind === 'deployment') b.warn(1, `${blockKind} imported as a static model — steps and nodes are not imported yet`)
  return { workspace, warnings: b.warnings, viewHint, summary: summarize(workspace) }
}
