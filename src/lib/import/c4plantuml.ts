// C4-PlantUML importer: `@startuml` files using the C4_Context / C4_Container /
// C4_Component macro sets. Line-oriented; no PlantUML preprocessing.

import { tokenizeMacroLines, type MacroLine } from './macroCall'
import { ModelBuilder, elementVariant, relationshipVariant, boundaryVariant } from './modelBuilder'
import { summarize, type ImportResult } from './importTypes'

/** Macros and directives that are recognised only to be reported. */
const SKIPPED_CALLS: Array<[RegExp, string]> = [
  [/^LAYOUT_/i, 'layout directive'],
  [/^SHOW_/i, 'display directive'],
  [/^HIDE_/i, 'display directive'],
  [/^Lay_/i, 'manual layout hint'],
  [/^(AddElementTag|AddRelTag|AddBoundaryTag|UpdateElementStyle|UpdateRelStyle|UpdateBoundaryStyle|SetDefaultLegendEntries)$/, 'styling macro (not imported yet)'],
  [/^(Deployment_Node|Node|Node_L|Node_R|Deployment_Node_L|Deployment_Node_R)$/, 'deployment node (deployment import is a follow-up)'],
  [/^(ContainerDb|ContainerQueue)_Boundary$/, 'boundary variant'],
]

export function parseC4PlantUML(content: string): ImportResult {
  const b = new ModelBuilder()
  const lines = tokenizeMacroLines(content)
  // Mutable through the bare-line handler's callbacks, hence an object.
  const state = { skipUntil: null as RegExp | null, sawStart: false }
  let depthOfSkippedBlock = 0

  for (const l of lines) {
    if (state.skipUntil) {
      if (l.kind === 'bare' && state.skipUntil.test(l.text)) state.skipUntil = null
      continue
    }
    if (depthOfSkippedBlock > 0) {
      if (l.kind === 'close') depthOfSkippedBlock--
      else if (l.kind === 'call' && l.opensBlock) depthOfSkippedBlock++
      continue
    }
    if (l.kind === 'close') { b.closeBoundary(l.line); continue }
    if (l.kind === 'bare') { handleBare(l, b, (re) => { state.skipUntil = re }, () => { state.sawStart = true }); continue }

    const ev = elementVariant(l.name)
    if (ev) { b.addElement(l, ev); continue }
    const rv = relationshipVariant(l.name)
    if (rv) { b.addRelationship(l, rv.bidirectional); continue }
    const bv = boundaryVariant(l.name)
    if (bv) {
      b.openBoundary(l, bv)
      if (!l.opensBlock) b.closeBoundary(l.line) // one-line boundary with no body
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

  if (!state.sawStart) b.warn(1, 'No @startuml found — imported as a bare macro list')
  const workspace = b.build()
  return { workspace, warnings: b.warnings, viewHint: b.viewHint(), summary: summarize(workspace) }
}

function handleBare(
  l: Extract<MacroLine, { kind: 'bare' }>,
  b: ModelBuilder,
  skipBlock: (until: RegExp) => void,
  markStart: () => void,
): void {
  const t = l.text
  const start = t.match(/^@startuml(?:\s+(.+))?$/i)
  if (start) { markStart(); if (start[1] && !b.name) b.name = start[1].trim(); return }
  if (/^@enduml$/i.test(t)) return
  const title = t.match(/^title\s+(.+)$/i)
  if (title) { b.name = title[1].trim().replace(/^"(.*)"$/, '$1'); return }
  if (/^!include(url)?\b/i.test(t)) { b.warn(l.line, `${t.split(/\s+/)[0]} skipped — includes are not resolved (no file or network access)`); return }
  if (/^!(define|procedure|function|unquoted|theme|pragma|\$)/i.test(t) || /^!/.test(t)) { b.warn(l.line, `Preprocessor line "${t.slice(0, 40)}" skipped`); return }
  if (/^skinparam\b/i.test(t)) { b.warn(l.line, 'skinparam skipped'); return }
  if (/^(note|legend|caption|header|footer)\b/i.test(t)) {
    const kw = t.split(/\s+/)[0].toLowerCase()
    // Single-line `note ... : text` has no end marker.
    if (/:/.test(t) && kw === 'note') { b.warn(l.line, 'note skipped'); return }
    b.warn(l.line, `${kw} block skipped`)
    skipBlock(new RegExp(`^end\\s*${kw}\\b`, 'i'))
    return
  }
  if (/^(left to right direction|top to bottom direction|scale\b|hide\b|show\b|allowmixing)/i.test(t)) {
    b.warn(l.line, `"${t.slice(0, 40)}" skipped`)
    return
  }
  b.warn(l.line, `Unrecognised line "${t.slice(0, 50)}" skipped`)
}
