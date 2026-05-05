import type { ElementStatus, ModelElement, Relationship } from '@/types/model'

export type FacetMode = 'any' | 'all'

export interface HighlightFilters {
  tags: string[]
  statuses: ElementStatus[]
  techs: string[]
  teams: string[]
  tagsMode?: FacetMode
  statusesMode?: FacetMode
  techsMode?: FacetMode
  teamsMode?: FacetMode
}

export function highlightActive(f: HighlightFilters): boolean {
  return f.tags.length > 0 || f.statuses.length > 0 || f.techs.length > 0 || f.teams.length > 0
}

export function techTokens(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
}

function matchesArray(values: string[], mode: FacetMode, contains: (needle: string) => boolean): boolean {
  if (values.length === 0) return true
  return mode === 'all' ? values.every(contains) : values.some(contains)
}

function matchesTokenSet(tokens: Set<string>, values: string[], mode: FacetMode): boolean {
  if (values.length === 0) return true
  if (tokens.size === 0) return false
  return mode === 'all'
    ? values.every((v) => tokens.has(v.toLowerCase()))
    : values.some((v) => tokens.has(v.toLowerCase()))
}

export function isHighlighted(el: ModelElement, f: HighlightFilters): boolean {
  const tagsMode = f.tagsMode ?? 'any'
  const statusesMode = f.statusesMode ?? 'any'
  const techsMode = f.techsMode ?? 'all'
  const teamsMode = f.teamsMode ?? 'any'

  if (!matchesArray(f.tags, tagsMode, (t) => el.tags.includes(t))) return false
  if (f.statuses.length > 0) {
    if (!el.status) return false
    // Status is single-valued per element. ALL semantically requires every
    // selected status to equal the element's status — only possible if a
    // single status is selected.
    if (statusesMode === 'all') {
      if (!f.statuses.every((s) => el.status === s)) return false
    } else {
      if (!f.statuses.includes(el.status)) return false
    }
  }
  if (f.teams.length > 0) {
    if (!el.owner) return false
    if (teamsMode === 'all') {
      if (!f.teams.every((t) => el.owner === t)) return false
    } else {
      if (!f.teams.includes(el.owner)) return false
    }
  }
  if (!matchesTokenSet(techTokens('technology' in el ? el.technology : undefined), f.techs, techsMode)) return false
  return true
}

export function isHighlightedRel(rel: Relationship, f: HighlightFilters): boolean {
  const techsMode = f.techsMode ?? 'all'
  return matchesTokenSet(techTokens(rel.technology), f.techs, techsMode)
}

export function pickHighlightReason(el: ModelElement, f: HighlightFilters): string | null {
  if (f.techs.length > 0) {
    const tokens = techTokens('technology' in el ? el.technology : undefined)
    const hit = f.techs.find((t) => tokens.has(t.toLowerCase()))
    if (hit) return hit
  }
  if (f.tags.length > 0) {
    const hit = f.tags.find((t) => el.tags.includes(t))
    if (hit) return hit
  }
  if (f.teams.length > 0 && el.owner && f.teams.includes(el.owner)) return el.owner
  if (f.statuses.length > 0 && el.status && f.statuses.includes(el.status)) return el.status
  return null
}
