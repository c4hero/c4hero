import { Wand2, Stethoscope, MessagesSquare, Type, Pencil, Cpu, Link2, type LucideIcon } from 'lucide-react'
import type { View } from '@/types/model'
import type {
  AiFeatureId, GapKind, ReviewSeverity, ReviewFinding, ReviewFixOption, EditOp,
} from '@/lib/ai'
import { C } from './aiTheme'

// Shared vocabulary for the guided sweep: the view enum the panel navigates, the
// per-category / per-kind / per-severity presentation maps, and the small pure
// helpers over findings and view scope. Both AppView (the controller) and the
// wizard component cluster read from here.

export type SweepView = 'home' | 'wizard' | 'describe' | 'interview' | 'adr'

export const FEATURE_TO_VIEW: Record<AiFeatureId, SweepView> = {
  compose: 'describe', interview: 'interview', review: 'wizard', adr: 'adr',
}

export const VIEW_TITLE: Partial<Record<SweepView, string>> = {
  wizard: 'Guided cleanup',
  describe: 'Describe', interview: 'Interview', adr: 'Draft ADR',
}

// Per-category presentation (matches the imported design's palette).
export type CatId = 'missing' | 'review' | 'interview'
export const CAT: Record<CatId, { label: string; sub: string; icon: LucideIcon; color: string; bg: string; iconBg: string }> = {
  missing: { label: 'Missing info', sub: 'Titles, descriptions and technologies', icon: Wand2, color: C.accent, bg: 'rgba(88,166,255,0.16)', iconBg: 'rgba(88,166,255,0.1)' },
  review: { label: 'Deep review', sub: 'Orphans, untyped links, naming', icon: Stethoscope, color: C.warn, bg: 'rgba(249,115,22,0.16)', iconBg: 'rgba(249,115,22,0.1)' },
  interview: { label: 'Your answers', sub: 'From the interview questions', icon: MessagesSquare, color: '#a78bfa', bg: 'rgba(168,85,247,0.16)', iconBg: 'rgba(168,85,247,0.1)' },
}

// Icon + label per missing-info kind.
export const KIND: Record<GapKind, { icon: LucideIcon; label: string; prompt: string }> = {
  title: { icon: Type, label: 'title', prompt: 'Still has a placeholder name.' },
  desc: { icon: Pencil, label: 'description', prompt: 'This element has no description.' },
  tech: { icon: Cpu, label: 'technology', prompt: 'No technology is set.' },
  rel: { icon: Link2, label: 'label', prompt: 'This relationship is untyped.' },
}

export const SEV: Record<ReviewSeverity, { label: string; bg: string; color: string }> = {
  high: { label: 'High', bg: 'rgba(239,68,68,0.12)', color: C.dangerText },
  medium: { label: 'Medium', bg: 'rgba(249,115,22,0.12)', color: C.warnText },
  low: { label: 'Low', bg: 'rgba(132,141,151,0.14)', color: '#9aa3ad' },
}

// Instruction reused to draft technologies for the missing-info "tech" gaps.
export const TECH_INSTRUCTION = 'Set a plausible technology for every container and component that currently has none, inferred from its name, description, and the rest of the model. Only set technology — do not rename, add, or remove anything.'

/** How the user chose to fix a finding: `idx` indexes its options, or -1 = "Other"
 *  (a free-text instruction in `other`, run through planEdit at apply time). */
export interface FindingChoice { idx: number; other: string }

/** The candidate fixes for a finding: its explicit `options`, or a single option
 *  synthesized from its `operations` when the model didn't break out alternatives. */
export function findingOptions(f: ReviewFinding): ReviewFixOption[] {
  if (f.options?.length) return f.options
  return f.operations?.length ? [{ label: f.suggestion, operations: f.operations }] : []
}

// One applied change in the guided flow's revert ledger. We store the forward ops
// (not an inverse): revert rebuilds the model by replaying the kept entries' ops on
// top of the pre-sweep baseline, so reversal is always exact regardless of op kind.
export interface LedgerEntry { key: string; label: string; detail: string; cat: CatId; ops: EditOp[] }

/** The element + relationship ids a view shows — the scope set for "this view".
 *  `undefined` when there's no view (treated as whole-model). */
export function viewScopeIds(view: View | undefined): ReadonlySet<string> | undefined {
  if (!view) return undefined
  return new Set<string>([...view.elements.map((e) => e.id), ...view.relationships.map((r) => r.id)])
}
