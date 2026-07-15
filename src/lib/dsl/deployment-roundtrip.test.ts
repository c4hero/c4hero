import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from './index'
import type { DeploymentNode, Workspace } from '@/types/model'

// Structurizr-authored deployment DSL, adapted from the official Big Bank plc
// example — nested deployment nodes, container instances, an infrastructure
// node, instance counts, and both scoped and unscoped deployment views.
const STRUCTURIZR_DSL = `
workspace "Big Bank plc" {
    model {
        internetBankingSystem = softwareSystem "Internet Banking System" {
            webApplication = container "Web Application" "Delivers SPA" "Java and Spring MVC"
            database = container "Database" "Stores data" "Oracle" "Database"
            webApplication -> database "Reads from and writes to" "JDBC"
        }
        mainframe = softwareSystem "Mainframe Banking System" "Stores core banking information"
        webApplication -> mainframe "Uses"

        deploymentEnvironment "Live" {
            deploymentNode "AWS" "" "Amazon Web Services" {
                deploymentNode "us-east-1" "" "AWS region" {
                    lb = infrastructureNode "Load Balancer" "Routes traffic" "Elastic Load Balancer"
                    deploymentNode "Web Server" "" "Ubuntu" {
                        instances 4
                        liveWebApp = containerInstance webApplication
                    }
                    deploymentNode "Database Server" "" "Ubuntu" {
                        liveDatabase = containerInstance database
                    }
                }
            }
            deploymentNode "Big Bank plc Data Center" {
                liveMainframe = softwareSystemInstance mainframe
            }
            lb -> liveWebApp "Forwards requests to" "HTTPS"
        }
    }
    views {
        deployment internetBankingSystem "Live" "LiveDeployment" {
            include *
            autoLayout lr
        }
        deployment * "Live" "AllLiveDeployment" {
            include *
        }
    }
}
`

