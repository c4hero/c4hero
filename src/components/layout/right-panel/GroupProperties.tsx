import { useState, useMemo } from 'react'
import { useWorkspaceStore, buildElementMap } from '@/store/workspace'
import type { Group, ModelElement } from '@/types/model'
import { X, Plus, Layers, Trash2 } from 'lucide-react'
import { TYPE_COLORS } from '@/lib/elementMeta'
import { FieldLabel, EditableField } from './fields'

export default function GroupProperties({ group, onClose }: { group: Group; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const updateGroup = useWorkspaceStore((s) => s.updateGroup)
  const deleteGroup = useWorkspaceStore((s) => s.deleteGroup)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const [addSearch, setAddSearch] = useState('')

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  if (!workspace) return null

  const members = group.elementIds
    .map(id => elementMap.get(id))
    .filter(Boolean) as ModelElement[]

  const memberSet = new Set(group.elementIds)
  const q = addSearch.toLowerCase().trim()
  const candidates = Array.from(elementMap.values()).filter(el =>
    !memberSet.has(el.id) &&
    (q === '' || el.name.toLowerCase().includes(q) || el.type.toLowerCase().includes(q))
  )

  function removeMember(id: string) {
    updateGroup(group.id, { elementIds: group.elementIds.filter(eid => eid !== id) })
  }

  function addMember(id: string) {
    updateGroup(group.id, { elementIds: [...group.elementIds, id] })
    setAddSearch('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <Layers size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent)', flex: 1 }}>
          Group
        </span>
        <button
          onClick={() => confirmDelete(`Delete group "${group.name}"?`, () => { deleteGroup(group.id); onClose() })}
          className="btn-icon !min-h-6 !min-w-6 !p-1"
          title="Delete group"
          aria-label="Delete group"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Trash2 size={12} />
        </button>
        <button onClick={onClose} className="btn-icon !min-h-6 !min-w-6 !p-1" title="Close" aria-label="Close panel">
          <X size={12} />
        </button>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name */}
        <div>
          <FieldLabel>Name</FieldLabel>
          <EditableField
            value={group.name}
            placeholder="Group name"
            aria-label="Group name"
            onCommit={(val) => updateGroup(group.id, { name: val })}
          />
        </div>

        {/* Members */}
        <div>
          <FieldLabel>Members ({members.length})</FieldLabel>
          {members.length === 0 ? (
            <p style={{ fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No members yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {members.map(el => (
                <div key={el.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-2)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[el.type] ?? 'var(--color-accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {el.name}
                  </span>
                  <button
                    onClick={() => removeMember(el.id)}
                    style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}
                    title="Remove from group"
                    aria-label={`Remove ${el.name} from group`}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add members */}
        <div>
          <FieldLabel>Add member</FieldLabel>
          <input
            type="text"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Search elements..."
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
              marginBottom: candidates.length > 0 ? 6 : 0,
            }}
          />
          {candidates.length > 0 && (
            <div style={{
              maxHeight: 160,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-1)',
              padding: 4,
            }}>
              {candidates.slice(0, 20).map(el => (
                <button
                  key={el.id}
                  onClick={() => addMember(el.id)}
                  className="hover-surface-2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 5,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[el.type] ?? 'var(--color-accent)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.name}</span>
                  <Plus size={11} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--color-text-muted)' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
