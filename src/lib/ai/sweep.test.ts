import { describe, it, expect } from 'vitest'
import { missingInfoGaps, healthFieldCounts, gapToOp, type MissingGap } from './sweep'
import { makeWorkspace } from './testFixture'
import type { Workspace } from '@/types/model'

function emptyViews() {
  return { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } }
}

function gapOf(gaps: MissingGap[], key: string): MissingGap | undefined {
  return gaps.find((g) => g.key === key)
}

describe('missingInfoGaps', () => {
  it('enumerates desc, tech and rel gaps from the fixture', () => {
    const gaps = missingInfoGaps(makeWorkspace())
    const keys = gaps.map((g) => g.key)
    // admin (person), cart (component), db (container) have no description.
    expect(keys).toEqual(expect.arrayContaining(['desc:admin', 'desc:cart', 'desc:db']))
    // cart + db have no technology (web has React).
    expect(keys).toEqual(expect.arrayContaining(['tech:cart', 'tech:db']))
    expect(keys).not.toContain('tech:web')
    // r2 (web → db) has no description.
    expect(keys).toContain('rel:r2')
    expect(keys).not.toContain('rel:r1')
    // No empty-named elements in the fixture → no title gaps.
    expect(keys.some((k) => k.startsWith('title:'))).toBe(false)
  })

  it('labels a relationship gap as "Source → Destination"', () => {
    const gaps = missingInfoGaps(makeWorkspace())
    expect(gapOf(gaps, 'rel:r2')?.label).toBe('Web App → Database')
    expect(gapOf(gaps, 'rel:r2')?.targetKind).toBe('relationship')
  })

  it('limits gaps to the given view scope ids', () => {
    const ws = makeWorkspace()
    const ids = new Set(['web', 'db']) // web is fully filled; db is missing desc + tech
    const keys = missingInfoGaps(ws, ids).map((g) => g.key)
    expect(keys).toEqual(expect.arrayContaining(['desc:db', 'tech:db']))
    expect(keys).not.toContain('desc:cart') // out of scope
    expect(keys).not.toContain('desc:admin')
    expect(keys).not.toContain('rel:r2') // relationship not in scope
  })

  it('flags an element with a blank name as a title gap', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: '  ', description: 'x', tags: [], properties: {} }],
        softwareSystems: [], relationships: [], groups: [],
      },
      views: emptyViews(),
    }
    const titles = missingInfoGaps(ws).filter((g) => g.kind === 'title')
    expect(titles).toHaveLength(1)
    expect(titles[0]).toMatchObject({ key: 'title:p', targetId: 'p', targetKind: 'element' })
  })

  it('returns no gaps for a fully-specified model', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: 'User', description: 'A user', tags: [], properties: {} }],
        softwareSystems: [{
          id: 's', type: 'softwareSystem', name: 'Sys', description: 'sys', tags: [], properties: {},
          containers: [{ id: 'c', type: 'container', name: 'API', description: 'api', technology: 'Go', tags: [], properties: {}, components: [] }],
        }],
        relationships: [{ id: 'r', sourceId: 'p', destinationId: 'c', description: 'uses', tags: [], properties: {} }],
        groups: [],
      },
      views: emptyViews(),
    }
    expect(missingInfoGaps(ws)).toEqual([])
  })
})

describe('healthFieldCounts', () => {
  it('counts always-present fields so a gappy model never reads near 0%', () => {
    // Fixture: 6 elements, 2 relationships.
    // Always-present: 6 types + 2 endpoint pairs = 8, plus 6 filled names.
    // Fillable: 6 desc (3 filled) + 3 tech (1) + 2 rel desc (1).
    const c = healthFieldCounts(makeWorkspace())
    expect(c).toEqual({ filled: 19, total: 25, pct: 76 })
  })

  it('scopes to the given ids', () => {
    // {web, db}: 2 types + 2 names always; web desc+tech filled, db's empty.
    const c = healthFieldCounts(makeWorkspace(), new Set(['web', 'db']))
    expect(c).toEqual({ filled: 6, total: 8, pct: 75 })
  })

  it('is 100% for an empty model', () => {
    const ws: Workspace = { name: 'E', model: { people: [], softwareSystems: [], relationships: [], groups: [] }, views: emptyViews() }
    expect(healthFieldCounts(ws)).toEqual({ filled: 0, total: 0, pct: 100 })
  })
})

describe('gapToOp', () => {
  const base = { targetKind: 'element' as const, label: 'X' }
  it('maps each kind to the right operation and trims the value', () => {
    expect(gapToOp({ key: 'desc:e', kind: 'desc', targetId: 'e', ...base }, '  hello ')).toEqual({ op: 'updateElement', id: 'e', description: 'hello' })
    expect(gapToOp({ key: 'tech:e', kind: 'tech', targetId: 'e', ...base }, 'Go')).toEqual({ op: 'updateElement', id: 'e', technology: 'Go' })
    expect(gapToOp({ key: 'title:e', kind: 'title', targetId: 'e', ...base }, 'Name')).toEqual({ op: 'updateElement', id: 'e', name: 'Name' })
    expect(gapToOp({ key: 'rel:r', kind: 'rel', targetId: 'r', targetKind: 'relationship', label: 'A → B' }, 'calls')).toEqual({ op: 'updateRelationship', id: 'r', description: 'calls' })
  })
})

