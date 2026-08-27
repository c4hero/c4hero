import { useMemo, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import type { DeploymentNode, View, Workspace } from '@/types/model'
import { Boxes, HardDrive, Plus, Trash2 } from 'lucide-react'

type Row = {
  id: string
  depth: number
  kind: 'node' | 'infra' | 'instance'
  label: string
  sublabel?: string
  renamable: boolean
}

type NodePath = { id: string; path: string }

function elementNameById(ws: Workspace): Map<string, string> {
  const map = new Map<string, string>()
  for (const sys of ws.model.softwareSystems) {
    map.set(sys.id, sys.name)
    for (const c of sys.containers) map.set(c.id, c.name)
  }
  return map
}

function collectRows(ws: Workspace, view: View): { rows: Row[]; paths: NodePath[] } {
  const env = (ws.model.deploymentEnvironments ?? []).find(e => e.name === view.environment)
  const rows: Row[] = []
  const paths: NodePath[] = []
  const names = elementNameById(ws)
  const walk = (node: DeploymentNode, depth: number, prefix: string) => {
    const path = prefix ? `${prefix} › ${node.name}` : node.name
    rows.push({ id: node.id, depth, kind: 'node', label: node.name, sublabel: node.technology, renamable: true })
    paths.push({ id: node.id, path })
    for (const infra of node.infrastructureNodes) {
      rows.push({ id: infra.id, depth: depth + 1, kind: 'infra', label: infra.name, sublabel: infra.technology ?? 'Infrastructure', renamable: true })
    }
    for (const inst of node.containerInstances) {
      rows.push({ id: inst.id, depth: depth + 1, kind: 'instance', label: names.get(inst.containerId) ?? inst.containerId, sublabel: 'Container instance', renamable: false })
    }
    for (const inst of node.softwareSystemInstances) {
      rows.push({ id: inst.id, depth: depth + 1, kind: 'instance', label: names.get(inst.softwareSystemId) ?? inst.softwareSystemId, sublabel: 'System instance', renamable: false })
    }
    for (const child of node.children) walk(child, depth + 1, path)
  }
  for (const node of env?.deploymentNodes ?? []) walk(node, 0, '')
  return { rows, paths }
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

type AddKind = 'node' | 'infra' | 'containerInstance' | 'systemInstance'

/** Deployment topology editor for the active deployment view. Rendered
 *  inside the Add Element flyout shell. */
export default function DeploymentTopologyEditor({ view }: { view: View }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [kind, setKind] = useState<AddKind>('node')
  const [hostId, setHostId] = useState('')
  const [elementId, setElementId] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const { rows, paths } = useMemo(
    () => (workspace ? collectRows(workspace, view) : { rows: [], paths: [] }),
    [workspace, view],
  )
  const containers = useMemo(
    () => (workspace?.model.softwareSystems ?? []).flatMap(s => s.containers.map(c => ({ id: c.id, name: `${c.name} (${s.name})` }))),
    [workspace],
  )
  const systems = workspace?.model.softwareSystems ?? []

  if (!workspace || !view.environment) return null
  const environment = view.environment

  const needsHost = kind !== 'node' // deployment nodes may be top-level
  const needsElement = kind === 'containerInstance' || kind === 'systemInstance'
  const canAdd = (!needsHost || hostId !== '') && (!needsElement || elementId !== '')
  // Why Add is disabled, most fundamental blocker first — a fresh environment
  // has no nodes at all, so nothing but a deployment node can be added yet.
  const kindLabel = kind === 'infra' ? 'An infrastructure node' : 'An instance'
  const blockedHint = canAdd ? null
    : needsHost && paths.length === 0
      ? `${kindLabel} lives inside a deployment node — add a Deployment node first.`
      : needsHost && hostId === ''
        ? `Choose which node to put it inside.`
        : `Choose which ${kind === 'containerInstance' ? 'container' : 'system'} to instantiate.`

  const add = () => {
    const store = useWorkspaceStore.getState()
    if (kind === 'node') store.addDeploymentNode(environment, hostId || null)
    else if (kind === 'infra') store.addInfrastructureNode(environment, hostId)
    else if (kind === 'containerInstance') store.addContainerInstance(environment, hostId, elementId)
    else store.addSoftwareSystemInstance(environment, hostId, elementId)
  }

  const commitRename = (id: string) => {
    useWorkspaceStore.getState().renameDeploymentElement(environment, id, renameText)
    setRenamingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px 4px' }}>
        <span className="flyout-label">Deployment topology — {environment}</span>
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 240, padding: '2px 6px' }}>
        {rows.length === 0 && (
          <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            No deployment nodes yet — add the first one below.
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            data-topology-row={row.kind}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 6px',
              paddingLeft: 6 + row.depth * 14,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, display: 'inline-flex' }}>
              {row.kind === 'node' ? <Boxes size={12} /> : <HardDrive size={12} />}
            </span>
            {renamingId === row.id ? (
              <input
                autoFocus
                value={renameText}
                aria-label={`Rename ${row.label}`}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => commitRename(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(row.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                style={{ ...selectStyle, flex: 1 }}
              />
            ) : (
              <span
                onClick={() => { if (row.renamable) { setRenamingId(row.id); setRenameText(row.label) } }}
                title={row.renamable ? 'Rename' : undefined}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: row.renamable ? 'text' : 'default',
                }}
              >
                {row.label}
                {row.sublabel && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-muted)' }}>{row.sublabel}</span>
                )}
              </span>
            )}
            <button
              aria-label={`Delete ${row.label}`}
              onClick={() => useWorkspaceStore.getState().deleteElements([row.id])}
              style={{
                display: 'inline-flex',
                padding: 2,
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-danger, #e5484d)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="flyout-label">Add</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select aria-label="Element kind" value={kind} onChange={(e) => setKind(e.target.value as AddKind)} style={selectStyle}>
            <option value="node">Deployment node</option>
            <option value="infra">Infrastructure node</option>
            <option value="containerInstance">Container instance</option>
            <option value="systemInstance">System instance</option>
          </select>
          <select aria-label="Host deployment node" value={hostId} onChange={(e) => setHostId(e.target.value)} style={selectStyle}>
            {kind === 'node' && <option value="">Top level</option>}
            {kind !== 'node' && <option value="">Inside…</option>}
            {paths.map(p => <option key={p.id} value={p.id}>{p.path}</option>)}
          </select>
        </div>
        {needsElement && (
          <select aria-label="Instance of" value={elementId} onChange={(e) => setElementId(e.target.value)} style={selectStyle}>
            <option value="">
              {kind === 'containerInstance' ? 'Container…' : 'System…'}
            </option>
            {kind === 'containerInstance'
              ? containers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              : systems.map(sys => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
          </select>
        )}
        <button
          aria-label="Add topology element"
          disabled={!canAdd}
          onClick={add}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-primary)',
            cursor: canAdd ? 'pointer' : 'not-allowed',
            opacity: canAdd ? 1 : 0.5,
          }}
        >
          <Plus size={12} /> Add
        </button>
        {blockedHint && (
          <span role="status" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {blockedHint}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          Click a node's name to rename it. Deleting a node removes everything
          inside it.
        </span>
      </div>
    </div>
  )
}
