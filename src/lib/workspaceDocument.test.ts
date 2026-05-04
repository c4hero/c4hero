import { describe, expect, it } from 'vitest'
import { parseWorkspaceDocument } from './workspaceDocument'

const BASIC_DSL = `
workspace {
  model {
    user = person "User"
  }
  views {
    systemLandscape "Landscape" {
      include *
    }
  }
}
`

describe('parseWorkspaceDocument', () => {
  it('uses the fallback name when the DSL workspace has no name', () => {
    const { workspace, errors } = parseWorkspaceDocument({
      content: BASIC_DSL,
      fallbackName: 'imported-workspace',
    })

    expect(errors).toEqual([])
    expect(workspace.name).toBe('imported-workspace')
  })

  it('applies valid sidecar data after parsing DSL', () => {
    const { workspace } = parseWorkspaceDocument({
      content: BASIC_DSL,
      sidecarJson: JSON.stringify({
        version: 1,
        elements: {
          user: { status: 'Deprecated', owner: 'Platform Team' },
        },
      }),
    })

    expect(workspace.model.people[0]).toMatchObject({
      id: 'user',
      status: 'Deprecated',
      owner: 'Platform Team',
    })
  })

  it('ignores invalid sidecar JSON and still returns the parsed workspace', () => {
    const { workspace } = parseWorkspaceDocument({
      content: BASIC_DSL,
      sidecarJson: JSON.stringify({ version: 2 }),
    })

    expect(workspace.model.people[0].id).toBe('user')
    expect(workspace.model.people[0].status).toBeUndefined()
  })
})
