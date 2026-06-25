import { Sparkles, FileText, Stethoscope, MessagesSquare, type LucideIcon } from 'lucide-react'
import type { AiFeatureId } from '@/lib/ai/types'

export interface AiFeatureMeta {
  id: AiFeatureId
  label: string
  blurb: string
  icon: LucideIcon
  /** True when the feature operates on the current model (disabled with no workspace). */
  needsWorkspace: boolean
}

// The three modes shown in the launcher and the segmented mode switcher.
// Generate + Edit are merged into "Describe" (compose); Auto-describe is folded
// into "Review". ADR is not here — it stays reachable via the command palette
// ("AI: Draft ADR…"), which routes to ADR_FEATURE / AdrBody.
export const AI_FEATURES: ReadonlyArray<AiFeatureMeta> = [
  { id: 'compose', label: 'Describe', blurb: 'Build or change the model in plain English', icon: Sparkles, needsWorkspace: false },
  { id: 'interview', label: 'Interview', blurb: 'Answer questions to fill in this view', icon: MessagesSquare, needsWorkspace: true },
  { id: 'review', label: 'Review', blurb: 'Audit, auto-fix and tidy up the model', icon: Stethoscope, needsWorkspace: true },
]

/** ADR — reachable from the command palette, not the launcher/modes. */
export const ADR_FEATURE: AiFeatureMeta = { id: 'adr', label: 'Draft ADR', blurb: 'Write a decision record', icon: FileText, needsWorkspace: false }
