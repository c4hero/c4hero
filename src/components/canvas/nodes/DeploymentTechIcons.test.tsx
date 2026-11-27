import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlow, type Node } from '@xyflow/react'
import InfrastructureNode from './InfrastructureNode'
import BoundaryNode from './BoundaryNode'
import { loadTechIconCatalog } from '@/lib/techIcons/loader'
import type { InfrastructureNode as InfraModel } from '@/types/model'

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }

beforeAll(async () => {
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  // @ts-expect-error jsdom has no DOMMatrixReadOnly
  global.DOMMatrixReadOnly = class { m22 = 1 }
  await loadTechIconCatalog()
})

function infra(overrides: Partial<InfraModel> = {}): InfraModel {
  return { id: 'lb', type: 'infrastructureNode', name: 'Load Balancer', tags: [], properties: {}, ...overrides }
}

function renderNodes(nodes: Node[]) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={nodes} nodeTypes={{ infrastructureNode: InfrastructureNode, boundary: BoundaryNode }} />
    </div>,
  )
}

describe('technology logos on deployment views (TEA-383)', () => {
  it('draws an infrastructure node logo in place of the server glyph', () => {
    const { container } = renderNodes([{ id: 'lb', type: 'infrastructureNode', position: { x: 0, y: 0 }, data: { infra: infra({ technology: 'NGINX' }) } }])
    const tile = container.querySelector<HTMLElement>('.c4-node-tech-icon')
    expect(tile?.dataset.techIcon).toBe('nginx')
    expect(container.querySelector('.lucide-server')).toBeNull()
  })

  it('keeps the server glyph for an unknown technology or a pinned none', () => {
    const { container } = renderNodes([
      { id: 'a', type: 'infrastructureNode', position: { x: 0, y: 0 }, data: { infra: infra({ id: 'a', technology: 'HAProxy' }) } },
      { id: 'b', type: 'infrastructureNode', position: { x: 0, y: 200 }, data: { infra: infra({ id: 'b', technology: 'NGINX', properties: { 'c4hero.icon': 'none' } }) } },
    ])
    expect(container.querySelector('.c4-node-tech-icon')).toBeNull()
    expect(container.querySelectorAll('.lucide-server')).toHaveLength(2)
  })

  it('honours a pinned logo on an infrastructure node', () => {
    const { container } = renderNodes([{ id: 'lb', type: 'infrastructureNode', position: { x: 0, y: 0 }, data: { infra: infra({ technology: 'ELB', properties: { 'c4hero.icon': 'cloudflare' } }) } }])
    expect(container.querySelector<HTMLElement>('.c4-node-tech-icon')?.dataset.techIcon).toBe('cloudflare')
  })

  it('draws a small logo beside a deployment node boundary title', () => {
    const { container } = renderNodes([{
      id: '__scope_boundary__k8s', type: 'boundary', position: { x: 0, y: 0 },
      data: { name: 'Cluster', typeLabel: 'Kubernetes', deploymentNodeId: 'k8s', iconSlug: 'kubernetes' },
      style: { width: 300, height: 200 },
    }])
    const logo = container.querySelector<HTMLElement>('.c4-boundary-tech-icon')
    expect(logo?.dataset.techIcon).toBe('kubernetes')
    expect(logo?.title).toBe('Kubernetes')
    expect(logo?.parentElement?.textContent).toBe('Cluster')
  })
})
