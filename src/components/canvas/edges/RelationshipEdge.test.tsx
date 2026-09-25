import { fireEvent, render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import RelationshipEdge from './RelationshipEdge'
import { markerIdSuffix } from './edgeMarkers'
import { getEdgeLabelDensity, truncateEdgeLabel } from './relationshipEdgeLabels'

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    BaseEdge: ({ id, path, markerStart, markerEnd }: { id: string; path: string; markerStart?: string; markerEnd?: string }) => (
      <path data-testid={id} d={path} markerStart={markerStart} markerEnd={markerEnd} />
    ),
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

describe('RelationshipEdge markers', () => {
  function renderEdge(props: { id?: string; selected?: boolean; color?: string; highlighted?: boolean }) {
    return render(
      <svg>
        <RelationshipEdge
          id={props.id ?? 'edge-1'}
          sourceX={0}
          sourceY={0}
          targetX={120}
          targetY={0}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          selected={props.selected ?? false}
          data={{
            relationship,
            relationshipStyle: props.color ? { tag: 'Relationship', color: props.color } : undefined,
            highlighted: props.highlighted,
          }}
        />
      </svg>,
    )
  }

  function markerFills(container: HTMLElement, edgeId = 'edge-1') {
    const line = screen.getByTestId(edgeId)
    const arrowId = line.getAttribute('marker-end')!.match(/^url\(#(.+)\)$/)![1]
    const dotId = line.getAttribute('marker-start')!.match(/^url\(#(.+)\)$/)![1]
    const fill = (id: string) =>
      (container.querySelector(`marker[id="${id}"] > *`) as SVGElement | null)?.style.fill
    return { arrow: fill(arrowId), dot: fill(dotId) }
  }

  it('colors the arrowhead and start dot with the relationship color', () => {
    const { container } = renderEdge({ color: '#ff0000' })
    expect(markerFills(container)).toEqual({ arrow: 'rgb(255, 0, 0)', dot: 'rgb(255, 0, 0)' })
  })

  it('uses the theme edge color when the relationship has no color', () => {
    const { container } = renderEdge({})
    expect(markerFills(container).arrow).toBe('var(--canvas-edge, var(--color-edge))')
  })

  it('switches markers to the selection color when selected or highlighted', () => {
    const selected = renderEdge({ color: '#ff0000', selected: true })
    expect(markerFills(selected.container).arrow).toBe('var(--canvas-selection, var(--color-accent))')
    selected.unmount()
    const highlighted = renderEdge({ color: '#ff0000', highlighted: true })
    expect(markerFills(highlighted.container).arrow).toBe('var(--canvas-selection, var(--color-accent))')
  })

  it('gives each edge its own marker ids, safe for url(#...) references', () => {
    const { container } = renderEdge({ id: 'rel 1#2' })
    const markerEnd = screen.getByTestId('rel 1#2').getAttribute('marker-end')!
    expect(markerEnd).toMatch(/^url\(#c4-arrow-[A-Za-z0-9_-]+\)$/)
    expect(container.querySelectorAll('marker')).toHaveLength(2)
  })

  it('encodes edge ids injectively', () => {
    expect(markerIdSuffix('abc-1')).toBe('abc-1')
    expect(markerIdSuffix('rel#2')).not.toBe(markerIdSuffix('rel_23_2'))
    expect(markerIdSuffix('a b')).not.toBe(markerIdSuffix('a_b'))
  })
})
