// #230: a view parsed from `include *` saves the wildcard back, plus a line
// for each element the user hid or added. These drive the real store
// actions through a save and a reopen.
import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import type { DeploymentNode, View, Workspace } from '@/types/model'
import { parseDSL, serializeDSL } from '@/lib/dsl'

const DSL = `workspace {
    model {
        user = person "User"
        a = softwareSystem "System A" {
            web = container "Web" {
                ctrl = component "Controller"
            }
            db = container "Database" {
                repo = component "Repo"
            }
        }
        x = softwareSystem "System X" {
            xapi = container "X API"
        }
        user -> ctrl "Uses"
        web -> db "Reads from"
    }
    views {
        systemLandscape "Landscape" {
            include *
        }
        systemContext a "Context" {
            include *
        }
        container a "Containers" {
            include *
        }
        component web "Components" {
            include *
        }
    }
}
`

const store = () => useWorkspaceStore.getState()
const ws = () => store().workspace!
const save = () => serializeDSL(ws())

function viewsOf(w: Workspace): View[] {
  return [
    ...w.views.systemLandscapeViews,
    ...w.views.systemContextViews,
    ...w.views.containerViews,
    ...w.views.componentViews,
    ...w.views.deploymentViews,
  ]
}

function names(w: Workspace, key: string): string[] {
  const byId = new Map<string, string>()
  for (const p of w.model.people) byId.set(p.id, p.name)
  for (const s of w.model.softwareSystems) {
    byId.set(s.id, s.name)
    for (const c of s.containers) {
      byId.set(c.id, c.name)
      for (const comp of c.components) byId.set(comp.id, comp.name)
    }
  }
  const walk = (n: DeploymentNode) => {
    byId.set(n.id, n.name)
    for (const i of n.infrastructureNodes) byId.set(i.id, i.name)
    for (const ci of n.containerInstances) byId.set(ci.id, `${byId.get(ci.containerId)} instance`)
    for (const si of n.softwareSystemInstances) byId.set(si.id, `${byId.get(si.softwareSystemId)} instance`)
    for (const child of n.children) walk(child)
  }
  for (const env of w.model.deploymentEnvironments) for (const n of env.deploymentNodes) walk(n)
  const view = viewsOf(w).find(v => v.key === key)!
  return view.elements.map(e => byId.get(e.id) ?? e.id).sort()
}

/** The trimmed include/exclude lines of the view whose header names `key`. */
function lines(dsl: string, key: string): string[] {
  const all = dsl.split('\n').map(l => l.trim())
  const start = all.findIndex(l => l.includes(`"${key}"`) && l.endsWith('{'))
  expect(start).toBeGreaterThanOrEqual(0)
  return all.slice(start + 1, all.indexOf('}', start)).filter(l => /^(include|exclude) /.test(l))
}

/** Saving and reopening shows every view exactly as the canvas does now. */
function expectReopenMatchesCanvas(): void {
  const { workspace: reopened, errors } = parseDSL(save())
  expect(errors).toEqual([])
  for (const v of viewsOf(ws())) expect([v.key, names(reopened, v.key)]).toEqual([v.key, names(ws(), v.key)])
}

