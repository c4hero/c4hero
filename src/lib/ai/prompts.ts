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
    '- elementIds: the ids of affected existing PEOPLE/SYSTEMS/CONTAINERS/COMPONENTS (may be',
    '  empty). For a finding about a relationship (missing, mislabeled, or otherwise), use its',
    '  two endpoint element ids — never a relationship\'s own id.',
    '- suggestion: a concrete recommended fix',
    '- operations: when (and only when) the finding can be fixed by a direct edit to the model,',
    '  include the operations that implement the fix (format below). For advisory findings',
    '  (process, open questions, practices that do not change the diagram), omit operations.',
    '- options: when the finding can be fixed by a direct edit, offer 2–3 DISTINCT fix approaches',
    '  the user can choose between. Each option is { label: a short phrase naming the approach,',
    '  operations: the ops that implement THAT option }. Make `operations` equal to your first/',
    '  recommended option. Omit `options` for advisory findings.',
    'Order findings by severity (high first). Put real element ids ONLY in `elementIds` and in',
    'operations — in `title`, `detail`, and `suggestion`, refer to elements by NAME, never echo a',
    'raw id. If the model looks complete, return an empty findings list.',
    'When a finding is about categorisation, lifecycle or ownership (e.g. datastores that should be',
    'tagged, deprecated elements, unassigned ownership), make it actionable with an updateElement',
    'op that sets tags / status / owner accordingly.',
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
      'Elements marked EXTERNAL belong to another system/container and are shown only as context;',
      'their presence here is intentional — do not report them as misplaced or wrongly-parented.',
      '',
      serializeViewContext(ws, view),
    ].join('\n')
  }
  return `Review this entire architecture model:\n\n${serializeContext(ws)}`
}

// ─── Grounded Q&A ───────────────────────────────────────────────────

export function qaSystem(): string {
  return [
    'You answer questions about a C4 software-architecture model, grounded ONLY in the model',
    'given below. Be concise, specific and concrete — name the actual people, systems,',
    'containers, components and relationships. When tracing what connects to what, follow the',
    'relationships in the model rather than guessing. If the model does not contain enough',
    'information to answer, say so plainly instead of inventing elements or relationships that',
    'are not there. Answer in prose — short paragraphs or bullet points — never JSON or DSL.',
  ].join('\n')
}

/** Build the Q&A user message. Grounds on `view` (the current screen) when given,
 *  otherwise the whole model. */
export function qaUser(ws: Workspace, view: View | null, question: string): string {
  const context = view ? serializeViewContext(ws, view) : serializeContext(ws)
  return [context, '', `Question: ${question}`].join('\n')
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
    'Set "external": true on an addSoftwareSystem when it is a third-party / hosted',
    'system the code merely depends on (e.g. Stripe, SendGrid, a managed database or',
    'queue, a hosted API) rather than something built in this codebase. External systems',
    'are black boxes — never give them containers or components.',
    'Do not delete or rename anything the instruction did not ask you to. Prefer adding',
    'descriptions and technologies to new elements.',
    'Every addRelationship needs a description of what the interaction does (e.g. "Sends orders',
    'to", "Reads customer records from"); include a technology/protocol (e.g. HTTPS/JSON, gRPC,',
    'AMQP) whenever it is known or reasonably implied.',
    'updateElement can also set, on an existing element: "tags" (short category tags for styling,',
    'grouping and filtering, e.g. ["Database"], ["Gateway"], ["Critical"] — these are ADDED to the',
    'element; its existing tags are kept, so never re-list structural tags like "Element" or',
    '"Container"), "status" (lifecycle, exactly one of Live, Planned, Deprecated, Removed), and',
    '"owner" (the team or person responsible). Use these only when the instruction or finding asks',
    'for categorising, marking lifecycle, or assigning ownership.',
    'addView creates a new diagram: "viewType" is one of systemLandscape, systemContext, container,',
    'component; "scope" is the software system (for systemContext/container) or container (for',
    'component) the view is about, by real id or a ref (omit for systemLandscape, which spans the',
    'whole model). The view is auto-populated with the scope and its related elements — do not add',
    'elements to it yourself. Emit addView only when the instruction explicitly asks for a new view',
    'or diagram (e.g. "make a component view of the API service"); never add views unprompted.',
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

