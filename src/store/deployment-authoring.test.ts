import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { parseDSL, serializeDSL } from '@/lib/dsl'

const DSL = `workspace {
  model {
    sys = softwareSystem "Sys" {
      web = container "Web"
      db = container "DB"
    }
    other = softwareSystem "Other"
    web -> db "Reads"
    deploymentEnvironment "Live" {
      server = deploymentNode "Server" {
        liveWeb = containerInstance web
      }
    }
  }
  views {
    deployment * "Live" "Dep" { include * }
  }
}`

function load() {
  const { workspace: ws, errors } = parseDSL(DSL)
  expect(errors).toHaveLength(0)
  useWorkspaceStore.getState().loadWorkspace(ws)
}

function ws() {
  return useWorkspaceStore.getState().workspace!
}

function env() {
  return ws().model.deploymentEnvironments![0]
}

function depView() {
  return ws().views.deploymentViews[0]
}

describe('deployment topology authoring', () => {
  beforeEach(() => {
    load()
  })

  it('adds a top-level and a nested deployment node, and the view picks both up', () => {
    const topId = useWorkspaceStore.getState().addDeploymentNode('Live', null)
    expect(topId).not.toBe('')
    const nestedId = useWorkspaceStore.getState().addDeploymentNode('Live', topId)
    expect(env().deploymentNodes).toHaveLength(2)
    const top = env().deploymentNodes.find(n => n.id === topId)!
    expect(top.children[0].id).toBe(nestedId)
    for (const id of [topId, nestedId]) {
      expect(depView().elements.some(e => e.id === id)).toBe(true)
    }
  })

  it('adds infrastructure and instances to a host node', () => {
    const serverId = env().deploymentNodes[0].id
    const infraId = useWorkspaceStore.getState().addInfrastructureNode('Live', serverId)
    const dbId = ws().model.softwareSystems[0].containers.find(c => c.name === 'DB')!.id
    const instId = useWorkspaceStore.getState().addContainerInstance('Live', serverId, dbId)
    const otherId = ws().model.softwareSystems.find(s => s.name === 'Other')!.id
    const sysInstId = useWorkspaceStore.getState().addSoftwareSystemInstance('Live', serverId, otherId)

    const server = env().deploymentNodes[0]
    expect(server.infrastructureNodes.some(i => i.id === infraId)).toBe(true)
    expect(server.containerInstances.some(i => i.id === instId)).toBe(true)
    expect(server.softwareSystemInstances.some(i => i.id === sysInstId)).toBe(true)
    for (const id of [infraId, instId, sysInstId]) {
      expect(depView().elements.some(e => e.id === id)).toBe(true)
    }
    // The derived instance relationship (web -> db) now has both instance
    // endpoints in the environment, so the canvas edge builder can draw it —
    // covered by deploymentViewRelationships, membership is what we assert.
  })

  it('scoped deployment views only pick up instances of their system', () => {
    // Add a scoped view for sys, then instances of sys's container and Other.
    useWorkspaceStore.getState().addView('deployment', ws().model.softwareSystems[0].id, 'SysDep', { environment: 'Live' })
    const serverId = env().deploymentNodes[0].id
    const otherId = ws().model.softwareSystems.find(s => s.name === 'Other')!.id
    const sysInstId = useWorkspaceStore.getState().addSoftwareSystemInstance('Live', serverId, otherId)
    const scoped = ws().views.deploymentViews.find(v => v.softwareSystemId)!
    expect(scoped.elements.some(e => e.id === sysInstId)).toBe(false)
    expect(depView().elements.some(e => e.id === sysInstId)).toBe(true)
  })

  it('preserves positions of surviving elements across a topology change', () => {
    const serverId = env().deploymentNodes[0].id
    const v = depView()
    const el = v.elements.find(e => e.id === serverId)!
    el.x = 123
    el.y = 456
    useWorkspaceStore.getState().addInfrastructureNode('Live', serverId)
    const after = depView().elements.find(e => e.id === serverId)!
    expect(after.x).toBe(123)
    expect(after.y).toBe(456)
  })

  it('renames nodes and infrastructure, not instances', () => {
    const serverId = env().deploymentNodes[0].id
    useWorkspaceStore.getState().renameDeploymentElement('Live', serverId, 'App Server')
    expect(env().deploymentNodes[0].name).toBe('App Server')
    const instId = env().deploymentNodes[0].containerInstances[0].id
    useWorkspaceStore.getState().renameDeploymentElement('Live', instId, 'nope')
    expect(env().deploymentNodes[0].containerInstances[0]).not.toHaveProperty('name', 'nope')
  })

  it('deleting an instance directly prunes it and its view refs', () => {
    const instId = env().deploymentNodes[0].containerInstances[0].id
    useWorkspaceStore.getState().deleteElements([instId])
    expect(env().deploymentNodes[0].containerInstances).toHaveLength(0)
    expect(depView().elements.some(e => e.id === instId)).toBe(false)
    // The post-delete workspace still parses.
    const { errors } = parseDSL(serializeDSL(ws()))
    expect(errors).toHaveLength(0)
  })

  it('deleting a deployment node takes its subtree, and explicit relationships to it, with it', () => {
    const serverId = env().deploymentNodes[0].id
    const infraId = useWorkspaceStore.getState().addInfrastructureNode('Live', serverId)
    const nestedId = useWorkspaceStore.getState().addDeploymentNode('Live', serverId)
    const instId = env().deploymentNodes[0].containerInstances[0].id
    // An explicit relationship touching the infra node
    useWorkspaceStore.getState().addRelationship(infraId, instId, 'routes to')
    expect(ws().model.relationships.some(r => r.sourceId === infraId)).toBe(true)

    useWorkspaceStore.getState().deleteElements([serverId])
    expect(env().deploymentNodes).toHaveLength(0)
    expect(ws().model.relationships.some(r => r.sourceId === infraId)).toBe(false)
    for (const id of [serverId, infraId, nestedId, instId]) {
      expect(depView().elements.some(e => e.id === id)).toBe(false)
    }
    const { errors } = parseDSL(serializeDSL(ws()))
    expect(errors).toHaveLength(0)
  })

  it('authored topology round-trips through the DSL', () => {
    const serverId = env().deploymentNodes[0].id
    const nestedId = useWorkspaceStore.getState().addDeploymentNode('Live', serverId)
    useWorkspaceStore.getState().renameDeploymentElement('Live', nestedId, 'Pod')
    useWorkspaceStore.getState().addInfrastructureNode('Live', nestedId)
    const dbId = ws().model.softwareSystems[0].containers.find(c => c.name === 'DB')!.id
    useWorkspaceStore.getState().addContainerInstance('Live', nestedId, dbId)

    const { workspace: reparsed, errors } = parseDSL(serializeDSL(ws()))
    expect(errors).toHaveLength(0)
    const reEnv = reparsed.model.deploymentEnvironments![0]
    const pod = reEnv.deploymentNodes[0].children.find(n => n.name === 'Pod')!
    expect(pod).toBeDefined()
    expect(pod.infrastructureNodes).toHaveLength(1)
    expect(pod.containerInstances).toHaveLength(1)
    // The reparsed instance references the DB container by its id
    const reDb = reparsed.model.softwareSystems[0].containers.find(c => c.name === 'DB')!
    expect(pod.containerInstances[0].containerId).toBe(reDb.id)
  })

  it('topology edits are undoable', () => {
    const serverId = env().deploymentNodes[0].id
    useWorkspaceStore.getState().addInfrastructureNode('Live', serverId)
    expect(env().deploymentNodes[0].infrastructureNodes).toHaveLength(1)
    useWorkspaceStore.getState().undo()
    expect(env().deploymentNodes[0].infrastructureNodes).toHaveLength(0)
  })

  it('no-ops cleanly on bad input', () => {
    expect(useWorkspaceStore.getState().addDeploymentNode('Nope', null)).toBe('')
    expect(useWorkspaceStore.getState().addInfrastructureNode('Live', 'missing')).toBe('')
    expect(useWorkspaceStore.getState().addContainerInstance('Live', env().deploymentNodes[0].id, 'missing')).toBe('')
    expect(env().deploymentNodes).toHaveLength(1)
  })
})

