import { fireEvent, render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import RelationshipEdge from './RelationshipEdge'
import { getEdgeLabelDensity, truncateEdgeLabel } from './relationshipEdgeLabels'

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    BaseEdge: ({ id, path }: { id: string; path: string }) => <path data-testid={id} d={path} />,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    getStraightPath: () => ['M0,0 L100,0', 50, 0],
    getSmoothStepPath: () => ['M0,0 L100,0', 50, 0],
    getBezierPath: () => ['M0,0 L100,0', 50, 0],
  }
})

const relationship = {
  id: 'rel-1',
  sourceId: 'source',
  destinationId: 'target',
  description: 'Synchronizes customer profile changes across downstream systems',
  technology: 'KafkaProtocolBufferEnvelopeWithVersionNegotiation, MutualTLSCertificatePinning',
  tags: ['Relationship'],
  properties: {},
} as const

describe('RelationshipEdge density handling', () => {
  it('switches dense orthogonal labels into compact mode', () => {
    expect(getEdgeLabelDensity({
      lineStyle: 'Orthogonal',
      sourceX: 0,
      sourceY: 0,
      targetX: 120,
      targetY: 0,
      description: relationship.description,
      technologies: relationship.technology.split(', '),
      selected: false,
      hovered: false,
    })).toBe('compact')
  })

  it('keeps full labels when the edge is selected', () => {
    expect(getEdgeLabelDensity({
      lineStyle: 'Orthogonal',
      sourceX: 0,
      sourceY: 0,
      targetX: 120,
      targetY: 0,
      description: relationship.description,
      technologies: relationship.technology.split(', '),
      selected: true,
      hovered: false,
    })).toBe('full')
  })

  it('truncates compact previews with an ellipsis', () => {
    expect(truncateEdgeLabel('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghi…')
  })

  it('renders compact previews and restores the full tooltip on hover', () => {
    const { container } = render(
      <svg>
        <RelationshipEdge
          id="edge-1"
          sourceX={0}
          sourceY={0}
          targetX={120}
          targetY={0}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          selected={false}
          data={{ relationship: { ...relationship, lineStyle: 'Orthogonal' } }}
        />
      </svg>,
    )

    const label = container.querySelector('[data-label-density="compact"]') as HTMLElement | null
    expect(label).not.toBeNull()
    expect(label?.textContent).toContain('Synchronizes customer profile changes acr…')
    expect(label?.textContent).toContain('KafkaProtocolBuffer…')
    expect(label?.textContent).toContain('+1')
    expect(screen.queryByText(relationship.description)).toBeNull()

    const hoverPath = container.querySelector('path[stroke="transparent"]') as SVGPathElement | null
    expect(hoverPath).not.toBeNull()
    fireEvent.mouseEnter(hoverPath!)

    expect(screen.getAllByText(relationship.description).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('MutualTLSCertificatePinning').length).toBeGreaterThanOrEqual(1)
  })
})