describe('deployment model parsing (Structurizr-authored)', () => {
  it('parses environments, nested nodes, instances, and infrastructure', () => {
    const { workspace: ws, errors } = parseDSL(STRUCTURIZR_DSL)
    expect(errors).toHaveLength(0)

    expect(ws.model.deploymentEnvironments).toHaveLength(1)
    const env = ws.model.deploymentEnvironments[0]
    expect(env.name).toBe('Live')
    expect(env.deploymentNodes).toHaveLength(2)

    const aws = env.deploymentNodes[0]
    expect(aws.name).toBe('AWS')
    expect(aws.technology).toBe('Amazon Web Services')
    expect(aws.tags).toEqual(expect.arrayContaining(['Element', 'Deployment Node']))
    expect(aws.children).toHaveLength(1)

    const region = aws.children[0]
    expect(region.name).toBe('us-east-1')
    expect(region.infrastructureNodes).toHaveLength(1)
    expect(region.infrastructureNodes[0].name).toBe('Load Balancer')
    expect(region.infrastructureNodes[0].tags).toEqual(expect.arrayContaining(['Element', 'Infrastructure Node']))
    expect(region.children).toHaveLength(2)

    const webServer = region.children[0]
    expect(webServer.name).toBe('Web Server')
    expect(webServer.instances).toBe('4')
    expect(webServer.containerInstances).toHaveLength(1)

    // Container instance resolves to the model container's id
    const webAppId = ws.model.softwareSystems[0].containers[0].id
    expect(webServer.containerInstances[0].containerId).toBe(webAppId)
    expect(webServer.containerInstances[0].tags).toContain('Container Instance')

    // Software system instance in the second top-level node
    const dataCenter = env.deploymentNodes[1]
    expect(dataCenter.softwareSystemInstances).toHaveLength(1)
    expect(dataCenter.softwareSystemInstances[0].softwareSystemId).toBe(ws.model.softwareSystems[1].id)
  })

  it('replicates model relationships between instances (implied) and keeps explicit ones', () => {
    const { workspace: ws } = parseDSL(STRUCTURIZR_DSL)
    const env = ws.model.deploymentEnvironments[0]
    const webInstance = env.deploymentNodes[0].children[0].children[0].containerInstances[0]
    const dbInstance = env.deploymentNodes[0].children[0].children[1].containerInstances[0]
    const mainframeInstance = env.deploymentNodes[1].softwareSystemInstances[0]

    // webApplication -> database replicated between their instances
    const impliedWebDb = ws.model.relationships.find(
      r => r.implied && r.sourceId === webInstance.id && r.destinationId === dbInstance.id
    )
    expect(impliedWebDb).toBeDefined()
    expect(impliedWebDb!.description).toBe('Reads from and writes to')
    expect(impliedWebDb!.technology).toBe('JDBC')

    // webApplication -> mainframe replicated container-instance -> system-instance
    const impliedWebMainframe = ws.model.relationships.find(
      r => r.implied && r.sourceId === webInstance.id && r.destinationId === mainframeInstance.id
    )
    expect(impliedWebMainframe).toBeDefined()

    // The explicit lb -> liveWebApp relationship is a normal (non-implied) relationship
    const lbId = env.deploymentNodes[0].children[0].infrastructureNodes[0].id
    const explicit = ws.model.relationships.find(
      r => r.sourceId === lbId && r.destinationId === webInstance.id
    )
    expect(explicit).toBeDefined()
    expect(explicit!.implied).toBeUndefined()
  })

  it('expands include * for a scoped deployment view to the relevant subtree', () => {
    const { workspace: ws } = parseDSL(STRUCTURIZR_DSL)
    expect(ws.views.deploymentViews).toHaveLength(2)

    const scoped = ws.views.deploymentViews[0]
    expect(scoped.key).toBe('LiveDeployment')
    expect(scoped.type).toBe('deployment')
    expect(scoped.environment).toBe('Live')
    expect(scoped.softwareSystemId).toBe(ws.model.softwareSystems[0].id)
    expect(scoped.autoLayout?.direction).toBe('LR')

    const env = ws.model.deploymentEnvironments[0]
    const ids = new Set(scoped.elements.map(e => e.id))
    // Scoped to internetBankingSystem: AWS subtree is in (its instances belong
    // to the system), the mainframe's data-center node is out.
    expect(ids.has(env.deploymentNodes[0].id)).toBe(true)
    expect(ids.has(env.deploymentNodes[0].children[0].infrastructureNodes[0].id)).toBe(true)
    expect(ids.has(env.deploymentNodes[0].children[0].children[0].containerInstances[0].id)).toBe(true)
    expect(ids.has(env.deploymentNodes[1].id)).toBe(false)

    // View relationships include the implied instance relationship and the explicit lb edge
    expect(scoped.relationships.length).toBeGreaterThanOrEqual(2)
  })

  it('expands include * for an unscoped deployment view to the whole environment', () => {
    const { workspace: ws } = parseDSL(STRUCTURIZR_DSL)
    const all = ws.views.deploymentViews[1]
    expect(all.softwareSystemId).toBeUndefined()

    const env = ws.model.deploymentEnvironments[0]
    const ids = new Set(all.elements.map(e => e.id))
    expect(ids.has(env.deploymentNodes[1].id)).toBe(true)
    expect(ids.has(env.deploymentNodes[1].softwareSystemInstances[0].id)).toBe(true)
  })

  it('records an error for a deployment view referencing an unknown environment', () => {
    const dsl = `workspace {
      model {
        a = softwareSystem "A"
      }
      views {
        deployment a "Nonexistent" "bad" {
          include *
        }
      }
    }`
    const { workspace: ws, errors } = parseDSL(dsl)
    expect(errors.some(e => e.message.includes("unknown environment 'Nonexistent'"))).toBe(true)
    // View still parses (lenient), just with nothing to show
    expect(ws.views.deploymentViews).toHaveLength(1)
    expect(ws.views.deploymentViews[0].elements).toHaveLength(0)
  })
})