describe('addDeploymentEnvironment', () => {
  beforeEach(() => {
    load()
  })

  it('creates an empty environment', () => {
    expect(useWorkspaceStore.getState().addDeploymentEnvironment('Staging')).toBe(true)
    const envs = ws().model.deploymentEnvironments!
    expect(envs.map(e => e.name)).toEqual(['Live', 'Staging'])
    expect(envs[1].deploymentNodes).toEqual([])
    expect(envs[1].id).toBeTruthy()
  })

  it('is a no-op success for an existing name (environments are name-keyed)', () => {
    expect(useWorkspaceStore.getState().addDeploymentEnvironment('Live')).toBe(true)
    expect(ws().model.deploymentEnvironments).toHaveLength(1)
  })

  it('rejects a blank name', () => {
    expect(useWorkspaceStore.getState().addDeploymentEnvironment('   ')).toBe(false)
    expect(ws().model.deploymentEnvironments).toHaveLength(1)
  })

  it('supports authoring into the new environment immediately', () => {
    useWorkspaceStore.getState().addDeploymentEnvironment('Staging')
    const nodeId = useWorkspaceStore.getState().addDeploymentNode('Staging', null)
    expect(nodeId).not.toBe('')
    expect(ws().model.deploymentEnvironments![1].deploymentNodes).toHaveLength(1)
  })
})
