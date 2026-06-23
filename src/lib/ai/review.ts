import type { ReviewResult, ReviewFinding } from './types'

// Pure helpers for the structured Review result: a markdown rendering (for the
// Copy/share button) and the actionable-finding check. Unit-tested.

/** True when a finding carries concrete operations that can be applied. */
export function isActionable(finding: ReviewFinding): boolean {
  return Array.isArray(finding.operations) && finding.operations.length > 0
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

/** Findings sorted by severity (high → low), preserving order within a tier. */
export function sortedFindings(result: ReviewResult): ReviewFinding[] {
  return result.findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const sev = (SEVERITY_ORDER[a.finding.severity] ?? 3) - (SEVERITY_ORDER[b.finding.severity] ?? 3)
      return sev !== 0 ? sev : a.index - b.index
    })
    .map((x) => x.finding)
}

/** Render the findings as Markdown for copying into a PR, issue, or notes. */
export function findingsToMarkdown(result: ReviewResult): string {
  if (result.findings.length === 0) return '# Architecture review\n\nNo issues found.'
  const lines: string[] = ['# Architecture review', '']
  for (const f of sortedFindings(result)) {
    lines.push(`## [${f.severity.toUpperCase()}] ${f.title}`)
    lines.push(`*${f.category}*${isActionable(f) ? ' · auto-fixable' : ''}`)
    lines.push('')
    lines.push(f.detail)
    lines.push('')
    lines.push(`**Suggestion:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
