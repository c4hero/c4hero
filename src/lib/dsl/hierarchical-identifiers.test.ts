/**
 * Hierarchical (dotted) identifiers — `mpng.gatewayApi`,
 * `pathways.navigatorApi.jwksController`.
 *
 * Qualified identifiers are the normal way to write cross-system container and
 * component relationships in Structurizr DSL. Before these tests existed the
 * parser recognised a relationship only when an ARROW immediately followed the
 * source token, so every dotted-source statement fell through to the
 * "unknown directive" path and was discarded without an error, and dotted
 * destinations collapsed to their parent element while the remaining segment
 * ate the description argument.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'

describe('qualified relationship endpoints', () => {
    const dsl = `workspace "w" {
    !identifiers hierarchical
    model {
        mpng = softwareSystem "MPNG" {
            gatewayApi = container "MPNG Gateway API"
        }
        pathways = softwareSystem "Pathways" {
            navigatorApi = container "PathwayNavigator API" {
                jwksController = component "JWKS Controller"
            }
        }
        engineer = person "Engineer"

        mpng.gatewayApi -> pathways.navigatorApi "Update and Retrieve Student Pathway" "REST"
        engineer -> pathways.navigatorApi.jwksController "Sends data to"
    }
}`

    it('resolves both endpoints to container ids and keeps the description', () => {
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)

        const rel = workspace.model.relationships[0]
        expect(rel.sourceId).toBe('gatewayApi')
        expect(rel.destinationId).toBe('navigatorApi')
        expect(rel.description).toBe('Update and Retrieve Student Pathway')
        expect(rel.technology).toBe('REST')
    })

    it('resolves three-level references', () => {
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)

        const rel = workspace.model.relationships[1]
        expect(rel.sourceId).toBe('engineer')
        expect(rel.destinationId).toBe('jwksController')
        expect(rel.description).toBe('Sends data to')
    })

    it('does not collapse a dotted destination to its parent, nor eat the description', () => {
        const { workspace, errors } = parseDSL(`workspace "w" {
    model {
        student = person "Student"
        linkPlayer = softwareSystem "Link Player" {
            linkPlayerApp = container "Link Player App"
        }
        student -> linkPlayer.linkPlayerApp "URL Redirection"
    }
}`)
        expect(errors).toHaveLength(0)
        const rel = workspace.model.relationships[0]
        expect(rel.destinationId).toBe('linkPlayerApp')
        expect(rel.destinationId).not.toBe('linkPlayer')
        expect(rel.description).toBe('URL Redirection')
    })

    it('resolves a qualified reference by display name when the element has no variable', () => {
        const { workspace, errors } = parseDSL(`workspace "w" {
    model {
        person "Student"
        softwareSystem "LinkPlayer" {
            container "Player"
        }
        Student -> LinkPlayer.Player "Uses"
    }
}`)
        expect(errors).toHaveLength(0)
        const containerId = workspace.model.softwareSystems[0].containers[0].id
        expect(workspace.model.relationships[0].destinationId).toBe(containerId)
    })
})

describe('duplicate variable names across scopes', () => {
    // Legal with hierarchical identifiers, and common in generated exports:
    // two systems both declaring a `gatewayApi` container. Element ids must
    // stay unique, and each qualified reference must bind to its own scope.
    const dsl = `workspace "w" {
    !identifiers hierarchical
    model {
        ctk = softwareSystem "CTK" {
            gatewayApi = container "CTK Gateway API"
        }
        mpng = softwareSystem "MPNG" {
            gatewayApi = container "MPNG Gateway API"
        }
        mpng.gatewayApi -> ctk.gatewayApi "Calls"
    }
}`

    it('gives each declaration a distinct id', () => {
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)

        const ctkContainer = workspace.model.softwareSystems[0].containers[0]
        const mpngContainer = workspace.model.softwareSystems[1].containers[0]
        expect(ctkContainer.id).toBe('gatewayApi')
        expect(mpngContainer.id).toBe('mpng_gatewayApi')
        expect(mpngContainer.id).not.toBe(ctkContainer.id)
    })

    it('binds each endpoint to the container in its own scope', () => {
        const { workspace } = parseDSL(dsl)
        const rel = workspace.model.relationships[0]
        expect(rel.sourceId).toBe('mpng_gatewayApi')
        expect(rel.destinationId).toBe('gatewayApi')
    })
})

describe('qualified view scopes', () => {
    const dsl = `workspace "w" {
    !identifiers hierarchical
    model {
        pathways = softwareSystem "Pathways" {
            navigatorApi = container "PathwayNavigator API" {
                jwksController = component "JWKS Controller"
                jwksManager = component "JWKS Manager"
            }
        }
        pathways.navigatorApi.jwksController -> pathways.navigatorApi.jwksManager "Delegates to"
    }
    views {
        component pathways.navigatorApi "PathwayNavigatorComponents" "PathwayNavigator API Component Diagram" {
            include *
            autolayout lr
        }
    }
}`

    it('binds containerId to the container and keeps the declared key and name', () => {
        const { workspace, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)

        const view = workspace.views.componentViews[0]
        expect(view.containerId).toBe('navigatorApi')
        expect(view.key).toBe('PathwayNavigatorComponents')
        expect(view.autoKey).toBeUndefined()
        expect(view.description).toBe('PathwayNavigator API Component Diagram')
    })

    it('resolves the scoped container components and their edges', () => {
        const { workspace } = parseDSL(dsl)
        const view = workspace.views.componentViews[0]
        expect(view.elements.map(e => e.id).sort()).toEqual(['jwksController', 'jwksManager'])
        expect(view.relationships).toHaveLength(1)
    })

    it('accepts qualified refs in include and exclude', () => {
        const { workspace, errors } = parseDSL(`workspace "w" {
    model {
        mpng = softwareSystem "MPNG" {
            studentApp = container "Student App"
            educatorApp = container "Educator App"
        }
    }
    views {
        container mpng "Key" {
            include mpng.studentApp mpng.educatorApp
            exclude mpng.educatorApp
        }
    }
}`)
        expect(errors).toHaveLength(0)
        expect(workspace.views.containerViews[0].elements.map(e => e.id)).toEqual(['studentApp'])
    })
})

describe('element expressions still parse (regression guard)', () => {
    const model = `    model {
        mpng = softwareSystem "MPNG" {
            studentApp = container "Student App" {
                contentPlayer = component "Content Player"
            }
            educatorApp = container "Educator App"
        }
        ctk = softwareSystem "CTK" {
            reader = container "CTK Reader"
        }
    }`

    it('expands element.type==container', () => {
        const { workspace, errors } = parseDSL(`workspace "w" {
${model}
    views {
        container mpng "Key" {
            include element.type==container
        }
    }
}`)
        expect(errors).toHaveLength(0)
        expect(workspace.views.containerViews[0].elements.map(e => e.id).sort())
            .toEqual(['educatorApp', 'reader', 'studentApp'])
    })

    it('expands element.parent==<ref>', () => {
        const { workspace, errors } = parseDSL(`workspace "w" {
${model}
    views {
        container mpng "Key" {
            include element.parent==mpng
        }
    }
}`)
        expect(errors).toHaveLength(0)
        expect(workspace.views.containerViews[0].elements.map(e => e.id).sort())
            .toEqual(['educatorApp', 'studentApp'])
    })

    it('accepts a qualified value in element.parent==<ref>', () => {
        const { workspace, errors } = parseDSL(`workspace "w" {
${model}
    views {
        component mpng.studentApp "Key" {
            include element.parent==mpng.studentApp
        }
    }
}`)
        expect(errors).toHaveLength(0)
        expect(workspace.views.componentViews[0].elements.map(e => e.id)).toEqual(['contentPlayer'])
    })
})

describe('unresolved references are reported, not swallowed', () => {
    it('reports an unresolved qualified relationship source with line and column', () => {
        const { errors } = parseDSL(`workspace "w" {
    model {
        ctk = softwareSystem "CTK" {
            reader = container "CTK Reader"
        }
        mpng.gatewayApi -> ctk.reader "Calls"
    }
}`)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("Unresolved reference: 'mpng.gatewayApi'")
        expect(errors[0].line).toBe(6)
        expect(errors[0].column).toBe(9)
    })

    it('reports an unresolved qualified relationship destination', () => {
        const { errors } = parseDSL(`workspace "w" {
    model {
        ctk = softwareSystem "CTK" {
            reader = container "CTK Reader"
        }
        ctk.reader -> ctk.missingContainer "Calls"
    }
}`)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("Unresolved reference: 'ctk.missingContainer'")
        expect(errors[0].line).toBe(6)
    })

    it('reports an unresolved qualified view scope', () => {
        const { errors } = parseDSL(`workspace "w" {
    model {
        ctk = softwareSystem "CTK"
    }
    views {
        component ctk.missingContainer "Key" {
            include *
        }
    }
}`)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("Unresolved reference: 'ctk.missingContainer'")
        expect(errors[0].line).toBe(6)
    })

    it('reports a dangling qualified reference in the model body', () => {
        const { errors } = parseDSL(`workspace "w" {
    model {
        ctk = softwareSystem "CTK"
        ctk.nothingHere
    }
}`)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("Unresolved reference: 'ctk.nothingHere'")
    })
})

describe('!identifiers hierarchical', () => {
    it('is honoured rather than swallowed, and qualified refs win over bare ones', () => {
        // Both systems declare `api`; the bare name is ambiguous, so the
        // qualified path must decide which one a reference means.
        const { workspace, errors } = parseDSL(`workspace "w" {
    !identifiers hierarchical
    model {
        a = softwareSystem "A" {
            api = container "A API"
        }
        b = softwareSystem "B" {
            api = container "B API"
        }
        a.api -> b.api "Calls"
    }
}`)
        expect(errors).toHaveLength(0)
        const rel = workspace.model.relationships[0]
        expect(workspace.model.softwareSystems[0].containers[0].id).toBe(rel.sourceId)
        expect(workspace.model.softwareSystems[1].containers[0].id).toBe(rel.destinationId)
    })
})

describe('roundtrip', () => {
    it('is stable for DSL written with qualified identifiers', () => {
        const source = `workspace "w" {
    !identifiers hierarchical
    model {
        engineer = person "Engineer"
        ctk = softwareSystem "CTK" {
            gatewayApi = container "CTK Gateway API"
        }
        mpng = softwareSystem "MPNG" {
            gatewayApi = container "MPNG Gateway API" {
                handler = component "Handler"
            }
        }
        mpng.gatewayApi -> ctk.gatewayApi "Calls" "REST"
        engineer -> mpng.gatewayApi.handler "Maintains"
    }
    views {
        component mpng.gatewayApi "GatewayComponents" {
            include *
        }
    }
}`
        const first = parseDSL(source)
        expect(first.errors).toHaveLength(0)

        const emitted = parseDSL(serializeDSL(first.workspace))
        expect(emitted.errors).toHaveLength(0)
        expect(serializeDSL(emitted.workspace)).toBe(serializeDSL(first.workspace))

        // Endpoints survive the roundtrip bound to the same elements.
        const before = first.workspace.model.relationships.map(r => [r.sourceId, r.destinationId, r.description])
        const after = emitted.workspace.model.relationships.map(r => [r.sourceId, r.destinationId, r.description])
        expect(after).toEqual(before)
        expect(emitted.workspace.views.componentViews[0].containerId)
            .toBe(first.workspace.views.componentViews[0].containerId)
    })
})
