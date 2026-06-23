import { Sparkles, Wand2, Pencil, FileText, Stethoscope, MessagesSquare, type LucideIcon } from 'lucide-react'
import type { AiFeatureId } from '@/lib/ai/types'

export interface AiFeatureMeta {
  id: AiFeatureId
  label: string
  blurb: string
  icon: LucideIcon
  /** True when the feature operates on the current model (disabled with no workspace). */
  needsWorkspace: boolean
}

export const AI_FEATURES: ReadonlyArray<AiFeatureMeta> = [
  { id: 'generate', label: 'Generate', blurb: 'Describe a system → a new C4 diagram', icon: Sparkles, needsWorkspace: false },
  { id: 'interview', label: 'Interview', blurb: 'Answer questions about this view to fill it in', icon: MessagesSquare, needsWorkspace: true },
  { id: 'edit', label: 'Edit', blurb: 'Change the model in plain English', icon: Pencil, needsWorkspace: true },
  { id: 'describe', label: 'Auto-describe', blurb: 'Fill in missing descriptions', icon: Wand2, needsWorkspace: true },
  { id: 'review', label: 'Review', blurb: 'Get an architecture critique', icon: Stethoscope, needsWorkspace: true },
  { id: 'adr', label: 'Draft ADR', blurb: 'Write a decision record', icon: FileText, needsWorkspace: false },
]
