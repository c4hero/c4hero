import type { ElementStatus, ModelElement, Relationship } from '@/types/model'

export interface SpotlightFilters {
  tags: string[]
  statuses: ElementStatus[]
  techs: string[]
  teams: string[]
}

export function spotlightActive(f: SpotlightFilters): boolean {
  return f.tags.length > 0 || f.statuses.length > 0 || f.techs.length > 0 || f.teams.length > 0
}

function techTokens(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
}

function matchesTechAND(tokens: Set<string>, techs: string[]): boolean {
  if (techs.length === 0) return true
  if (tokens.size === 0) return false
  for (const t of techs) {
    if (!tokens.has(t.toLowerCase())) return false
  }
  return true
}

export function isSpotlit(el: ModelElement, f: SpotlightFilters): boolean {
  if (f.tags.length > 0) {
    if (!f.tags.some((t) => el.tags.includes(t))) return false
  }
  if (f.statuses.length > 0) {
    if (!el.status || !f.statuses.includes(el.status)) return false
  }
  if (f.teams.length > 0) {
    if (!el.owner || !f.teams.includes(el.owner)) return false
  }
  if (!matchesTechAND(techTokens('technology' in el ? el.technology : undefined), f.techs)) return false
  return true
}

export function isSpotlitRel(rel: Relationship, f: SpotlightFilters): boolean {
  return matchesTechAND(techTokens(rel.technology), f.techs)
}
