import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import TechIcon from '@/components/shared/TechIcon'
import type { TechIconSlug } from '@/lib/techIcons/registry'
import { useNodeTechIcon } from './useNodeTechIcon'

interface BoundaryNodeData {
  name: string
  typeLabel: string
  empty?: boolean
  /** Set on deployment-node boundaries: clicking the label selects the node
   *  so the inspector can edit its name / technology / description. */
  deploymentNodeId?: string
  /** Deployment nodes only: the technology logo beside the title (TEA-383). */
  iconSlug?: TechIconSlug
}

const BOUNDARY_TITLE_COLOR = 'var(--canvas-boundary-title, var(--color-text-dim))'

function BoundaryNode({ data, selected }: NodeProps & { data: BoundaryNodeData }) {
  const emptyTitle = data.deploymentNodeId
    ? 'Add instances to this node'
    : data.typeLabel === 'Software System'
      ? 'Add containers to this system'
      : 'Add components to this container'
  const { icon, fill, pendingProps } = useNodeTechIcon(data.iconSlug, BOUNDARY_TITLE_COLOR)

  return (
    <>
      <div
        {...pendingProps}
        className="c4-overlay-drag-handle"
        onClick={() => {
          // A drag suppresses click, so this only fires on a plain click.
          if (data.deploymentNodeId) useWorkspaceStore.getState().selectElements([data.deploymentNodeId])
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          cursor: 'grab',
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-xs-plus)',
          fontWeight: 700,
          color: BOUNDARY_TITLE_COLOR,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}>
          {icon && fill && (
            <span className="c4-boundary-tech-icon" data-tech-icon={data.iconSlug} title={icon.title} style={{ display: 'inline-flex' }}>
              <TechIcon icon={icon} size={14} color={fill} />
            </span>
          )}
          {data.name}
        </span>
        <span style={{
          fontSize: 'var(--text-xxs)',
          fontWeight: 500,
          color: 'var(--canvas-boundary-subtitle, var(--color-text-ghost))',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {data.typeLabel}
        </span>
      </div>
      <div
        className={`c4-boundary-node ${selected ? 'selected' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--canvas-boundary-border, var(--glass-overlay-sm))',
          background: 'var(--canvas-boundary-bg, var(--glass-overlay-xxs))',
          cursor: 'default',
          pointerEvents: 'none',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
      {data.empty && (
        <div
          style={{
            position: 'absolute',
            inset: '48px 18px 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          <svg width="38" height="32" viewBox="0 0 48 40" fill="none" style={{ opacity: 0.22, marginBottom: 12 }}>
            <rect x="1" y="1" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <rect x="27" y="1" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <rect x="1" y="25" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <rect x="27" y="25" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <line x1="21" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="2"/>
            <line x1="21" y1="32" x2="27" y2="32" stroke="currentColor" strokeWidth="2"/>
            <line x1="24" y1="15" x2="24" y2="25" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}
          >
            {emptyTitle}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              flexWrap: 'wrap',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            Press
            <kbd
              style={{
                padding: '2px 7px',
                borderRadius: 6,
                background: 'var(--glass-overlay-sm)',
                border: '1px solid var(--glass-overlay-md)',
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 700,
                lineHeight: '18px',
              }}
            >
              A
            </kbd>
            to add an element
          </span>
        </div>
      )}
      </div>
    </>
  )
}

export default memo(BoundaryNode)
