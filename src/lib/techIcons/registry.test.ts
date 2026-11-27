import { describe, it, expect } from 'vitest'
import { TECH_ICON_CATALOG } from './catalog'
import {
  TECH_ICON_SLUGS, isTechIconSlug, matchTechIcon, normalizeTech, resolveTechIcon, techIconColor,
} from './registry'
import { applyElementPatch } from '@/store/workspace-helpers'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

describe('tech icon registry', () => {
  it('has catalog data for every slug it can match', () => {
    for (const slug of TECH_ICON_SLUGS) {
      const icon = TECH_ICON_CATALOG[slug]
      expect(icon, slug).toBeDefined()
      expect(icon.path.length, slug).toBeGreaterThan(0)
      expect(icon.hex, slug).toMatch(/^[0-9A-F]{6}$/i)
    }
    expect(Object.keys(TECH_ICON_CATALOG).sort()).toEqual([...TECH_ICON_SLUGS].sort())
  })

  it('drops trailing versions when normalizing', () => {
    expect(normalizeTech('Java 21')).toBe('java')
    expect(normalizeTech('PostgreSQL 16.2')).toBe('postgresql')
    expect(normalizeTech('Node.js v20 LTS')).toBe('node.js')
    expect(normalizeTech('Python 3.x')).toBe('python')
    expect(normalizeTech('  Spring   Boot ')).toBe('spring boot')
  })

  it.each([
    ['Kotlin, Micronaut', 'kotlin'],
    ['Micronaut, Kotlin', 'kotlin'],
    ['React', 'react'],
    ['React Native', 'react'],
    ['.NET, Duende', 'dotnet'],
    ['C#', 'dotnet'],
    ['Java 17', 'openjdk'],
    ['Spring Boot (Java)', 'springboot'],
    ['Postgres', 'postgresql'],
    ['Amazon Aurora PostgreSQL', 'postgresql'],
    ['Apache Kafka', 'apachekafka'],
    ['TypeScript/Node.js', 'typescript'],
    ['Go', 'go'],
    ['Kotlin service', 'kotlin'],
    ['Single-page app with Angular', 'angular'],
    ['Vue 3', 'vuedotjs'],
  ])('matches %j to %s', (tech, slug) => {
    expect(matchTechIcon(tech)).toBe(slug)
  })

  it.each([
    [undefined],
    [''],
    ['Micronaut'],
    ['Go to market'],
    ['Elastic Beanstalk'],
    ['Apache Camel'],
    ['JavaScript-free'],
    ['HTTPS'],
  ])('finds no icon for %j', (tech) => {
    expect(matchTechIcon(tech)).toBeUndefined()
  })

  it('does not confuse JavaScript with Java', () => {
    expect(matchTechIcon('JavaScript')).toBe('javascript')
  })

  it('prefers a pinned icon, hides on none, and falls back to auto for unknown pins', () => {
    expect(resolveTechIcon({ 'c4hero.icon': 'redis' }, 'Kotlin')).toBe('redis')
    expect(resolveTechIcon({ 'c4hero.icon': ' Redis ' }, 'Kotlin')).toBe('redis')
    expect(resolveTechIcon({ 'c4hero.icon': 'none' }, 'Kotlin')).toBeUndefined()
    expect(resolveTechIcon({ 'c4hero.icon': 'not-a-logo' }, 'Kotlin')).toBe('kotlin')
    expect(resolveTechIcon({}, 'Kotlin')).toBe('kotlin')
    expect(resolveTechIcon(undefined, undefined)).toBeUndefined()
    expect(isTechIconSlug('constructor')).toBe(false)
  })

  it('keeps brand colours that read on the canvas and falls back otherwise', () => {
    // Kotlin purple reads on the dark canvas.
    expect(techIconColor('7F52FF', '#0d1117', 'var(--x)')).toBe('#7F52FF')
    // Kafka's near-black does not.
    expect(techIconColor('231F20', '#0d1117', 'var(--x)')).toBe('var(--x)')
    // A white mark on a light canvas does not either.
    expect(techIconColor('FFFFFF', '#f8fafc', 'var(--x)')).toBe('var(--x)')
    // Unparseable input falls back rather than guessing.
    expect(techIconColor('7F52FF', 'var(--canvas-bg)', 'var(--x)')).toBe('var(--x)')
  })
})

function workspace(properties: Record<string, string> = {}): Workspace {
  return {
    name: 'Icons',
    model: {
      people: [],
      softwareSystems: [{
        id: 'link', type: 'softwareSystem', name: 'Link Player', tags: ['Element', 'Software System'], properties: {},
        containers: [{
          id: 'api', type: 'container', name: 'Link API Service', technology: 'Kotlin, Micronaut',
          tags: ['Element', 'Container'], properties, components: [],
        }],
      }],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      dynamicViews: [], deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  } as unknown as Workspace
}

describe('pinned icon storage', () => {
  it('sets, replaces and clears the c4hero.icon property through the element patch', () => {
    const ws = workspace({ team: 'Links' })
    const props = () => ws.model.softwareSystems[0].containers[0].properties
    expect(applyElementPatch(ws, 'api', { icon: 'redis' })).toBe(true)
    expect(props()).toEqual({ team: 'Links', 'c4hero.icon': 'redis' })
    expect(applyElementPatch(ws, 'api', { icon: 'redis' })).toBe(false)
    expect(applyElementPatch(ws, 'api', { icon: 'none' })).toBe(true)
    expect(props()['c4hero.icon']).toBe('none')
    expect(applyElementPatch(ws, 'api', { icon: undefined })).toBe(true)
    expect(props()).toEqual({ team: 'Links' })
    expect(applyElementPatch(ws, 'api', { icon: undefined })).toBe(false)
  })

  it('round-trips a pinned icon through Structurizr DSL as a property', () => {
    const dsl = serializeDSL(workspace({ 'c4hero.icon': 'redis' }))
    expect(dsl).toContain('"c4hero.icon" "redis"')
    const { workspace: parsed } = parseDSL(dsl)
    expect(parsed.model.softwareSystems[0].containers[0].properties['c4hero.icon']).toBe('redis')
    expect(serializeDSL(parsed)).toBe(dsl)
  })
})