describe('include * views in the store (#230)', () => {
  beforeEach(() => {
    store().loadWorkspace(parseDSL(DSL).workspace)
  })

  it('shows an element connected from another view, and saves plain include *', () => {
    store().setActiveView('Components')
    store().toggleElementInView('Components', 'x')
    store().addRelationship('ctrl', 'xapi', 'Calls')

    // Structurizr shows System X wherever the wildcard now adds it, never
    // its container; the canvas does too.
    expect(names(ws(), 'Context')).toEqual(['System A', 'System X', 'User'])
    expect(names(ws(), 'Containers')).toEqual(['Database', 'System X', 'User', 'Web'])
    expect(names(ws(), 'Components')).toEqual(['Controller', 'System X', 'User'])

    const dsl = save()
    for (const key of ['Landscape', 'Context', 'Containers', 'Components']) expect(lines(dsl, key)).toEqual(['include *'])
    expectReopenMatchesCanvas()
  })

  it('shows people and systems created and connected in a container view in the context view', () => {
    store().setActiveView('Containers')
    const payments = store().addSoftwareSystem('Payments')
    store().addRelationship('web', payments, 'Charges')
    const admin = store().addPerson('Admin')
    store().addRelationship(admin, 'web', 'Administers')

    expect(names(ws(), 'Context')).toEqual(['Admin', 'Payments', 'System A', 'User'])
    const dsl = save()
    for (const key of ['Landscape', 'Context', 'Containers', 'Components']) expect(lines(dsl, key)).toEqual(['include *'])
    expectReopenMatchesCanvas()
  })

  it('saves a hide as an exclude, keeps it through later edits, and drops it when shown again', () => {
    store().removeElementsFromView('Context', ['user'])
    expect(lines(save(), 'Context')).toEqual(['include *', 'exclude user'])

    // A new relationship to the scoped system does not bring the hidden
    // element back, here or in Structurizr.
    store().addRelationship('user', 'a', 'Pays')
    expect(names(ws(), 'Context')).toEqual(['System A'])
    expect(lines(save(), 'Context')).toEqual(['include *', 'exclude user'])
    expectReopenMatchesCanvas()

    store().toggleElementInView('Context', 'user')
    expect(lines(save(), 'Context')).toEqual(['include *'])
    store().undo()
    expect(lines(save(), 'Context')).toEqual(['include *', 'exclude user'])
  })

  it('saves hiding another system from a component view as an exclude Structurizr applies', () => {
    store().addRelationship('ctrl', 'xapi', 'Calls')
    store().removeElementsFromView('Components', ['x'])
    expect(lines(save(), 'Components')).toEqual(['include *', 'exclude x'])
    expect(names(ws(), 'Components')).toEqual(['Controller', 'User'])
    expectReopenMatchesCanvas()
  })

  it('saves an element added to a view that the wildcard would not add as an include', () => {
    store().toggleElementInView('Containers', 'x')
    expect(lines(save(), 'Containers')).toEqual(['include *', 'include x'])
    expectReopenMatchesCanvas()
    store().toggleElementInView('Containers', 'x')
    expect(lines(save(), 'Containers')).toEqual(['include *'])
    expect(ws().views.containerViews[0].excludedElementIds).toBeUndefined()
  })

  it('shows a container of another system in place of that system, as Structurizr will', () => {
    store().addRelationship('web', 'xapi', 'Calls')
    store().toggleElementInView('Containers', 'xapi')
    expect(names(ws(), 'Containers')).toEqual(['Database', 'User', 'Web', 'X API'])
    // Written before the wildcard, the container keeps System X out.
    expect(lines(save(), 'Containers')).toEqual(['include xapi', 'include *'])
    expectReopenMatchesCanvas()

    // Taking the container away brings the system back.
    store().toggleElementInView('Containers', 'xapi')
    expect(names(ws(), 'Containers')).toEqual(['Database', 'System X', 'User', 'Web'])
    expect(lines(save(), 'Containers')).toEqual(['include *'])
  })

  it('shows a component of another container in place of that container', () => {
    store().addRelationship('ctrl', 'db', 'Reads from')
    expect(names(ws(), 'Components')).toEqual(['Controller', 'Database', 'User'])
    store().toggleElementInView('Components', 'repo')
    expect(names(ws(), 'Components')).toEqual(['Controller', 'Repo', 'User'])
    expect(lines(save(), 'Components')).toEqual(['include *', 'exclude db', 'include repo'])
    expectReopenMatchesCanvas()
  })

  it('keeps a component shown in place of its container when a relationship brings the container in', () => {
    store().setActiveView('Components')
    store().toggleElementInView('Components', 'repo')
    store().addRelationship('ctrl', 'repo', 'Calls')
    // The wildcard now adds Database, which cannot show next to Repo.
    expect(names(ws(), 'Components')).toEqual(['Controller', 'Repo', 'User'])
    const saved = save()
    expect(lines(saved, 'Components')).toEqual(['include *', 'exclude db', 'include repo'])
    expectReopenMatchesCanvas()
    expect(serializeDSL(parseDSL(saved).workspace)).toBe(saved)

    // Taking Repo away brings Database back.
    store().toggleElementInView('Components', 'repo')
    expect(names(ws(), 'Components')).toEqual(['Controller', 'Database', 'User'])
    expect(lines(save(), 'Components')).toEqual(['include *'])
  })

  it('shows what a relationship created by a dynamic step brings into the wildcard', () => {
    store().loadWorkspace(parseDSL(DSL.replace('    views {\n', `    views {
        dynamic a "Dynamic" {
            web -> db "Reads from"
        }
`)).workspace)
    store().setActiveView('Dynamic')
    store().addDynamicStep('Dynamic', 'web', 'x', 'Calls')
    expect(names(ws(), 'Context')).toEqual(['System A', 'System X', 'User'])
    expect(names(ws(), 'Containers')).toEqual(['Database', 'System X', 'User', 'Web'])
    const dsl = save()
    for (const key of ['Landscape', 'Context', 'Containers', 'Components']) expect(lines(dsl, key)).toEqual(['include *'])
    expectReopenMatchesCanvas()
  })

  it('follows a hidden element through a rename and forgets it on delete', () => {
    store().removeElementsFromView('Context', ['user'])
    expect(store().updateElementId('user', 'customer')).toBeNull()
    expect(lines(save(), 'Context')).toEqual(['include *', 'exclude customer'])

    store().deleteElements(['customer'])
    expect(ws().views.systemContextViews[0].excludedElementIds).toBeUndefined()
    expect(lines(save(), 'Context')).toEqual(['include *'])
  })

  it('keeps the hide in a duplicated view', () => {
    store().removeElementsFromView('Context', ['user'])
    const copy = store().duplicateView('Context')
    const view = viewsOf(ws()).find(v => v.key === copy)!
    expect(view.includeAll).toBe(true)
    expect(view.excludedElementIds).toEqual(['user'])
  })
})

