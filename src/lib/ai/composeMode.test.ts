import { describe, it, expect } from 'vitest'
import { detectComposeMode } from './composeMode'

describe('detectComposeMode', () => {
  it('routes pure change prompts to "change"', () => {
    expect(detectComposeMode('Add a Redis cache between the Web App and the database')).toBe('change')
    expect(detectComposeMode('Rename the API to Gateway and connect it to the queue')).toBe('change')
    expect(detectComposeMode('Add a new cache in front of the database')).toBe('change') // "add a new" is still a change
  })

  it('routes clear build-new prompts to "new" even when they also describe contents', () => {
    expect(detectComposeMode('Build a new payments platform and add a Postgres database connected to the API')).toBe('new')
    expect(detectComposeMode('Create a new system from scratch with a web app and a database')).toBe('new')
    expect(detectComposeMode('Design a new architecture for an ordering service')).toBe('new')
    expect(detectComposeMode('A new model for a banking system')).toBe('new')
  })

  it('treats an unambiguous build (no change verbs) as "new"', () => {
    expect(detectComposeMode('A payments platform with a web app, an API and a database')).toBe('new')
  })

  it('does NOT treat "change to a new architecture" as new (would replace the workspace — data loss)', () => {
    expect(detectComposeMode('Update my model to a new architecture')).toBe('change')
    expect(detectComposeMode('Migrate to a new microservices architecture')).toBe('change')
    expect(detectComposeMode('Rename the service and move it to a new layer')).toBe('change')
  })

  it('defaults to "change" when ambiguous', () => {
    expect(detectComposeMode('the database')).toBe('change')
  })
})
