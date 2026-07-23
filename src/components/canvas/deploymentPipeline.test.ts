import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import { parseDSL } from '@/lib/dsl'
import type { View, Workspace } from '@/types/model'
import { applyAutoLayout } from '@/lib/canvasLayout'
import { buildRelationshipMap } from '@/store/workspace'
import { buildEdges, buildBoundaryNodes, buildBoundaryLayoutClusters } from './canvasBuilders'
import { buildDeploymentNodes } from './deploymentBuilders'

const NO_FILTERS = { tags: [], statuses: [], techs: [], teams: [] }

const DSL = `
workspace "Bank" {
    model {
        ibs = softwareSystem "Internet Banking" {
            web = container "Web Application" "SPA" "Java"
            db = container "Database" "Data" "Oracle" "Database"
            web -> db "Reads/writes" "JDBC"
        }
        deploymentEnvironment "Live" {
            deploymentNode "AWS" "" "Amazon Web Services" {
                deploymentNode "us-east-1" "" "Region" {
                    lb = infrastructureNode "Load Balancer" "" "ELB"
                    deploymentNode "Web Server" "" "Ubuntu" {
                        instances 3
                        liveWeb = containerInstance web
                    }
                    deploymentNode "DB Server" "" "Ubuntu" {
                        liveDb = containerInstance db
                    }
                }
            }
            lb -> liveWeb "Forwards to" "HTTPS"
        }
    }
    views {
        deployment ibs "Live" "LiveDeploy" { include * }
    }
}
`

/** Replicate the sequence in Canvas.tsx's initialNodes memo for a deployment
 *  view, so a layout/overlay integration regression fails here headlessly. */
function runPipeline(ws: Workspace, view: View) {
  // 1. content nodes, given measured sizes as React Flow would after measure
  const rawNodes = buildDeploymentNodes(ws, view).map(n => ({
    ...n,
    measured: { width: 200, height: 100 },
  }))

  // 2. temp edges for dagre
  const relMap = buildRelationshipMap(ws)
  const viewIds = new Set(view.elements.map(e => e.id))
  const tempEdges: Edge[] = []
  for (const vr of view.relationships) {
    const rel = relMap.get(vr.id)
    if (!rel) continue
    if (!viewIds.has(rel.sourceId) || !viewIds.has(rel.destinationId)) continue
    tempEdges.push({ id: rel.id, source: rel.sourceId, target: rel.destinationId })
  }

  // 3. auto-layout with deployment boundary clusters
  const boundaryClusters = buildBoundaryLayoutClusters(ws, view)
  const laidOut = applyAutoLayout(rawNodes, tempEdges, view, ws.model.groups, 'TB', new Set(), boundaryClusters)

  // 4. boundary overlays + 5. final edges
  const boundaries = buildBoundaryNodes(ws, view, laidOut)
  const allNodes: Node[] = [...boundaries, ...laidOut]
  const edges = buildEdges(ws, view, allNodes, NO_FILTERS)
  return { laidOut, boundaries, edges }
}

describe('deployment view canvas pipeline (integration)', () => {
  it('positions every content node and wraps them in nested boundaries', () => {
    const { workspace: ws, errors } = parseDSL(DSL)
    expect(errors).toHaveLength(0)
    const view = ws.views.deploymentViews[0]

    const { laidOut, boundaries, edges } = runPipeline(ws, view)

    // Scoped to ibs: web + db instances + load balancer = 3 content nodes.
    expect(laidOut).toHaveLength(3)
    // Auto-layout gave them real, distinct positions (not all stacked at 0,0).
    const positions = new Set(laidOut.map(n => `${n.position.x},${n.position.y}`))
    expect(positions.size).toBe(3)

    // Nested boundaries: AWS > us-east-1 > {Web Server, DB Server}.
    const names = boundaries.map(b => (b.data as { name: string }).name)
    expect(names).toEqual(expect.arrayContaining(['AWS', 'us-east-1', 'Web Server', 'DB Server']))

    // Each boundary actually encloses its members' laid-out rects.
    const posById = new Map(laidOut.map(n => [n.id, n.position]))
    for (const b of boundaries) {
      const bx = b.position.x
      const by = b.position.y
      const bw = (b.measured?.width ?? 0)
      const bh = (b.measured?.height ?? 0)
      const memberIds = laidOut
        .map(n => n.id)
        .filter(id => {
          const p = posById.get(id)!
          return p.x >= bx - 1 && p.x <= bx + bw + 1 && p.y >= by - 1 && p.y <= by + bh + 1
        })
      // Every boundary wraps at least one content node.
      expect(memberIds.length).toBeGreaterThan(0)
    }

    // The explicit lb -> liveWeb relationship renders as an edge.
    expect(edges.length).toBeGreaterThan(0)
  })
})
