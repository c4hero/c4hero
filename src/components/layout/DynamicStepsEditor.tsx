import { useMemo, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import type { View } from '@/types/model'
import { eligibleStepElements } from '@/lib/dynamicSteps'
import { ArrowDown, ArrowUp, CornerUpLeft, Plus, Trash2 } from 'lucide-react'

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: 2,
  background: 'none',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
}

const selectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 12,
  padding: '4px 6px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-primary)',
}

/** Ordered interaction-step editor for the active dynamic view. Rendered
 *  inside the Add Element flyout shell. */
export default function DynamicStepsEditor({ view }: { view: View }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const selectRelationship = useWorkspaceStore((s) => s.selectRelationship)
  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [description, setDescription] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  const elements = useMemo(
    () => (workspace ? eligibleStepElements(workspace, view) : []),
    [workspace, view],
  )
  const nameOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const el of elements) map.set(el.id, el.name)
    return map
  }, [elements])

  if (!workspace) return null
  const relById = new Map(workspace.model.relationships.map(r => [r.id, r]))

  const addStep = () => {
    if (!sourceId || !destinationId || sourceId === destinationId) return
    useWorkspaceStore.getState().addDynamicStep(view.key, sourceId, destinationId, description.trim() || undefined)
    setDescription('')
  }

  const commitEdit = (index: number) => {
    useWorkspaceStore.getState().updateDynamicStepDescription(view.key, index, editText)
    setEditingIndex(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px 4px' }}>
        <span className="flyout-label">Interaction steps</span>
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 240, padding: '2px 6px' }}>
        {view.relationships.length === 0 && (
          <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            No steps yet — add the first interaction below.
          </div>
        )}
        {view.relationships.map((step, index) => {
          const rel = relById.get(step.id)
          const from = step.sourceId ?? (step.response ? rel?.destinationId : rel?.sourceId)
          const to = step.destinationId ?? (step.response ? rel?.sourceId : rel?.destinationId)
          const label = `${nameOf.get(from ?? '') ?? from ?? '?'} → ${nameOf.get(to ?? '') ?? to ?? '?'}`
          const stepDescription = step.description ?? rel?.description
          return (
            <div
              key={`${step.id}-${index}`}
              data-step-row
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 6px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span
                aria-label={`Step ${step.order}`}
                style={{
                  minWidth: 18,
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 9,
                  padding: '1px 4px',
                  background: 'var(--color-surface-3)',
                  color: 'var(--color-text-secondary)',
                  flexShrink: 0,
                }}
              >
                {step.order}
              </span>
              <button
                onClick={() => selectRelationship(step.id)}
                title={stepDescription || label}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-primary)' }}>
                  {step.response && <CornerUpLeft size={10} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} aria-label="Response" />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                </span>
                {editingIndex === index ? (
                  <input
                    autoFocus
                    value={editText}
                    aria-label={`Step ${step.order} description`}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => commitEdit(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(index)
                      if (e.key === 'Escape') setEditingIndex(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ ...selectStyle, width: '100%', marginTop: 2 }}
                  />
                ) : (
                  <span
                    onClick={(e) => { e.stopPropagation(); setEditingIndex(index); setEditText(stepDescription ?? '') }}
                    title="Edit description"
                    style={{
                      display: 'block',
                      fontSize: 11,
                      color: 'var(--color-text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {stepDescription || 'No description'}
                  </span>
                )}
              </button>
              <span style={{ display: 'flex', flexShrink: 0 }}>
                <button
                  aria-label={`Move step ${step.order} up`}
                  disabled={index === 0}
                  onClick={() => useWorkspaceStore.getState().moveDynamicStep(view.key, index, 'up')}
                  style={{ ...iconButtonStyle, opacity: index === 0 ? 0.3 : 1 }}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  aria-label={`Move step ${step.order} down`}
                  disabled={index === view.relationships.length - 1}
                  onClick={() => useWorkspaceStore.getState().moveDynamicStep(view.key, index, 'down')}
                  style={{ ...iconButtonStyle, opacity: index === view.relationships.length - 1 ? 0.3 : 1 }}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  aria-label={`Delete step ${step.order}`}
                  onClick={() => useWorkspaceStore.getState().deleteDynamicStep(view.key, index)}
                  style={{ ...iconButtonStyle, color: 'var(--color-danger, #e5484d)' }}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="flyout-label">Add step</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select aria-label="Step source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={selectStyle}>
            <option value="">From…</option>
            {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
          </select>
          <select aria-label="Step destination" value={destinationId} onChange={(e) => setDestinationId(e.target.value)} style={selectStyle}>
            <option value="">To…</option>
            {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            aria-label="Step description"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStep() }}
            style={selectStyle}
          />
          <button
            aria-label="Add step"
            disabled={!sourceId || !destinationId || sourceId === destinationId}
            onClick={addStep}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              cursor: !sourceId || !destinationId || sourceId === destinationId ? 'not-allowed' : 'pointer',
              opacity: !sourceId || !destinationId || sourceId === destinationId ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <Plus size={12} /> Add
          </button>
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          Picking the reverse of an existing relationship adds a response step.
          Editing renumbers steps 1..n.
        </span>
      </div>
    </div>
  )
}
