import type { Workspace, View } from '@/types/model'
import { serializeContext, serializeViewContext, viewLabel } from './context'

// System/user prompt builders. Pure string assembly — kept out of the provider
// and feature orchestration so prompt wording is reviewable and testable.

const DSL_PRIMER = `Structurizr DSL quick reference:
workspace "Name" {
  model {
    user = person "User" "A description"
    sys = softwareSystem "System" "Description" {
      web = container "Web App" "Description" "React"
      db = container "Database" "Stores data" "PostgreSQL"
    }
    user -> web "Uses"
    web -> db "Reads/writes"
  }
  views {
    systemContext sys "Context" { include * autolayout }
    container sys "Containers" { include * autolayout }
  }
}
Rules: identifiers are lowercase, no spaces. Wrap multi-word names in quotes.
A container's third quoted string is its technology. Relationships use ->.`

// ─── Generate ───────────────────────────────────────────────────────

export function generateSystem(): string {
  return [
    'You are an expert software architect who designs C4 architecture models.',
    'Given a plain-English description of a system, produce a valid Structurizr DSL workspace.',
    'Model people (actors), software systems, containers (apps/services/datastores) with their',
    'technologies, components where relevant, and the relationships between them with clear labels.',
    'Always include a systemContext and a container view with `include * autolayout`.',
    'Respond with ONLY the DSL — no prose, no code fences.',
    '',
    DSL_PRIMER,
  ].join('\n')
}

export function generateUser(description: string): string {
  return `Design a C4 model for the following system. Be thorough but avoid inventing details that contradict the description.\n\n${description.trim()}`
}

// ─── Review ─────────────────────────────────────────────────────────

export function reviewSystem(): string {
  return [
    'You are a senior software architect reviewing a C4 architecture model. Return a structured',
    'list of findings — not prose. For each issue, provide:',
    '- title: a short summary',
    '- detail: one or two sentences explaining it',
    '- category: one of missing-element, missing-relationship, naming, description, technology,',
    '  boundary, security, scalability, other',
    '- severity: high, medium, or low',
    '- elementIds: the ids of affected existing elements (may be empty)',
    '- suggestion: a concrete recommended fix',
    '- operations: when (and only when) the finding can be fixed by a direct edit to the model,',
    '  include the operations that implement the fix (format below). For advisory findings',
    '  (process, open questions, practices that do not change the diagram), omit operations.',
    'Order findings by severity (high first). Be specific and reference real element ids. If the',
    'model looks complete, return an empty findings list.',
    '',
    'Operation format (used only inside a finding\'s `operations`):',
    editSystem(),
  ].join('\n')
}

/** Build the review user message. When `view` is provided, the review is scoped
 *  to what's on that screen; otherwise it covers the whole model. */
export function reviewUser(ws: Workspace, view?: View | null): string {
  if (view) {
    return [
      `Review only the ${viewLabel(view)} — the elements and relationships shown on this screen.`,
      'Findings and operations should concern this view; do not critique unrelated parts of the model.',
      '',
      serializeViewContext(ws, view),
    ].join('\n')
  }
  return `Review this entire architecture model:\n\n${serializeContext(ws)}`
}

// ─── Auto-describe ──────────────────────────────────────────────────

export function describeSystem(): string {
  return [
    'You write concise, useful descriptions for C4 architecture elements and relationships.',
    'You are given a model and a list of ids that currently lack a description.',
    'For each id, write a short description (one phrase or sentence) of what that element does,',
    'or what a relationship represents, inferred from its name, technology, and connections.',
    'Only return ids from the provided "missing" lists. Keep descriptions specific and free of filler.',
  ].join('\n')
}

export function describeUser(ws: Workspace, missingElementIds: string[], missingRelationshipIds: string[]): string {
  return [
    serializeContext(ws),
    '',
    `Elements missing a description (ids): ${missingElementIds.join(', ') || '(none)'}`,
    `Relationships missing a description (ids): ${missingRelationshipIds.join(', ') || '(none)'}`,
    '',
    'Return a description for each of those ids.',
  ].join('\n')
}

// ─── Edit ───────────────────────────────────────────────────────────

export function editSystem(): string {
  return [
    'You modify a C4 architecture model by emitting a list of operations.',
    'You are given the current model (every element and relationship is id-tagged) and an',
    'instruction. Produce the minimal set of operations that fulfils the instruction.',
    '',
    'Reference EXISTING elements/relationships by their real id from the model.',
    'For NEW elements, assign a temporary ref (e.g. "new1") in the add op; later ops and',
    'relationships may target that ref. A container/component\'s parent is the real id or a',
    'ref of its system/container. addRelationship source/destination are ids or refs.',
    'Do not delete or rename anything the instruction did not ask you to. Prefer adding',
    'descriptions and technologies to new elements.',
  ].join('\n')
}

