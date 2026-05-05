import { describe, expect, it } from 'vitest'
import { validateScope } from './scopeValidation'
import type { SoftwareSystem, Workspace } from '@/types/model'

function system(id: string, name: string, containerIds: string[] = []): SoftwareSystem {
  return {
    id,
    type: 'softwareSystem',
    name,
    tags: ['Element', 'Software System'],
    properties: {},
    containers: containerIds.map((containerId) => ({
      id: containerId,
      type: 'container',
      name: containerId,
      tags: ['Element', 'Container'],
      properties: {},
      components: [],
    })),
  }
}

function workspace(systems: SoftwareSystem[]): Workspace {
  return {
    name: 'Test',
    scope: 'softwaresystem',
    model: {
      people: [],
      softwareSystems: systems,
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('validateScope', () => {
  it('allows a software-system scoped workspace to show multiple software systems', () => {
    const violations = validateScope(workspace([
      system('science', 'Science', ['science-api']),
      system('platform', 'Platform'),
    ]))

    expect(violations).toHaveLength(0)
  })

  it('explains that multiple system internals, not multiple context systems, violate software-system scope', () => {
    const violations = validateScope(workspace([
      system('science', 'Science', ['science-api']),
      system('platform', 'Platform', ['platform-api']),
    ]))

    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('System Context views can show multiple software systems')
    expect(violations[0].message).toContain('Found internals for 2: Science, Platform')
  })
})