describe('deployment round-trip (serialize → parse)', () => {
  function roundtrip(ws: Workspace) {
    const dsl = serializeDSL(ws)
    return { dsl, ...parseDSL(dsl) }
  }

  it('preserves the full deployment structure through serialize → parse', () => {
    const { workspace: first, errors: parseErrors } = parseDSL(STRUCTURIZR_DSL)
    expect(parseErrors).toHaveLength(0)

    const { workspace: second, errors, dsl } = roundtrip(first)
    expect(errors).toHaveLength(0)

    // Same environment/node topology
    expect(second.model.deploymentEnvironments).toHaveLength(1)
    const env1 = first.model.deploymentEnvironments[0]
    const env2 = second.model.deploymentEnvironments[0]
    expect(env2.name).toBe(env1.name)

    const flatten = (nodes: DeploymentNode[]): string[] =>
      nodes.flatMap(n => [
        `node:${n.name}:${n.technology ?? ''}:${n.instances ?? ''}`,
        ...n.infrastructureNodes.map(i => `infra:${i.name}:${i.technology ?? ''}`),
        ...n.containerInstances.map(ci => `ci:${ci.containerId}`),
        ...n.softwareSystemInstances.map(si => `si:${si.softwareSystemId}`),
        ...flatten(n.children),
      ])
    expect(flatten(env2.deploymentNodes)).toEqual(flatten(env1.deploymentNodes))

    // Ids survive because the serializer emits them as identifiers
    expect(flatten(env2.deploymentNodes).join()).toContain('ci:webApplication')

    // Implied relationships were NOT serialized as model relationships…
    expect(dsl).not.toContain('rel-implied')
    const explicitCount = (d: string) => (d.match(/->/g) ?? []).length
    // …but ARE re-derived on the second parse
    expect(second.model.relationships.filter(r => r.implied).length).toBe(
      first.model.relationships.filter(r => r.implied).length
    )
    expect(explicitCount(dsl)).toBe(
      first.model.relationships.filter(r => !r.implied).length
    )
  })

  it('preserves deployment views (scope, environment, key) through serialize → parse', () => {
    const { workspace: first } = parseDSL(STRUCTURIZR_DSL)
    const { workspace: second, errors } = roundtrip(first)
    expect(errors).toHaveLength(0)

    expect(second.views.deploymentViews).toHaveLength(2)
    const scoped = second.views.deploymentViews.find(v => v.key === 'LiveDeployment')!
    expect(scoped).toBeDefined()
    expect(scoped.environment).toBe('Live')
    expect(scoped.softwareSystemId).toBe(second.model.softwareSystems[0].id)
    expect(scoped.autoLayout?.direction).toBe('LR')

    // Element sets survive (compare cardinality — parse-time expansion
    // re-derives the same concrete membership from explicit includes)
    const firstScoped = first.views.deploymentViews.find(v => v.key === 'LiveDeployment')!
    expect(scoped.elements.length).toBe(firstScoped.elements.length)

    const unscoped = second.views.deploymentViews.find(v => v.key === 'AllLiveDeployment')!
    expect(unscoped.softwareSystemId).toBeUndefined()
    expect(unscoped.environment).toBe('Live')
  })

  it('round-trips instance extra tags, urls, and properties', () => {
    const dsl = `workspace {
      model {
        sys = softwareSystem "Sys" {
          api = container "API"
        }
        deploymentEnvironment "Prod" {
          k8s = deploymentNode "Kubernetes" "" "EKS" {
            apiInstance = containerInstance api "critical,monitored" {
              url "https://runbook.example.com"
              properties {
                "region" "us-east-1"
              }
            }
          }
        }
      }
      views {
        deployment * "Prod" "ProdView" {
          include *
        }
      }
    }`
    const { workspace: first, errors: e1 } = parseDSL(dsl)
    expect(e1).toHaveLength(0)

    const inst1 = first.model.deploymentEnvironments[0].deploymentNodes[0].containerInstances[0]
    expect(inst1.tags).toEqual(expect.arrayContaining(['Container Instance', 'critical', 'monitored']))
    expect(inst1.url).toBe('https://runbook.example.com')
    expect(inst1.properties.region).toBe('us-east-1')

    const { workspace: second, errors: e2 } = parseDSL(serializeDSL(first))
    expect(e2).toHaveLength(0)
    const inst2 = second.model.deploymentEnvironments[0].deploymentNodes[0].containerInstances[0]
    expect(inst2.tags).toEqual(expect.arrayContaining(['Container Instance', 'critical', 'monitored']))
    expect(inst2.url).toBe('https://runbook.example.com')
    expect(inst2.properties.region).toBe('us-east-1')
  })
})
