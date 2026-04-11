import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'

describe('unknown workspace-level keyword blocks', () => {
  it('branding block is skipped without errors', () => {
    const dsl = `
workspace "Test" {
  branding {
    logo "https://example.com/logo.png"
    font "Courier New"
  }
  model {
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })

  it('terminology block is skipped without errors', () => {
    const dsl = `
workspace "Test" {
  model {
    api = softwareSystem "API"
  }
  views {}
  terminology {
    enterprise "Bank"
    person "Customer"
    softwareSystem "App"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('perspectives block parsing', () => {
  it('perspectives block in softwareSystem body is skipped without errors', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      perspectives {
        Security "A security perspective"
        Performance "A performance perspective"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems.find(s => s.name === 'API')
    expect(sys).toBeDefined()
  })

  it('perspectives block in container body is skipped without errors', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      api = container "API Container" {
        perspectives {
          Security "Secure by design"
        }
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0]?.containers.find(c => c.name === 'API Container')
    expect(container).toBeDefined()
  })
})
