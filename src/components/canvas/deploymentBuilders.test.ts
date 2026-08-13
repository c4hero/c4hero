import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { parseDSL } from '@/lib/dsl'
import type { View, Workspace } from '@/types/model'
import {
  buildDeploymentNodes,
  buildDeploymentLayoutClusters,
  buildDeploymentBoundaryNodes,
  deploymentBoundaryMemberIds,
} from './deploymentBuilders'
import { buildEdges } from './canvasBuilders'

const NO_FILTERS = { tags: [], statuses: [], techs: [], teams: [] }

const DEPLOYMENT_DSL = `
workspace "Bank" {
    model {
        ibs = softwareSystem "Internet Banking System" {
            web = container "Web Application" "SPA" "Java"
            db = container "Database" "Stores data" "Oracle" "Database"
            web -> db "Reads from and writes to" "JDBC"
        }
        mainframe = softwareSystem "Mainframe"
        web -> mainframe "Uses"

        deploymentEnvironment "Live" {
            deploymentNode "AWS" "" "Amazon Web Services" {
                deploymentNode "us-east-1" "" "AWS region" {
                    lb = infrastructureNode "Load Balancer" "Routes" "ELB"
                    deploymentNode "Web Server" "" "Ubuntu" {
                        instances 4
                        liveWeb = containerInstance web
                    }
                    deploymentNode "Database Server" "" "Ubuntu" {
                        liveDb = containerInstance db
                    }
                }
            }
            deploymentNode "Data Center" {
                liveMainframe = softwareSystemInstance mainframe
            }
            lb -> liveWeb "Forwards requests to" "HTTPS"
        }
    }
    views {
        deployment * "Live" "AllLive" {
            include *
        }
    }
}
`

function deploymentView(ws: Workspace): View {
  return ws.views.deploymentViews[0]
}

/** Give every content node a distinct measured rect so boundary geometry is
 *  deterministic (mirrors what React Flow supplies post-measure). */
function layout(nodes: Node[]): Node[] {
  return nodes.map((n, i) => ({
    ...n,
    position: { x: i * 300, y: i * 200 },
    measured: { width: 200, height: 100 },
  }))
}

describe('buildDeploymentNodes', () => {
  it('renders container/system instances and infrastructure nodes, not deployment nodes', () => {
    const { workspace: ws, errors } = parseDSL(DEPLOYMENT_DSL)
    expect(errors).toHaveLength(0)
    const view = deploymentView(ws)

    const nodes = buildDeploymentNodes(ws, view, NO_FILTERS, [])
    const byType = nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.type as string] = (acc[n.type as string] ?? 0) + 1
      return acc
    }, {})

    // 2 container instances (web, db), 1 software-system instance, 1 infra node
    expect(byType.container).toBe(2)
    expect(byType.softwareSystem).toBe(1)
    expect(byType.infrastructureNode).toBe(1)
    // Deployment nodes never become content nodes
    expect(nodes.some(n => n.type === 'boundary')).toBe(false)
  })

  it('resolves an instance to its referenced element while keeping the instance id', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const web = ws.model.softwareSystems[0].containers[0]

    const nodes = buildDeploymentNodes(ws, view, NO_FILTERS, [])
    const instanceIds = new Set(view.elements.map(e => e.id))
    const webInstance = nodes.find(
      n => n.type === 'container' && (n.data as { element: { name: string } }).element.name === 'Web Application',
    )
    expect(webInstance).toBeDefined()
    // Node id is the instance id (present in the view), not the container id.
    expect(instanceIds.has(webInstance!.id)).toBe(true)
    expect(webInstance!.id).not.toBe(web.id)
  })
})

describe('buildDeploymentBoundaryNodes', () => {
  it('draws one nested boundary per deployment node that hosts a visible leaf', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const laidOut = layout(buildDeploymentNodes(ws, view, NO_FILTERS, []))

    const boundaries = buildDeploymentBoundaryNodes(ws, view, laidOut)
    const names = boundaries.map(b => (b.data as { name: string }).name)

    // AWS > us-east-1 > {Web Server, Database Server}, plus Data Center = 5 nodes
    expect(names).toEqual(expect.arrayContaining(['AWS', 'us-east-1', 'Web Server', 'Database Server', 'Data Center']))
    // Every boundary uses the scope-boundary id prefix so the canvas treats it
    // as a boundary overlay.
    expect(boundaries.every(b => b.id.startsWith('__scope_boundary__'))).toBe(true)
  })

  it('nests inner boundaries above their ancestors (higher z-index)', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const laidOut = layout(buildDeploymentNodes(ws, view, NO_FILTERS, []))

    const boundaries = buildDeploymentBoundaryNodes(ws, view, laidOut)
    const z = (name: string) =>
      boundaries.find(b => (b.data as { name: string }).name === name)!.zIndex as number

    // Web Server sits inside us-east-1 which sits inside AWS.
    expect(z('Web Server')).toBeGreaterThan(z('us-east-1'))
    expect(z('us-east-1')).toBeGreaterThan(z('AWS'))
  })

  it('surfaces the deployment node instance count in the sublabel', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const laidOut = layout(buildDeploymentNodes(ws, view, NO_FILTERS, []))

    const boundaries = buildDeploymentBoundaryNodes(ws, view, laidOut)
    const webServer = boundaries.find(b => (b.data as { name: string }).name === 'Web Server')!
    expect((webServer.data as { typeLabel: string }).typeLabel).toContain('×4')
  })
})

