import { useWorkspaceStore } from '@/store/workspace'
import type { SelectedDeploymentElement } from '@/store/workspace-selectors'
import { X, Trash2, ArrowRight } from 'lucide-react'
import { FieldLabel, EditableField } from './fields'

const KIND_LABELS: Record<SelectedDeploymentElement['kind'], string> = {
  deploymentNode: 'Deployment Node',
  infrastructureNode: 'Infrastructure Node',
  containerInstance: 'Container Instance',
  softwareSystemInstance: 'Software System Instance',
}

/** Inspector body for deployment elements (nodes, infrastructure nodes, and
 *  container / system instances). They live outside the C4 element tree, so
 *  ElementProperties can't render them; nodes and infra get editable
 *  name/technology/description, instances point back at what they deploy. */
export default function DeploymentElementProperties({ sel, onClose }: {
  sel: SelectedDeploymentElement
  onClose: () => void
}) {
  const updateDeploymentElement = useWorkspaceStore((s) => s.updateDeploymentElement)
  const deleteElements = useWorkspaceStore((s) => s.deleteElements)
  const selectElements = useWorkspaceStore((s) => s.selectElements)

  const isInstance = sel.kind === 'containerInstance' || sel.kind === 'softwareSystemInstance'
  const id = isInstance ? sel.instance.id : sel.element.id
  const title = isInstance ? (sel.referenced?.name ?? '(missing element)') : sel.element.name

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'rgba(88,166,255,0.16)' }}>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px]" style={{ color: 'var(--color-accent)' }}>
            {KIND_LABELS[sel.kind]} — {sel.environment}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { deleteElements([id]); onClose() }}
            className="btn-icon !min-h-7 !min-w-7 !p-1"
            aria-label={`Delete ${KIND_LABELS[sel.kind]}`}
            title={sel.kind === 'deploymentNode'
              ? 'Delete this node and everything inside it'
              : `Delete this ${KIND_LABELS[sel.kind].toLowerCase()}`}
            style={{ color: 'var(--color-danger, #e5484d)' }}
          >
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close panel"><X size={14} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isInstance ? (
          <div className="space-y-3">
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              An instance of <strong style={{ color: 'var(--color-text-primary)' }}>{sel.referenced?.name ?? 'a deleted element'}</strong> running
              in {sel.environment}. Name, description and technology come from
              the deployed {sel.kind === 'containerInstance' ? 'container' : 'system'}.
            </p>
            {sel.referenced && (
              <button
                onClick={() => selectElements([sel.referenced!.id])}
                className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] font-medium"
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                Edit {sel.referenced.name} <ArrowRight size={12} />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <FieldLabel>Name</FieldLabel>
              <EditableField
                value={sel.element.name}
                placeholder="Node name"
                aria-label="Deployment element name"
                onCommit={(v) => updateDeploymentElement(sel.environment, id, { name: v })}
              />
            </div>
            <div>
              <FieldLabel>Technology</FieldLabel>
              <EditableField
                value={sel.element.technology ?? ''}
                placeholder="e.g. AWS EC2, Kubernetes..."
                aria-label="Deployment element technology"
                onCommit={(v) => updateDeploymentElement(sel.environment, id, { technology: v })}
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <EditableField
                value={sel.element.description ?? ''}
                placeholder="Describe this element..."
                aria-label="Deployment element description"
                onCommit={(v) => updateDeploymentElement(sel.environment, id, { description: v })}
                multiline
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
