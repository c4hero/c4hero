import { useMemo, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import type { DeploymentNode, View, Workspace } from '@/types/model'
import { deploymentScopeIds } from '@/lib/deployment'
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

  // A view scoped to a software system only draws deployment nodes whose
  // subtree hosts an instance of that system (or its containers). The tree
  // above shows the WHOLE environment, so scoped views need the mismatch
  // called out — otherwise adds look like silent no-ops on the canvas.
  const scopeSystem = view.softwareSystemId
    ? workspace.model.softwareSystems.find(s => s.id === view.softwareSystemId)
    : undefined
  const scopeIds = scopeSystem ? deploymentScopeIds(workspace.model, scopeSystem.id) : undefined
  const viewIds = new Set(view.elements.map(e => e.id))

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
  // Warn BEFORE the add when the result won't appear on this scoped view:
  // instances of out-of-scope elements never show; nodes/infra only show once
  // their subtree hosts an in-scope instance.
  const scopeHint = !scopeSystem || !canAdd ? null
    : needsElement && scopeIds && !scopeIds.has(elementId)
      ? `This ${kind === 'containerInstance' ? 'container' : 'system'} is outside the view's scope (${scopeSystem.name}) — it will be added to ${environment} but stay hidden in this view.`
      : kind === 'node'
        ? `Scoped view: the node will stay hidden until it hosts an instance of ${scopeSystem.name}.`
        : kind === 'infra' && !viewIds.has(hostId)
          ? `Scoped view: this host is hidden until it hosts an instance of ${scopeSystem.name}, so the infrastructure node will be hidden too.`
          : null

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

  // Rows the scoped view hides — drives the "open the unscoped view" escape
  // hatch so hidden elements are always one click from being seen.
  const hiddenCount = scopeSystem ? rows.filter(r => !viewIds.has(r.id)).length : 0
  const openUnscopedView = () => {
    const store = useWorkspaceStore.getState()
    const full = store.workspace?.views.deploymentViews.find(
      v => v.environment === environment && !v.softwareSystemId,
    )
    if (full) store.setActiveView(full.key)
    else store.addView('deployment', undefined, `${environment} — all systems`, { environment })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px 4px' }}>
        <span className="flyout-label">Deployment topology — {environment}</span>
        {scopeSystem && (
          <div style={{ marginTop: 4 }}>
            <span
              data-scope-chip
              title={`This view only shows the parts of ${environment} that deploy ${scopeSystem.name}. The tree below edits the whole environment.`}
              style={{
                display: 'inline-block',
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
              }}
            >
              scoped to {scopeSystem.name}
            </span>
          </div>
        )}
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
            {scopeSystem && !viewIds.has(row.id) && (
              <span
                data-out-of-scope
                title={`Hidden in this view — it only shows deployments of ${scopeSystem.name}`}
                style={{
                  fontSize: 9,
                  padding: '1px 4px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                out of scope
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
              ? containers.map(c => (
                  <option key={c.id} value={c.id}>
                    {scopeIds && !scopeIds.has(c.id) ? `${c.name} — outside view scope` : c.name}
                  </option>
                ))
              : systems.map(sys => (
                  <option key={sys.id} value={sys.id}>
                    {scopeIds && !scopeIds.has(sys.id) ? `${sys.name} — outside view scope` : sys.name}
                  </option>
                ))}
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
        {(blockedHint ?? scopeHint) && (
          <span role="status" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {blockedHint ?? scopeHint}
          </span>
        )}
        {hiddenCount > 0 && (
          <button
            onClick={openUnscopedView}
            aria-label={`Open the unscoped ${environment} view`}
            style={{
              alignSelf: 'flex-start',
              padding: 0,
              background: 'none',
              border: 'none',
              fontSize: 10,
              color: 'var(--color-accent)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {hiddenCount} hidden here — open the unscoped {environment} view
          </button>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          Click a node's name to rename it. Deleting a node removes everything
          inside it.
        </span>
      </div>
    </div>
  )
}