describe('buildDeploymentLayoutClusters', () => {
  it('clusters each leaf under its innermost hosting node', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)

    const clusters = buildDeploymentLayoutClusters(ws, view)
    // Every content leaf is claimed by exactly one cluster.
    const claimed = clusters.flatMap(c => c.elementIds)
    expect(new Set(claimed).size).toBe(claimed.length)

    // The Load Balancer infra node clusters with us-east-1 (its direct host),
    // not with an ancestor.
    const lbId = ws.model.deploymentEnvironments[0].deploymentNodes[0].children[0].infrastructureNodes[0].id
    const owning = clusters.find(c => c.elementIds.includes(lbId))
    const region = ws.model.deploymentEnvironments[0].deploymentNodes[0].children[0]
    expect(owning?.id).toBe(region.id)
  })
})

describe('deploymentBoundaryMemberIds', () => {
  it('returns all descendant leaves of a deployment node', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const aws = ws.model.deploymentEnvironments[0].deploymentNodes[0]

    const members = deploymentBoundaryMemberIds(ws, view, aws.id)
    // AWS wraps the load balancer + both container instances (3 leaves).
    expect(members.size).toBe(3)
  })
})

describe('deployment view edges', () => {
  it('renders implied + explicit instance relationships between instance nodes', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const laidOut = layout(buildDeploymentNodes(ws, view, NO_FILTERS, []))

    const edges = buildEdges(ws, view, laidOut, {
      tags: [], statuses: [], techs: [], teams: [],
    })
    // At least the lb -> liveWeb explicit relationship is drawn.
    expect(edges.length).toBeGreaterThan(0)
    for (const e of edges) {
      expect(laidOut.some(n => n.id === e.source)).toBe(true)
      expect(laidOut.some(n => n.id === e.target)).toBe(true)
    }
  })
})

describe('boundary nesting geometry', () => {
  it('keeps a child boundary strictly inside its parent in a single-child chain', () => {
    // AWS → us-east-1 wrap the very same member rects; only padding that
    // SHRINKS with depth separates them. The first implementation grew
    // padding with depth, so the inner box rendered outside its parent.
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    const laidOut = layout(buildDeploymentNodes(ws, view, NO_FILTERS, []))
    const boundaries = buildDeploymentBoundaryNodes(ws, view, laidOut)

    const env = ws.model.deploymentEnvironments[0]
    const aws = env.deploymentNodes[0]
    const region = aws.children[0]
    const rect = (id: string) => {
      const b = boundaries.find(n => n.id === `__scope_boundary__${id}`)!
      expect(b).toBeDefined()
      return {
        x: b.position.x, y: b.position.y,
        w: Number(b.style?.width), h: Number(b.style?.height),
      }
    }
    const outer = rect(aws.id)
    const inner = rect(region.id)
    expect(inner.x).toBeGreaterThan(outer.x)
    expect(inner.y).toBeGreaterThan(outer.y)
    expect(inner.x + inner.w).toBeLessThan(outer.x + outer.w)
    expect(inner.y + inner.h).toBeLessThan(outer.y + outer.h)
  })
})

describe('highlight filters on deployment views', () => {
  it('highlights matching instances and keeps matching edges bright', () => {
    const { workspace: ws } = parseDSL(DEPLOYMENT_DSL)
    const view = deploymentView(ws)
    // Filter on the Database tag: the liveDb instance inherits its
    // container's tags through the synthetic display element.
    const filters = { tags: ['Database'], statuses: [], techs: [], teams: [] }
    const nodes = buildDeploymentNodes(ws, view, filters, [])

    const highlighted = nodes.filter(n => (n.data as { highlighted?: boolean }).highlighted)
    expect(highlighted).toHaveLength(1)
    expect(nodes.every(n => n.className === 'c4-node-highlighted' || n.className === 'c4-node-faded')).toBe(true)

    // The web -> db derived instance edge touches a faded endpoint, so it
    // fades — but the node layer participates in the filter instead of the
    // whole edge layer greying out around unstyled nodes.
    const laidOut = layout(nodes)
    const edges = buildEdges(ws, view, laidOut, filters)
    expect(edges.length).toBeGreaterThan(0)
    expect(edges.every(e => e.className === 'c4-edge-highlighted' || e.className === 'c4-edge-faded')).toBe(true)
  })
})
