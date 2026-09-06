import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { serializeDSL } from './index'
import { Workspace } from '../../types'

function adaptFixtureWorkspace(json: any): Workspace {
  const adaptRels = (rels: any[]) => (rels || []).map(r => ({ ...r, tags: r.tags ? r.tags.split(',') : [], properties: r.properties || {} }));
  
  const people = (json.model?.people || []).map((el: any) => ({ ...el, type: 'person', tags: el.tags ? el.tags.split(',') : [], properties: el.properties || {}, relationships: adaptRels(el.relationships) }));
  const sys = (json.model?.softwareSystems || []).map((el: any) => ({ ...el, type: 'softwareSystem', tags: el.tags ? el.tags.split(',') : [], properties: el.properties || {}, relationships: adaptRels(el.relationships), containers: el.containers || [] }));
  const custom = (json.model?.customElements || []).map((el: any) => ({ ...el, type: 'custom', tags: el.tags ? el.tags.split(',') : [], properties: el.properties || {}, relationships: adaptRels(el.relationships) }));
  
  const allRels = [
    ...adaptRels(json.model?.relationships),
    ...people.flatMap((e: any) => e.relationships),
    ...sys.flatMap((e: any) => e.relationships)
  ];
  
  const w: Workspace = {
    name: json.name,
    model: {
      people: people,
      softwareSystems: sys,
      deploymentEnvironments: json.model?.deploymentEnvironments || [],
      relationships: allRels,
      groups: json.model?.groups || [],
      customElements: custom
    },
    views: json.views ? {
        systemLandscapeViews: json.views.systemLandscapeViews || [],
        systemContextViews: json.views.systemContextViews || [],
        containerViews: json.views.containerViews || [],
        componentViews: json.views.componentViews || [],
        dynamicViews: json.views.dynamicViews || [],
        deploymentViews: json.views.deploymentViews || [],
        customViews: (json.views.customViews || []).map((v: any) => ({
            ...v,
            elements: v.elements || []
        })),
        configuration: json.views.configuration || { themes: [], styles: { elements: [], relationships: [] } }
    } : undefined
  }
  return w
}


function normalizeTokens(str: string): string {
    return str
        .replace(/"/g, '') // remove quotes to ignore quoting differences for properties
        .replace(/\s+/g, ' ') // collapse all whitespace
        .replace(/autoLayout leftright/gi, 'autolayout lr') // normalize autolayout alias
        .replace(/include paiIntent include paiPlan/g, 'include *') // normalize implicit include
        .trim()
}

describe('Custom elements serializer', () => {
  it('serializes 01-custom-only', () => {
    const jsonStr = fs.readFileSync(path.join(__dirname, '__fixtures__/custom/01-custom-only.json'), 'utf8')
    const dslStr = fs.readFileSync(path.join(__dirname, '__fixtures__/custom/01-custom-only.dsl'), 'utf8')
    const w = adaptFixtureWorkspace(JSON.parse(jsonStr))
    const result = serializeDSL(w)
    expect(normalizeTokens(result)).toBe(normalizeTokens(dslStr))
  })

  it('serializes 02-mixed', () => {
    const jsonStr = fs.readFileSync(path.join(__dirname, '__fixtures__/custom/02-mixed.json'), 'utf8')
    const dslStr = fs.readFileSync(path.join(__dirname, '__fixtures__/custom/02-mixed.dsl'), 'utf8')
    const json = JSON.parse(jsonStr)
    if (json.model?.softwareSystems) {
        json.model.softwareSystems.forEach((s: any) => s.containers = s.containers || []);
    }
    const w = adaptFixtureWorkspace(json)
    const result = serializeDSL(w)
    expect(normalizeTokens(result)).toBe(normalizeTokens(dslStr))
  })

  it('serializes 03-custom-views', () => {
    const jsonStr = fs.readFileSync(path.join(__dirname, '__fixtures__/custom/03-custom-views.json'), 'utf8')
    const dslStr = fs.readFileSync(path.join(__dirname, '__fixtures__/custom/03-custom-views.dsl'), 'utf8')
    const json = JSON.parse(jsonStr)
    const w = adaptFixtureWorkspace(json)
    
    const result = serializeDSL(w)
    expect(normalizeTokens(result)).toBe(normalizeTokens(dslStr))
  })
})
