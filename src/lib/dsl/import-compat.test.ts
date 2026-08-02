// Import back-compat tests: the parser must accept the Structurizr-valid
// encodings the serializer starts emitting (an `External` tag plus reserved
// `properties { }` keys) *without* losing support for the legacy element/
// relationship keywords (`location`, bare `owner`, bare `status`, bare
// `lineStyle`, bare `interactionStyle`) that older c4hero DSL files use.
import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'

describe('properties block: owner', () => {
    it('sets owner on a person and leaves properties empty', () => {
        const dsl = `
workspace {
  model {
    alice = person "Alice" {
      properties {
        "owner" "Platform Team"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const alice = workspace.model.people[0]
        expect(alice.owner).toBe('Platform Team')
        expect(alice.properties).toEqual({})
    })

    it('sets owner on a softwareSystem and leaves properties empty', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      properties {
        "owner" "Backend Team"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const api = workspace.model.softwareSystems[0]
        expect(api.owner).toBe('Backend Team')
        expect(api.properties).toEqual({})
    })

    it('sets owner on a container and leaves properties empty', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      web = container "Web App" "" "" {
        properties {
          "owner" "Web Team"
        }
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const web = workspace.model.softwareSystems[0].containers[0]
        expect(web.owner).toBe('Web Team')
        expect(web.properties).toEqual({})
    })

    it('sets owner on a component and leaves properties empty', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      web = container "Web App" {
        auth = component "Auth Service" {
          properties {
            "owner" "Security Team"
          }
        }
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const auth = workspace.model.softwareSystems[0].containers[0].components[0]
        expect(auth.owner).toBe('Security Team')
        expect(auth.properties).toEqual({})
    })
})

describe('properties block: c4hero.status', () => {
    it('sets status from a valid c4hero.status value and leaves properties empty', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      properties {
        "c4hero.status" "Deprecated"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const api = workspace.model.softwareSystems[0]
        expect(api.status).toBe('Deprecated')
        expect(api.properties).toEqual({})
    })

    it('leaves an invalid c4hero.status value as a plain property and does not set status', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      properties {
        "c4hero.status" "Bogus"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const api = workspace.model.softwareSystems[0]
        expect(api.status).toBeUndefined()
        expect(api.properties).toEqual({ 'c4hero.status': 'Bogus' })
    })
})

describe('relationship properties block: c4hero.lineStyle and c4hero.interactionStyle', () => {
    it('sets lineStyle and interactionStyle and leaves properties empty', () => {
        const dsl = `
workspace {
  model {
    u = person "User"
    api = softwareSystem "API"
    u -> api "Uses" {
      properties {
        "c4hero.lineStyle" "Straight"
        "c4hero.interactionStyle" "Asynchronous"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const rel = workspace.model.relationships[0]
        expect(rel.lineStyle).toBe('Straight')
        expect(rel.interactionStyle).toBe('Asynchronous')
        expect(rel.properties).toEqual({})
    })

    it('leaves invalid lineStyle/interactionStyle values as plain properties', () => {
        const dsl = `
workspace {
  model {
    u = person "User"
    api = softwareSystem "API"
    u -> api "Uses" {
      properties {
        "c4hero.lineStyle" "Wobbly"
        "c4hero.interactionStyle" "Telepathic"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const rel = workspace.model.relationships[0]
        expect(rel.lineStyle).toBeUndefined()
        expect(rel.interactionStyle).toBeUndefined()
        expect(rel.properties).toEqual({
            'c4hero.lineStyle': 'Wobbly',
            'c4hero.interactionStyle': 'Telepathic',
        })
    })
})

describe('External tag import: person/softwareSystem', () => {
    it('inline positional tags argument sets location External and drops the tag', () => {
        const dsl = `
workspace {
  model {
    alice = person "Alice" "" "External"
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const alice = workspace.model.people[0]
        expect(alice.location).toBe('External')
        expect(alice.tags).not.toContain('External')
    })

    it('a "tags" statement inside a softwareSystem block sets location External and drops the tag', () => {
        const dsl = `
workspace {
  model {
    ext = softwareSystem "External Payments" {
      tags "External"
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const ext = workspace.model.softwareSystems[0]
        expect(ext.location).toBe('External')
        expect(ext.tags).not.toContain('External')
    })

    it('a "tags" statement inside a person block sets location External and drops the tag', () => {
        const dsl = `
workspace {
  model {
    alice = person "Alice" {
      tags "External"
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const alice = workspace.model.people[0]
        expect(alice.location).toBe('External')
        expect(alice.tags).not.toContain('External')
    })

    it('an explicit "location Internal" keyword wins over an External tag in the same block', () => {
        const dsl = `
workspace {
  model {
    alice = person "Alice" {
      location Internal
      tags "External"
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const alice = workspace.model.people[0]
        expect(alice.location).toBe('Internal')
    })
})

describe('External tag import: container/component keep it as a plain tag', () => {
    it('a container tagged External keeps the tag and gains no location field', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      web = container "Web App" "" "" "External"
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const web = workspace.model.softwareSystems[0].containers[0]
        expect(web.tags).toContain('External')
        // Container has no `location` field on the model type; assert nothing
        // resembling one leaked onto the parsed object.
        expect('location' in web).toBe(false)
    })

    it('a component tagged External keeps the tag', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      web = container "Web App" {
        auth = component "Auth Service" "" "" "External"
      }
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        const auth = workspace.model.softwareSystems[0].containers[0].components[0]
        expect(auth.tags).toContain('External')
        expect('location' in auth).toBe(false)
    })
})

describe('legacy keyword back-compat', () => {
    it('still parses "location External"', () => {
        const dsl = `
workspace {
  model {
    alice = person "Alice" {
      location External
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        expect(workspace.model.people[0].location).toBe('External')
    })

    it('still parses bare "owner"', () => {
        const dsl = `
workspace {
  model {
    alice = person "Alice" {
      owner "Platform Team"
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        expect(workspace.model.people[0].owner).toBe('Platform Team')
    })

    it('still parses bare "status"', () => {
        const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      status Live
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        expect(workspace.model.softwareSystems[0].status).toBe('Live')
    })

    it('still parses bare "lineStyle"', () => {
        const dsl = `
workspace {
  model {
    u = person "User"
    api = softwareSystem "API"
    u -> api "Uses" {
      lineStyle Orthogonal
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        expect(workspace.model.relationships[0].lineStyle).toBe('Orthogonal')
    })

    it('still parses bare "interactionStyle"', () => {
        const dsl = `
workspace {
  model {
    u = person "User"
    api = softwareSystem "API"
    u -> api "Uses" {
      interactionStyle Synchronous
    }
  }
  views {}
}
`
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toEqual([])
        expect(workspace.model.relationships[0].interactionStyle).toBe('Synchronous')
    })
})
