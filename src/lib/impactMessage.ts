import type { CascadeImpact } from '@/store/workspace-helpers'

function pluralize(count: number, singular: string, plural = singular + 's'): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Build the body of the confirm-delete dialog for a model-level delete.
 * Always opens with the destructive verb; only adds the "This will also..."
 * clause when there's actual cascade scope. Pure — no DOM, no store reads.
 */
export function formatImpactSummary(impact: CascadeImpact): string {
  const head = impact.elementCount === 1 && impact.elementNames.length === 1
    ? `Delete "${impact.elementNames[0]}" from the model?`
    : `Delete ${impact.elementCount} elements from the model?`

  const clauses: string[] = []
  if (impact.descendantContainers > 0) clauses.push(pluralize(impact.descendantContainers, 'container'))
  if (impact.descendantComponents > 0) clauses.push(pluralize(impact.descendantComponents, 'component'))
  if (impact.relationships > 0) clauses.push(pluralize(impact.relationships, 'relationship'))
  if (impact.scopedViews > 0) clauses.push(pluralize(impact.scopedViews, 'dependent view'))

  if (clauses.length === 0) return head

  let tail: string
  if (clauses.length === 1) tail = clauses[0]
  else if (clauses.length === 2) tail = `${clauses[0]} and ${clauses[1]}`
  else tail = `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`

  return `${head} This will also remove ${tail}.`
}
