import { describe, it, expect } from 'vitest'
import { isHighlighted, isHighlightedRel, highlightActive, pickHighlightReason, type HighlightFilters } from './highlight'
import type { Container, Person, Relationship } from '@/types/model'

const emptyFilters: HighlightFilters = { tags: [], statuses: [], techs: [], teams: [] }

const baseContainer: Container = {
  id: 'c1',
  type: 'container',
  name: 'API',
  tags: ['service', 'auth'],
  properties: {},
  status: 'Live',
  owner: 'Platform',
  technology: 'Go, Postgres, gRPC',
  components: [],
}

const noTechPerson: Person = {
  id: 'p1',
  type: 'person',
  name: 'Operator',
  tags: ['internal'],
  properties: {},
  status: 'Live',
  owner: 'Ops',
}

describe('highlightActive', () => {
  it('is false when every facet is empty', () => {
    expect(highlightActive(emptyFilters)).toBe(false)
  })
  it('is true when any facet has values', () => {
    expect(highlightActive({ ...emptyFilters, tags: ['auth'] })).toBe(true)
    expect(highlightActive({ ...emptyFilters, techs: ['Go'] })).toBe(true)
  })
})

describe('isHighlighted (AND across facets, within-semantic per facet)', () => {
  it('matches when no filters set (degenerate true — caller should gate via highlightActive)', () => {
    expect(isHighlighted(baseContainer, emptyFilters)).toBe(true)
  })

  it('tags use OR within: any selected tag suffices', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['auth', 'pii'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['pii'] })).toBe(false)
  })

  it('statuses use OR within: any selected status suffices', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, statuses: ['Live', 'Planned'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, statuses: ['Deprecated'] })).toBe(false)
  })

  it('teams use OR within over element.owner', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, teams: ['Platform'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, teams: ['Security'] })).toBe(false)
  })

  it('teams: missing owner never matches', () => {
    const noOwner = { ...baseContainer, owner: undefined }
    expect(isHighlighted(noOwner, { ...emptyFilters, teams: ['Platform'] })).toBe(false)
  })

  it('techs use AND within: every selected tech must appear', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['Go', 'Postgres'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['Go', 'Kafka'] })).toBe(false)
  })

  it('techs: element with no technology field never matches a tech filter', () => {
    expect(isHighlighted(noTechPerson, { ...emptyFilters, techs: ['Go'] })).toBe(false)
  })

  it('AND across facets: must match every active facet', () => {
    expect(isHighlighted(baseContainer, { tags: ['auth'], statuses: ['Live'], techs: ['Go'], teams: ['Platform'] })).toBe(true)
    expect(isHighlighted(baseContainer, { tags: ['auth'], statuses: ['Deprecated'], techs: [], teams: [] })).toBe(false)
  })

  it('tech tokens are normalized: case-insensitive, comma+whitespace tolerant', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['go', 'POSTGRES'] })).toBe(true)
  })
})

describe('isHighlightedRel (Tech only)', () => {
  const rel: Relationship = {
    id: 'r1',
    sourceId: 'a',
    destinationId: 'b',
    technology: 'gRPC, HTTP/2',
    tags: [],
    properties: {},
  }
  it('relationships ignore tag/status/team filters', () => {
    expect(isHighlightedRel(rel, { ...emptyFilters, tags: ['auth'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, statuses: ['Live'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, teams: ['Platform'] })).toBe(true)
  })
  it('relationships AND on tech', () => {
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC', 'HTTP/2'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC', 'Kafka'] })).toBe(false)
  })
})

describe('per-facet match modes', () => {
  it('tagsMode "all" requires every selected tag', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['service', 'auth'], tagsMode: 'all' })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['service', 'pii'], tagsMode: 'all' })).toBe(false)
  })
  it('tagsMode "any" matches when at least one selected tag is present', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['service', 'pii'], tagsMode: 'any' })).toBe(true)
  })
  it('techsMode "any" relaxes the tech AND constraint', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['Go', 'Kafka'], techsMode: 'any' })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['Kafka', 'Redis'], techsMode: 'any' })).toBe(false)
  })
  it('statusesMode "all" only matches when one status is selected', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, statuses: ['Live'], statusesMode: 'all' })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, statuses: ['Live', 'Planned'], statusesMode: 'all' })).toBe(false)
  })
  it('relationship tech mode flips between any/all', () => {
    const rel = { id: 'r', sourceId: 'a', destinationId: 'b', technology: 'gRPC, HTTP/2', tags: [], properties: {} }
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC', 'Kafka'], techsMode: 'all' })).toBe(false)
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC', 'Kafka'], techsMode: 'any' })).toBe(true)
  })
})

describe('pickHighlightReason', () => {
  it('returns null when no facet matches', () => {
    expect(pickHighlightReason(baseContainer, emptyFilters)).toBeNull()
  })

  it('priority: tech > tag > team > status when multiple match', () => {
    const filters: HighlightFilters = {
      tags: ['auth'],
      statuses: ['Live'],
      techs: ['Go'],
      teams: ['Platform'],
    }
    expect(pickHighlightReason(baseContainer, filters)).toBe('Go')
  })

  it('falls through to tag when no tech matches', () => {
    expect(pickHighlightReason(baseContainer, { ...emptyFilters, tags: ['auth'] })).toBe('auth')
  })

  it('falls through to team when only team matches', () => {
    expect(pickHighlightReason(baseContainer, { ...emptyFilters, teams: ['Platform'] })).toBe('Platform')
  })

  it('falls through to status when only status matches', () => {
    expect(pickHighlightReason(baseContainer, { ...emptyFilters, statuses: ['Live'] })).toBe('Live')
  })

  it('tech match is case-insensitive', () => {
    expect(pickHighlightReason(baseContainer, { ...emptyFilters, techs: ['go'] })).toBe('go')
  })
})
