import { describe, it, expect } from 'vitest'
import { detectComposeMode, isQuestion } from './composeMode'

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
    // "new architecture/diagram/system landscape" is an addition, not a replace.
    expect(detectComposeMode('Create a new system landscape for billing')).toBe('change')
    expect(detectComposeMode('Design a new architecture diagram')).toBe('change')
    // "a new model for X" without a build verb is additive ("add ...").
    expect(detectComposeMode('Add a new model for authentication to my workspace')).toBe('change')
    expect(detectComposeMode('A new model for a banking system')).toBe('change')
  })

  it('replaces the model only on an explicit start-fresh / new-model intent', () => {
    expect(detectComposeMode('Create a new system from scratch with a web app and a database')).toBe('new')
    expect(detectComposeMode('Start over with a fresh diagram')).toBe('new')
    expect(detectComposeMode('Replace my model with a microservices design')).toBe('new')
    expect(detectComposeMode('Build a brand new workspace')).toBe('new')
    expect(detectComposeMode('Create a new model for the platform')).toBe('new')
  })
})

describe('isQuestion', () => {
  it('treats a trailing question mark as a question', () => {
    expect(isQuestion('What talks to the database?')).toBe(true)
    expect(isQuestion('the API — is it externally reachable?')).toBe(true)
    expect(isQuestion('  add a cache?  ')).toBe(true) // an explicit ? wins
  })

  it('treats an opening interrogative / auxiliary as a question without a mark', () => {
    for (const q of [
      'what talks to the database', 'how does authentication work', 'which services use Postgres',
      'why is the queue there', 'does the API call Stripe', 'are there any orphaned components',
      'explain the payment flow', 'summarize the model',
    ]) expect(isQuestion(q)).toBe(true)
  })

  it('treats edit instructions as NOT questions', () => {
    for (const i of [
      'Add a Redis cache between the Web App and the database',
      'Rename the API to Gateway', 'Connect the worker to the queue',
      'Split the monolith into two services', 'remove the legacy database',
      'make the database external',
    ]) expect(isQuestion(i)).toBe(false)
    expect(isQuestion('')).toBe(false)
    expect(isQuestion('   ')).toBe(false)
  })
})
