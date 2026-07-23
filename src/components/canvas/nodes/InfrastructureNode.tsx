import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { InfrastructureNode as InfraNodeModel } from '@/types/model'
import { Server } from 'lucide-react'
import NodeHandles from './NodeHandles'

export interface InfrastructureNodeData {
  infra: InfraNodeModel
}

/** Deployment infrastructure node (load balancers, DNS, firewalls, …). Rendered
 *  with its own flat visual — it is not a C4 model element, so it does not go
 *  through BaseC4Node / the selection + inspector paths. */
function InfrastructureNode({ data }: NodeProps & { data: InfrastructureNodeData }) {
  const { infra } = data
  const technology = infra.technology

  return (
    <div
      className="c4-node relative"
      style={{
        background: 'var(--color-tint-infra, var(--color-surface-2))',
        border: '2px dashed var(--color-border-infra, var(--color-border))',
        ['--node-glow' as string]: 'var(--color-type-infra, var(--color-text-muted))',
      }}
      role="figure"
      aria-label={`Infrastructure node: ${infra.name}${technology ? ` (${technology})` : ''}${infra.description ? ` - ${infra.description}` : ''}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Server size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--color-type-infra, var(--color-text-muted))' }} />
        <div className="c4-node-name" style={{ flex: 1, minWidth: 0 }}>{infra.name}</div>
      </div>

      {infra.description && (
        <p
          className="line-clamp-3"
          style={{ fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: '1.4' }}
        >
          {infra.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
        <span
          className="c4-type-chip"
          style={{
            background: 'color-mix(in srgb, var(--color-type-infra, var(--color-text-muted)) 12%, transparent)',
            color: 'var(--color-type-infra, var(--color-text-muted))',
          }}
        >
          Infrastructure
        </span>
        {technology && technology.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
          <span
            key={t}
            className="c4-type-chip"
            style={{
              background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
              color: 'var(--color-text-muted)',
              fontWeight: 600,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <NodeHandles />
    </div>
  )
}

export default memo(InfrastructureNode)
