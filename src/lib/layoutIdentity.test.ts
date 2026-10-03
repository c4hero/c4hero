import { describe, expect, it } from 'vitest'
import type { View } from '@/types/model'
import { isStoredViewIdentity, resolveViewLayouts, viewIdentityOf } from './layoutIdentity'
import type { LayoutCandidate } from './layoutIdentity'

const view = (key: string, ids: string[], extra: Partial<View> = {}): View => ({
  type: 'container', key, autoKey: true, softwareSystemId: 'payments',
  elements: ids.map((id) => ({ id })), relationships: [], ...extra,
})
const entry = (key: string, ids: string[], identity = viewIdentityOf(view(key, []))): LayoutCandidate<string> => ({
  key, identity, elementIds: ids, value: key,
})
const matched = (views: View[], candidates: LayoutCandidate<string>[]) => {
  const byView = resolveViewLayouts(views, candidates)
  return views.map((v) => byView.get(v)?.value)
}

describe('resolveViewLayouts (TEA-345)', () => {
  it('pairs on the elements each entry holds, not the key it is filed under', () => {
    const views = [view('Containers-payments', ['api']), view('Containers-payments-2', ['api', 'db'])]
    const candidates = [entry('Containers-payments', ['api', 'db']), entry('Containers-payments-2', ['api'])]
    expect(matched(views, candidates)).toEqual(['Containers-payments-2', 'Containers-payments'])
  })

  it('declines when more entries than views leave nothing to tell them apart', () => {
    const views = [view('Containers-payments', ['api'])]
    const candidates = [entry('Containers-payments', []), entry('Containers-payments-2', [])]
    expect(matched(views, candidates)).toEqual([undefined])
  })

  it('declines a tied survivor even when one entry has its exact key', () => {
    const candidates = [entry('Containers-payments', ['api']), entry('Containers-payments-2', ['api'])]
    expect(matched([view('Containers-payments', ['api'])], candidates)).toEqual([undefined])
  })

  it('declines a single entry equally claimed by two views, even on an exact key', () => {
    const views = [view('Containers-payments', ['api']), view('Containers-payments-2', ['api', 'db'])]
    expect(matched(views, [entry('Containers-payments', ['api'])])).toEqual([undefined, undefined])
  })

  it('declines ties between distinguishable views instead of pairing by key or order', () => {
    const views = [view('Containers-payments', ['api', 'db']), view('Containers-payments-2', ['api', 'worker'])]
    const candidates = [entry('Containers-payments', ['api']), entry('Containers-payments-2', ['api'])]
    expect(matched(views, candidates)).toEqual([undefined, undefined])
  })

  it('does not let a lock-only deleted sibling displace the survivor', () => {
    const candidates = [entry('Containers-payments', []), entry('Containers-payments-2', ['api'])]
    expect(matched([view('Containers-payments', ['api'])], candidates)).toEqual(['Containers-payments-2'])
  })

  it('pairs a lone entry that holds only a lock with the lone view of its identity', () => {
    expect(matched([view('Containers-payments-2', ['api'])], [entry('Containers-payments', [])]))
      .toEqual(['Containers-payments'])
  })

  it('keeps each entry on its own key when the evidence ties', () => {
    const views = [view('Containers-payments', ['api']), view('Containers-payments-2', ['api'])]
    const candidates = [entry('Containers-payments-2', ['api']), entry('Containers-payments', ['api'])]
    expect(matched(views, candidates)).toEqual(['Containers-payments', 'Containers-payments-2'])
  })

  it('never matches an identified entry across identities, even on an exact key', () => {
    const named = view('Containers-payments', ['api'], { autoKey: undefined })
    expect(matched([view('Containers-payments', ['api'])], [entry('Containers-payments', ['api'], viewIdentityOf(named))]))
      .toEqual([undefined])
  })

  it('shares one entry between views that share an authored key', () => {
    const views = [view('Dup', ['api'], { autoKey: undefined }), view('Dup', ['db'], { autoKey: undefined })]
    expect(matched(views, [entry('Dup', ['api'], viewIdentityOf(views[0]))])).toEqual(['Dup', 'Dup'])
  })

  it('uses originalKey as an identity alias, after matching current authored keys', () => {
    const normalized = view('Billing-Context', ['api'], { autoKey: undefined, originalKey: 'Billing Context' })
    const old = entry('parked', ['api'], { type: 'container', key: 'Billing Context' })
    expect(matched([normalized], [old])).toEqual(['parked'])
    const current = entry('current', ['api'], viewIdentityOf(normalized))
    expect(matched([normalized], [old, current])).toEqual(['current'])
  })

  it('keeps an authored identity when the named view changes scope', () => {
    const named = view('Named', ['api'], { autoKey: undefined, softwareSystemId: 'billing' })
    expect(matched([named], [entry('old', ['api'], { type: 'container', key: 'Named', softwareSystemId: 'payments' })]))
      .toEqual(['old'])
  })

  it.each([
    { type: 'component' as const },
    { softwareSystemId: 'payments-2' },
    { containerId: 'api' },
    { environment: 'Production' },
  ])('keeps distinct scope identities separate: %j', extra => {
    const other = view('Containers-payments', ['api'], extra)
    expect(matched([other], [entry('Containers-payments', ['api'])])).toEqual([undefined])
  })

  it('matches an entry without an identity by key, then by the pre-normalisation key', () => {
    const views = [view('A', ['api']), view('Billing-Context', ['api'], { originalKey: 'Billing Context' })]
    const legacy = (key: string): LayoutCandidate<string> => ({ key, elementIds: [], value: key })
    expect(matched(views, [legacy('Billing Context'), legacy('A')])).toEqual(['A', 'Billing Context'])
  })
})

describe('isStoredViewIdentity', () => {
  it('accepts a sound identity and rejects anything half-built', () => {
    expect(isStoredViewIdentity({ type: 'container', softwareSystemId: 'x' })).toBe(true)
    expect(isStoredViewIdentity({ type: 'nope' })).toBe(false)
    expect(isStoredViewIdentity({ type: 'container', key: 3 })).toBe(false)
    expect(isStoredViewIdentity('container')).toBe(false)
  })
})
