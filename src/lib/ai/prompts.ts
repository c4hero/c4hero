import type { Workspace } from '@/types/model'
import { serializeContext } from './context'

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
    'You are a senior software architect reviewing a C4 architecture model.',
    'Give a concise, actionable critique. Focus on: missing actors or systems, missing or',
    'unlabeled relationships, vague naming, unclear boundaries/scoping, and notable',
    'security, reliability, or scalability gaps. Be specific and reference element names.',
    'Respond in GitHub-flavored Markdown with short sections and bullet points.',
    'Do not restate the whole model back; lead with the most important findings.',
  ].join('\n')
}

export function reviewUser(ws: Workspace): string {
  return `Review this architecture model:\n\n${serializeContext(ws)}`
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
