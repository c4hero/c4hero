import { Type, Pencil, Cpu, Link2, type LucideIcon } from 'lucide-react'
import type { View } from '@/types/model'
import type {
  AiFeatureId, GapKind, ReviewSeverity, ReviewFinding, EditOp,
} from '@/lib/ai'
import { C } from './aiTheme'

// Shared vocabulary for the assistant: the view enum the panel navigates, the
// per-kind / per-severity presentation maps, and the small pure helpers over
// findings and view scope. Both AiPanel (the controller) and the Chat/Review
// bodies read from here.

export type AiView = 'chat' | 'review' | 'interview' | 'adr'

export const FEATURE_TO_VIEW: Record<AiFeatureId, AiView> = {
  compose: 'chat', interview: 'interview', review: 'review', adr: 'adr',
}

export const VIEW_TITLE: Partial<Record<AiView, string>> = {
  interview: 'Interview', adr: 'Draft ADR',
}

// Icon + label per missing-info kind.
export const KIND: Record<GapKind, { icon: LucideIcon; label: string }> = {
  title: { icon: Type, label: 'title' },
  desc: { icon: Pencil, label: 'description' },
  tech: { icon: Cpu, label: 'technology' },
  rel: { icon: Link2, label: 'label' },
}

export const SEV: Record<ReviewSeverity, { label: string; color: string }> = {
  high: { label: 'High', color: C.dangerText },
  medium: { label: 'Medium', color: '#fdba74' },
  low: { label: 'Low', color: '#9aa3ad' },
}

// Instruction reused to draft technologies for the missing-info "tech" gaps.
export const TECH_INSTRUCTION = 'Set a plausible technology for every container and component that currently has none, inferred from its name, description, and the rest of the model. Only set technology — do not rename, add, or remove anything.'

// One applied change in the review worklist's revert ledger. We store the forward
// ops (not an inverse): revert rebuilds the model by replaying the kept entries' ops
// on top of the pre-review baseline, so reversal is always exact regardless of op kind.
export interface LedgerEntry { key: string; label: string; detail: string; ops: EditOp[] }

/** One (still-streaming or settled) deep-review finding in the Review tab,
 *  tagged with the scope it was generated for so the scope toggle can filter.
 *  For a 'view' finding, `viewKey` records which view it was generated on, so
 *  switching views doesn't show one view's findings against another. */
export interface FindingItem { key: string; scope: 'view' | 'model'; viewKey?: string; finding: ReviewFinding }

/** What "Undo last" pops: an apply (revert the ledger entry) or a skip/dismiss
 *  (restore the row). */
export interface ReviewUndo { type: 'apply' | 'skip'; key: string }

/** The element + relationship ids a view shows — the scope set for "this view".
 *  `undefined` when there's no view (treated as whole-model). */
export function viewScopeIds(view: View | undefined): ReadonlySet<string> | undefined {
  if (!view) return undefined
  return new Set<string>([...view.elements.map((e) => e.id), ...view.relationships.map((r) => r.id)])
}
