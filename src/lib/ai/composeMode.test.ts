import { describe, it, expect } from 'vitest'
import { detectComposeMode } from './composeMode'

// detectComposeMode runs ONLY when a workspace already exists, so it defaults to
// extending ('change') and returns 'new' (which replaces the model) only on an
// explicit start-fresh / new-model intent.
describe('detectComposeMode', () => {
  it('extends the model for change prompts', () => {
    expect(detectComposeMode('Add a Redis cache between the Web App and the database')).toBe('change')
    expect(detectComposeMode('Rename the API to Gateway and connect it to the queue')).toBe('change')
    expect(detectComposeMode('Add a new cache in front of the database')).toBe('change')
    // "create a new <element>" is an addition, not a workspace replacement
    expect(detectComposeMode('Create a new reporting service that talks to the database')).toBe('change')
    expect(detectComposeMode('Build a new payments platform and add a Postgres database')).toBe('change')
    expect(detectComposeMode('A payments platform with a web app, an API and a database')).toBe('change')
  })

  it('never misreads a change as a destructive "new" (data-loss guard)', () => {
    expect(detectComposeMode('Update my model to a new architecture')).toBe('change')
    expect(detectComposeMode('Migrate to a new microservices architecture')).toBe('change')
    expect(detectComposeMode('Rename the service and move it to a new layer')).toBe('change')
  })

  it('replaces the model only on an explicit start-fresh / new-model intent', () => {
    expect(detectComposeMode('Create a new system from scratch with a web app and a database')).toBe('new')
    expect(detectComposeMode('Start over with a fresh diagram')).toBe('new')
    expect(detectComposeMode('Design a new architecture for an ordering service')).toBe('new')
    expect(detectComposeMode('A new model for a banking system')).toBe('new')
    expect(detectComposeMode('Replace my model with a microservices design')).toBe('new')
  })
})