describe('include * deployment views in the store (#230)', () => {
  const DEPLOYMENT_DSL = `workspace {
    model {
        sys = softwareSystem "Sys" {
            web = container "Web"
            db = container "DB"
        }
        ext = softwareSystem "Mainframe"
        deploymentEnvironment "Live" {
            aws = deploymentNode "AWS" {
                lb = infrastructureNode "Load Balancer"
                webServer = deploymentNode "Web Server" {
                    liveWeb = containerInstance web
                }
                dbServer = deploymentNode "DB Server" {
                    liveDb = containerInstance db
                }
            }
            dc = deploymentNode "DC" {
                softwareSystemInstance ext
            }
            lb -> liveWeb "Forwards to"
        }
    }
    views {
        deployment * "Live" "LiveAll" {
            include *
            exclude dc
        }
    }
}
`

  beforeEach(() => {
    store().loadWorkspace(parseDSL(DEPLOYMENT_DSL).workspace)
  })

  it('hides what is on an excluded deployment node, as Structurizr does', () => {
    expect(names(ws(), 'LiveAll')).toEqual(['AWS', 'DB Server', 'DB instance', 'Load Balancer', 'Web Server', 'Web instance'])
  })

  it('keeps an author exclude when a deployment edit re-expands the view', () => {
    store().addContainerInstance('Live', 'webServer', 'db')
    expect(names(ws(), 'LiveAll')).not.toContain('DC')
    expect(names(ws(), 'LiveAll')).not.toContain('Mainframe instance')
    expect(lines(save(), 'LiveAll')).toEqual(['include *', 'exclude dc'])
    expectReopenMatchesCanvas()
  })

  it('shows what runs on a deployment node shown again', () => {
    store().toggleElementInView('LiveAll', 'dc')
    expect(names(ws(), 'LiveAll')).toContain('DC')
    expect(names(ws(), 'LiveAll')).toContain('Mainframe instance')
    expect(lines(save(), 'LiveAll')).toEqual(['include *'])
    expectReopenMatchesCanvas()
  })

  it('ignores an exclude written before include *, through later deployment edits', () => {
    // Structurizr applies statements in order: the exclude hides nothing.
    store().loadWorkspace(parseDSL(DEPLOYMENT_DSL.replace('include *\n            exclude dc', 'exclude dc\n            include *')).workspace)
    expect(names(ws(), 'LiveAll')).toContain('Mainframe instance')
    store().addContainerInstance('Live', 'webServer', 'db')
    expect(names(ws(), 'LiveAll')).toContain('DC')
    expect(names(ws(), 'LiveAll')).toContain('Mainframe instance')
    expect(lines(save(), 'LiveAll')).toEqual(['include *'])
    expectReopenMatchesCanvas()
  })

  it('hides what is on a deployment node hidden from the view', () => {
    store().removeElementsFromView('LiveAll', ['dbServer'])
    expect(names(ws(), 'LiveAll')).toEqual(['AWS', 'Load Balancer', 'Web Server', 'Web instance'])
    expect(lines(save(), 'LiveAll')).toEqual(['include *', 'exclude dc', 'exclude dbServer'])
    expectReopenMatchesCanvas()
  })
})
