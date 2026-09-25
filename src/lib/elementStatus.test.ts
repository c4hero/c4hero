import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_ELEMENT_STATUSES, MAX_STATUS_LENGTH,
  isBuiltInElementStatus, isElementStatusValue, normalizeElementStatus,
  statusColor, parseCustomStatuses, statusesInWorkspace, elementStatusVocabulary,
} from './elementStatus'
import type { Workspace } from '@/types/model'

function ws(statuses: (string | undefined)[]): Workspace {
  return {
    model: {
      people: statuses.map((status, i) => ({
        id: `p${i}`, type: 'person' as const, name: `P${i}`, tags: [], properties: {},
        ...(status === undefined ? {} : { status }),
      })),
      softwareSystems: [], relationships: [], groups: [],
    },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      dynamicViews: [], deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  } as unknown as Workspace
}

describe('built-ins', () => {
  it('ships the four documented lifecycle values, in order', () => {
    expect(BUILT_IN_ELEMENT_STATUSES).toEqual(['Live', 'Planned', 'Deprecated', 'Removed'])
  })

  it('recognises only those four as built-in', () => {
    for (const s of BUILT_IN_ELEMENT_STATUSES) expect(isBuiltInElementStatus(s)).toBe(true)
    expect(isBuiltInElementStatus('Beyond MVP')).toBe(false)
    expect(isBuiltInElementStatus('live')).toBe(false)
  })
})

describe('isElementStatusValue / normalizeElementStatus', () => {
  it('accepts any non-blank, single-line, bounded string', () => {
    expect(isElementStatusValue('Live')).toBe(true)
    expect(isElementStatusValue('Someday / maybe')).toBe(true)
    expect(isElementStatusValue('x'.repeat(MAX_STATUS_LENGTH))).toBe(true)
  })

  it('rejects values that could not round-trip through the DSL', () => {
    expect(isElementStatusValue('')).toBe(false)
    expect(isElementStatusValue('   ')).toBe(false)
    expect(isElementStatusValue('one\ntwo')).toBe(false)
    expect(isElementStatusValue('one\rtwo')).toBe(false)
    expect(isElementStatusValue('x'.repeat(MAX_STATUS_LENGTH + 1))).toBe(false)
    expect(isElementStatusValue(42)).toBe(false)
    expect(isElementStatusValue(undefined)).toBe(false)
  })

  it('trims so one spelling cannot enter the vocabulary twice', () => {
    expect(normalizeElementStatus('  Beyond MVP  ')).toBe('Beyond MVP')
    expect(normalizeElementStatus('   ')).toBeUndefined()
    expect(normalizeElementStatus(null)).toBeUndefined()
  })
})

describe('statusColor', () => {
  it('reads the themeable custom property for a built-in', () => {
    expect(statusColor('Live')).toBe('var(--color-status-live)')
    expect(statusColor('Deprecated')).toBe('var(--color-status-deprecated)')
  })

  it('derives a stable colour for a custom status', () => {
    const first = statusColor('Beyond MVP')
    expect(first).toMatch(/^hsl\(\d+ 65% 58%\)$/)
    expect(statusColor('Beyond MVP')).toBe(first)
  })

  it('gives two different custom statuses different colours', () => {
    expect(statusColor('Beyond MVP')).not.toBe(statusColor('Someday / maybe'))
  })
})

describe('parseCustomStatuses', () => {
  it('splits on commas and newlines and trims', () => {
    expect(parseCustomStatuses('Decisions deferred, Beyond MVP\nSomeday / maybe'))
      .toEqual(['Decisions deferred', 'Beyond MVP', 'Someday / maybe'])
  })

  it('drops blanks, duplicates and built-ins', () => {
    expect(parseCustomStatuses('Live, , Proposed, Proposed, Removed')).toEqual(['Proposed'])
  })

  it('drops a value past the length cap rather than truncating it', () => {
    expect(parseCustomStatuses('x'.repeat(MAX_STATUS_LENGTH + 1))).toEqual([])
  })
})

describe('statusesInWorkspace', () => {
  it('collects the statuses actually in use, first-seen order, deduped', () => {
    expect(statusesInWorkspace(ws(['Beyond MVP', undefined, 'Live', 'Beyond MVP'])))
      .toEqual(['Beyond MVP', 'Live'])
  })

  it('is empty for no workspace', () => {
    expect(statusesInWorkspace(null)).toEqual([])
  })
})

describe('elementStatusVocabulary', () => {
  it('is the built-ins alone by default', () => {
    expect(elementStatusVocabulary([], null)).toEqual(['Live', 'Planned', 'Deprecated', 'Removed'])
  })

  it('appends declared extras after the built-ins', () => {
    expect(elementStatusVocabulary(['Beyond MVP'], null))
      .toEqual(['Live', 'Planned', 'Deprecated', 'Removed', 'Beyond MVP'])
  })

  it('picks up a status the workspace uses but nobody declared', () => {
    expect(elementStatusVocabulary([], ws(['Awaiting sign-off'])))
      .toEqual(['Live', 'Planned', 'Deprecated', 'Removed', 'Awaiting sign-off'])
  })

  it('lists a declared status once even when the workspace also uses it', () => {
    expect(elementStatusVocabulary(['Beyond MVP'], ws(['Beyond MVP', 'Live'])))
      .toEqual(['Live', 'Planned', 'Deprecated', 'Removed', 'Beyond MVP'])
  })
})