export function editUser(ws: Workspace, instruction: string): string {
  return [
    serializeContext(ws),
    '',
    `Instruction: ${instruction.trim()}`,
  ].join('\n')
}

// ─── ADR (Architecture Decision Record) ─────────────────────────────

export function adrSystem(): string {
  return [
    'You draft Architecture Decision Records (ADRs) grounded in a C4 architecture model.',
    'Use the standard ADR structure with these Markdown sections:',
    '# <number-less title>, then **Status** (Proposed), **Context**, **Decision**,',
    '**Consequences** (both positive and negative), and **Alternatives considered**.',
    'Ground the Context and Consequences in the actual elements and relationships of the',
    'provided model, referencing them by name. Be specific and balanced; surface real',
    'tradeoffs rather than generic boilerplate. Respond in GitHub-flavored Markdown only.',
  ].join('\n')
}

export function adrUser(ws: Workspace | null, topic: string): string {
  const parts: string[] = []
  if (ws) {
    parts.push('Current architecture model for grounding:')
    parts.push(serializeContext(ws))
    parts.push('')
  }
  parts.push(`Draft an ADR for the following decision: ${topic.trim()}`)
  return parts.join('\n')
}

// ─── Interview ──────────────────────────────────────────────────────

export function interviewSystem(ws: Workspace, view: View): string {
  return [
    'You are interviewing a software architect about the diagram they are currently looking at,',
    'to fill gaps and improve the model. Ask ONE focused, specific question per turn —',
    'about missing elements, unclear responsibilities, undocumented relationships, technologies,',
    'data stores, external actors, or anything ambiguous on the current screen.',
    'Prefer concrete questions grounded in what is on screen over generic ones. Keep each',
    'question to one or two sentences. Do not answer for the user, do not summarize, and do not',
    'emit any operations — just ask the next question. If the model already seems complete, ask',
    'a question that would still add useful detail.',
    '',
    serializeViewContext(ws, view),
  ].join('\n')
}

/** First user turn that kicks off the interview. */
export function interviewKickoff(view: View): string {
  return `Begin interviewing me about this ${viewLabel(view)}. Ask your first question.`
}

/** System prompt for turning the interview transcript into model operations. */
export function interviewPlanSystem(ws: Workspace, view: View): string {
  return [
    'You turn an interview transcript into concrete edits to a C4 architecture model.',
    'Using ONLY information the user provided in the conversation, emit the operations needed to',
    'reflect it: add missing elements/relationships, set descriptions and technologies, rename or',
    'correct elements. Do not invent facts the user did not state. Do not delete anything unless',
    'the user explicitly said it does not exist.',
    '',
    'IMPORTANT: whenever the user describes how things interact, talk to, call, depend on, read',
    'from, or write to one another, emit an addRelationship operation for it. A newly added',
    'element almost always needs at least one relationship — never add an element and leave it',
    'unconnected if the conversation implies a connection. For addRelationship.source and',
    '.destination, use the element id, a ref defined earlier in this batch, or the element\'s',
    'exact name.',
    '',
    editSystem(),
    '',
    'Current model (id-tagged):',
    serializeContext(ws),
    '',
    serializeViewContext(ws, view),
  ].join('\n')
}

export function interviewPlanUser(): string {
  return 'Based on everything I told you in this interview, produce the operations to update the model.'
}

// ─── Repo scan ──────────────────────────────────────────────────────

export function repoScanSystem(ws: Workspace | null): string {
  return [
    'You analyze a code repository and propose updates to a C4 architecture model.',
    'You are given a snapshot of the repo (its file tree plus the contents of key manifest and',
    'config files) and the current model. Infer software systems, containers (apps, services,',
    'datastores), their technologies, external systems (third-party SDKs/APIs the code uses), and',
    'the relationships between them — based on what the code actually shows.',
    '',
    'Return a list of proposals. Each proposal has:',
    '- op: a single operation (format below) that adds or corrects the model',
    '- src: the repo file path that justifies it (e.g. "package.json", "orders/pom.xml")',
    '- label: a short human-readable description of the change',
    'Only propose what the code evidences; do not invent elements the repo does not show, and do',
    'not re-add things already present and correct in the model. Reference existing elements by id',
    'or exact name; give new elements a ref. Prefer setting technologies and descriptions you can',
    'read from manifests. If the model already matches the code, return an empty proposals list.',
    '',
    'Operation format (used inside each proposal\'s `op`):',
    editSystem(),
    '',
    'Current model (id-tagged):',
    ws ? serializeContext(ws) : '(no current model — propose elements to create one)',
  ].join('\n')
}

export function repoScanUser(bundle: string): string {
  return `Repository snapshot:\n\n${bundle}\n\nPropose the model updates the code implies.`
}
