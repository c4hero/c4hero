import { expect, it } from 'vitest'
import { createBigBankSample } from '@/lib/templates'
import { buildLayout, connectionsFor } from './layout'
import { relationshipRefinements, relationshipOpacity } from './relationshipReveal'

it('crossfades matching summary/detail edges and restores the summary when collapsed', () => {
  const ws = createBigBankSample(), view = ws.views.containerViews[0]
  const connections = connectionsFor(buildLayout(ws, view), ws.model.relationships, view).connections
  const refinements = relationshipRefinements(connections)
  const summary = connections.find(c => c.relationship.id === 'r16')!
  const detail = connections.find(c => c.relationship.id === 'r26')!
  for (const amount of [0, .25, .7, 1, 0]) {
    const reveal = new Map([['apiApp', amount]])
    expect(relationshipOpacity(summary, refinements, reveal)).toBeCloseTo(1 - amount)
    expect(relationshipOpacity(detail, refinements, reveal)).toBeCloseTo(amount)
  }
  expect(relationshipOpacity(summary, refinements, new Map([['apiApp', 1]]), n => n.id !== 'securityComponent')).toBe(1)
})

it('keeps distinct descriptions, technologies, directions and interaction styles', () => {
  const ws = createBigBankSample(), view = ws.views.containerViews[0]
  const base = ws.model.relationships.find(r => r.id === 'r16')!
  ws.model.relationships.push(
    { ...base, id: 'different-label', description: 'Deletes' },
    { ...base, id: 'different-tech', technology: 'HTTP' },
    { ...base, id: 'async', interactionStyle: 'Asynchronous' },
    { ...base, id: 'reverse', sourceId: base.destinationId, destinationId: base.sourceId },
  )
  for (const id of ['different-label', 'different-tech', 'async', 'reverse']) view.relationships.push({ id })
  const connections = connectionsFor(buildLayout(ws, view), ws.model.relationships, view).connections
  const refinements = relationshipRefinements(connections)
  for (const id of ['different-label', 'different-tech', 'async', 'reverse']) {
    expect(relationshipOpacity(connections.find(c => c.relationship.id === id)!, refinements, new Map([['apiApp', 1]]))).toBe(1)
  }
})
