import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { DeploymentEnvironment, DeploymentNode, InfrastructureNode, Workspace } from '@/types/model'
import { nanoid, pushUndoSnapshot } from '../internals'
import { expandDeploymentElements, walkDeploymentNodes } from '@/lib/deployment'

function envByName(ws: Workspace, environment: string): DeploymentEnvironment | undefined {
  return (ws.model.deploymentEnvironments ?? []).find(e => e.name === environment)
}

function nodeById(env: DeploymentEnvironment, id: string): DeploymentNode | undefined {
  let found: DeploymentNode | undefined
  walkDeploymentNodes(env, (node) => {
    if (node.id === id) found = node
  })
  return found
}

/** Recompute every deployment view of `environment` from the canonical
 *  membership rules (the same expansion `include *` parses to), keeping the
 *  positions of elements that survive. */
function refreshDeploymentViews(ws: Workspace, environment: string): void {
  for (const v of ws.views.deploymentViews ?? []) {
    if (v.environment !== environment) continue
    const existing = new Map(v.elements.map(e => [e.id, e]))
    v.elements = expandDeploymentElements(ws.model, v.environment, v.softwareSystemId)
      .map(e => existing.get(e.id) ?? e)
  }
}

export type DeploymentSlice = Pick<WorkspaceState,
  | 'addDeploymentEnvironment'
  | 'addDeploymentNode' | 'addInfrastructureNode'
  | 'addContainerInstance' | 'addSoftwareSystemInstance'
  | 'renameDeploymentElement' | 'updateDeploymentElement'
>

export const createDeploymentSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  DeploymentSlice
> = (set) => ({
  addDeploymentEnvironment: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return false
    let ok = false
    set((s) => {
      if (!s.workspace) return
      // Environments are identified by name (views reference them by name, and
      // the DSL has no separate identifier) — an existing name is a no-op
      // success so the caller can target it without special-casing.
      if (envByName(s.workspace, trimmed)) { ok = true; return }
      pushUndoSnapshot(s)
      s.workspace.model.deploymentEnvironments ??= []
      s.workspace.model.deploymentEnvironments.push({ id: nanoid(8), name: trimmed, deploymentNodes: [] })
      ok = true
    })
    return ok
  },

  addDeploymentNode: (environment, parentNodeId) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      if (!s.workspace) return
      const env = envByName(s.workspace, environment)
      if (!env) return
      const parent = parentNodeId ? nodeById(env, parentNodeId) : undefined
      if (parentNodeId && !parent) return
      pushUndoSnapshot(s)
      const node: DeploymentNode = {
        id,
        type: 'deploymentNode',
        name: 'New Deployment Node',
        tags: ['Element', 'Deployment Node'],
        properties: {},
        children: [],
        infrastructureNodes: [],
        containerInstances: [],
        softwareSystemInstances: [],
      }
      ;(parent ? parent.children : env.deploymentNodes).push(node)
      refreshDeploymentViews(s.workspace, environment)
      s.layoutVersion += 1
      created = true
    })
    return created ? id : ''
  },

  addInfrastructureNode: (environment, hostNodeId) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      if (!s.workspace) return
      const env = envByName(s.workspace, environment)
      const host = env ? nodeById(env, hostNodeId) : undefined
      if (!host) return
      pushUndoSnapshot(s)
      host.infrastructureNodes.push({
        id,
        type: 'infrastructureNode',
        name: 'New Infrastructure Node',
        tags: ['Element', 'Infrastructure Node'],
        properties: {},
      })
      refreshDeploymentViews(s.workspace, environment)
      s.layoutVersion += 1
      created = true
    })
    return created ? id : ''
  },

  addContainerInstance: (environment, hostNodeId, containerId) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const env = envByName(ws, environment)
      const host = env ? nodeById(env, hostNodeId) : undefined
      const containerExists = ws.model.softwareSystems.some(sys =>
        sys.containers.some(c => c.id === containerId))
      if (!host || !containerExists) return
      pushUndoSnapshot(s)
      host.containerInstances.push({
        id,
        type: 'containerInstance',
        containerId,
        tags: ['Container Instance'],
        properties: {},
      })
      refreshDeploymentViews(ws, environment)
      s.layoutVersion += 1
      created = true
    })
    return created ? id : ''
  },

  addSoftwareSystemInstance: (environment, hostNodeId, softwareSystemId) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const env = envByName(ws, environment)
      const host = env ? nodeById(env, hostNodeId) : undefined
      if (!host || !ws.model.softwareSystems.some(sys => sys.id === softwareSystemId)) return
      pushUndoSnapshot(s)
      host.softwareSystemInstances.push({
        id,
        type: 'softwareSystemInstance',
        softwareSystemId,
        tags: ['Software System Instance'],
        properties: {},
      })
      refreshDeploymentViews(ws, environment)
      s.layoutVersion += 1
      created = true
    })
    return created ? id : ''
  },

  updateDeploymentElement: (environment, id, patch) => set((s) => {
    if (!s.workspace) return
    const env = envByName(s.workspace, environment)
    if (!env) return
    let target: DeploymentNode | InfrastructureNode | undefined
    walkDeploymentNodes(env, (node) => {
      if (node.id === id) target = node
      for (const infra of node.infrastructureNodes) {
        if (infra.id === id) target = infra
      }
    })
    if (!target) return
    let changed = false
    const name = patch.name?.trim()
    if (name && name !== target.name) { changed = true }
    if ('technology' in patch && patch.technology !== target.technology) { changed = true }
    if ('description' in patch && patch.description !== target.description) { changed = true }
    if (!changed) return
    pushUndoSnapshot(s)
    if (name) target.name = name
    if ('technology' in patch) target.technology = patch.technology || undefined
    if ('description' in patch) target.description = patch.description || undefined
  }),

  renameDeploymentElement: (environment, id, name) => set((s) => {
    if (!s.workspace) return
    const env = envByName(s.workspace, environment)
    if (!env) return
    const trimmed = name.trim()
    if (!trimmed) return
    let target: { name: string } | undefined
    walkDeploymentNodes(env, (node) => {
      if (node.id === id) target = node
      for (const infra of node.infrastructureNodes) {
        if (infra.id === id) target = infra
      }
    })
    if (!target || target.name === trimmed) return
    pushUndoSnapshot(s)
    target.name = trimmed
  }),
})
