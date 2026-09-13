import { describe, expect, it } from 'vitest'
import { conceptStem, exportWorkspaceAsOkf, okfBundleName, type OkfFile } from './okfExport'
import { createBigBankSample } from './templates'
import { parseDSL } from './dsl'
import type { Workspace } from '@/types/model'

// A workspace that exercises every section: people, systems, containers,
// components, a deployment environment with nested nodes, instances and an
// infrastructure node, plus one view of each type the DSL can declare. The
// descriptions carry the characters that would break markdown or YAML if
// they were emitted raw.
const FULL_DSL = `
workspace "Big Bank plc" "Banking, but online" {
    model {
        customer = person "Customer" "A bank customer" "External"
        internetBankingSystem = softwareSystem "Internet Banking System" "Lets customers bank | online" {
            webApplication = container "Web Application" "Delivers the \\"SPA\\"" "Java and Spring MVC" {
                signin = component "Sign In Controller" "Handles [sign in]" "Spring MVC"
            }
            database = container "Database" "Stores data" "Oracle" "Database"
            webApplication -> database "Reads from and writes to" "JDBC"
        }
        mainframe = softwareSystem "Mainframe Banking System" "Stores core banking information" {
            url "https://wiki.example.com/mainframe"
            properties {
                "owner" "Core Banking"
                "tier" "1"
            }
        }
        customer -> webApplication "Uses" "HTTPS"
        webApplication -> mainframe "Uses"
        deploymentEnvironment "Live" {
            deploymentNode "AWS" "" "Amazon Web Services" {
                deploymentNode "us-east-1" "" "AWS region" {
                    lb = infrastructureNode "Load Balancer" "Routes traffic" "Elastic Load Balancer"
                    deploymentNode "Web Server" "" "Ubuntu" {
                        instances 4
                        liveWebApp = containerInstance webApplication
                    }
                    deploymentNode "Database Server" "" "Ubuntu" {
                        liveDatabase = containerInstance database
                    }
                }
            }
            deploymentNode "Big Bank plc Data Center" {
                liveMainframe = softwareSystemInstance mainframe
            }
            lb -> liveWebApp "Forwards requests to" "HTTPS"
        }
    }
    views {
        systemLandscape "Landscape" { include * }
        systemContext internetBankingSystem "Context" { include * }
        container internetBankingSystem "Containers" { include * }
        component webApplication "Components" { include * }
        dynamic internetBankingSystem "SignIn" "How sign in works" {
            customer -> webApplication "Submits credentials"
            webApplication -> database "Checks"
            database -> webApplication "Returns the account"
            autoLayout lr
        }
        deployment internetBankingSystem "Live" "LiveDeployment" { include * }
    }
}`

function full(): Workspace {
  const { workspace, errors } = parseDSL(FULL_DSL)
  expect(errors).toHaveLength(0)
  return workspace
}

function byPath(files: OkfFile[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.content]))
}

function frontmatterOf(content: string): Record<string, string> | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content)
  if (!match) return null
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z_]+):(?: (.*))?$/.exec(line)
    if (kv) out[kv[1]] = kv[2] ?? ''
  }
  return out
}

/** Every markdown link target in a file, resolved against the bundle root. */
function linkTargets(path: string, content: string): string[] {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
  const targets: string[] = []
  for (const m of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1]
    if (/^[a-z]+:/.test(target)) continue // external URL
    targets.push(target.startsWith('/') ? target.slice(1) : dir + target)
  }
  return targets
}

describe('exportWorkspaceAsOkf — bundle shape', () => {
  it('lays out a root index, one index per non-empty section, and one concept per element', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    expect([...files.keys()].filter((p) => p.endsWith('/index.md')).sort()).toEqual([
      'components/index.md',
      'containers/index.md',
      'deployment/index.md',
      'people/index.md',
      'systems/index.md',
      'views/index.md',
    ])
    expect(files.has('people/customer.md')).toBe(true)
    expect(files.has('systems/internetBankingSystem.md')).toBe(true)
    expect(files.has('containers/webApplication.md')).toBe(true)
    expect(files.has('components/signin.md')).toBe(true)
    expect(files.has('deployment/lb.md')).toBe(true)
    expect(files.has('views/SignIn.md')).toBe(true)
  })

  it('omits sections that would be empty', () => {
    const files = byPath(exportWorkspaceAsOkf(createBigBankSample()))
    expect(files.has('deployment/index.md')).toBe(false)
    expect(files.get('index.md')).not.toContain('(deployment/)')
  })

  it('every concept has a type, and no concept shadows a reserved index or log name', () => {
    const files = exportWorkspaceAsOkf(full())
    for (const file of files) {
      const stem = file.path.slice(file.path.lastIndexOf('/') + 1, -3)
      const fm = frontmatterOf(file.content)
      if (stem === 'index') {
        // Only the root index carries frontmatter, and only `okf_version`.
        if (file.path === 'index.md') expect(fm).toEqual({ okf_version: '"0.1"' })
        else expect(fm).toBeNull()
        continue
      }
      expect(stem).not.toBe('log')
      expect(fm, file.path).not.toBeNull()
      expect(fm!.type, file.path).toMatch(/^"[A-Za-z]+"$/)
    }
  })

  it('every link in the bundle resolves to a file in the bundle', () => {
    const files = exportWorkspaceAsOkf(full())
    const paths = new Set(files.map((f) => f.path))
    for (const file of files) {
      for (const target of linkTargets(file.path, file.content)) {
        if (target.endsWith('/')) {
          expect(paths.has(`${target}index.md`), `${file.path} -> ${target}`).toBe(true)
        } else {
          expect(paths.has(target), `${file.path} -> ${target}`).toBe(true)
        }
      }
    }
  })

  it('is byte-identical across exports of the same workspace, and across re-parses', () => {
    const a = exportWorkspaceAsOkf(full(), { generator: 'c4hero test' })
    const b = exportWorkspaceAsOkf(full(), { generator: 'c4hero test' })
    expect(a).toEqual(b)
    const bank = createBigBankSample()
    expect(exportWorkspaceAsOkf(bank)).toEqual(exportWorkspaceAsOkf(bank))
  })

  it('never emits a timestamp, so output cannot drift between exports', () => {
    for (const file of exportWorkspaceAsOkf(full())) expect(file.content).not.toMatch(/^timestamp:/m)
  })
})

describe('exportWorkspaceAsOkf — element concepts', () => {
  it('maps element fields onto OKF frontmatter and keeps the DSL identifier', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const fm = frontmatterOf(files.get('containers/webApplication.md')!)!
    expect(fm.type).toBe('"Container"')
    expect(fm.title).toBe('"Web Application"')
    expect(fm.description).toBe('"Delivers the \\"SPA\\""')
    expect(fm.technology).toBe('"Java and Spring MVC"')
    expect(fm.structurizr_id).toBe('"webApplication"')
    expect(fm.parent).toBe('"systems/internetBankingSystem"')
  })

  it('exports url as resource, user tags without the implicit type tags, and properties as a map', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const mainframe = files.get('systems/mainframe.md')!
    expect(mainframe).toContain('resource: "https://wiki.example.com/mainframe"')
    // The parser hoists the `owner` property onto the element; the rest stay a map.
    expect(mainframe).toContain('owner: "Core Banking"')
    expect(mainframe).toContain('properties:\n  "tier": "1"')
    expect(mainframe).not.toMatch(/^tags:/m)

    const database = files.get('containers/database.md')!
    expect(database).toContain('tags: ["Database"]')
    expect(database).not.toContain('"Element"')
    expect(database).not.toContain('"Container"]')
  })

  it('lists every relationship touching the element, with direction, and resolves instances to their element', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const web = files.get('containers/webApplication.md')!
    expect(web).toContain('| -> | [Database](/containers/database.md) | Reads from and writes to | JDBC |')
    expect(web).toContain('| <- | [Customer](/people/customer.md) | Uses | HTTPS |')
    expect(web).toContain('| -> | [Mainframe Banking System](/systems/mainframe.md) | Uses |  |')
    // lb -> liveWebApp is declared against the container *instance*.
    expect(web).toContain('| <- | [Load Balancer](/deployment/lb.md) | Forwards requests to | HTTPS |')
    const lb = files.get('deployment/lb.md')!
    expect(lb).toContain('| -> | [Web Application](/containers/webApplication.md) (instance) | Forwards requests to | HTTPS |')
  })

  it('renders the hierarchy, where an element is deployed, and the views it appears in', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const system = files.get('systems/internetBankingSystem.md')!
    expect(system).toContain('# Containers\n\n- [Web Application](/containers/webApplication.md) (Java and Spring MVC) — Delivers the "SPA"')
    const web = files.get('containers/webApplication.md')!
    expect(web).toContain('# Components\n\n- [Sign In Controller](/components/signin.md) (Spring MVC)')
    expect(web).toContain('# Deployed on\n\n- [Web Server](/deployment/webServer.md) (Live)')
    expect(web).toContain('- [LiveDeployment](/views/LiveDeployment.md) — deployment view')
    expect(web).toContain('- [How sign in works](/views/SignIn.md) — dynamic view')
  })

  it('escapes the characters that would break a table cell, link text or YAML', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const system = files.get('systems/internetBankingSystem.md')!
    expect(system).toContain('description: "Lets customers bank | online"')
    expect(system).toContain('Lets customers bank \\| online')
    expect(files.get('containers/webApplication.md')).toContain('Handles \\[sign in\\]')
  })

  it('escapes backslashes before the markdown escapes it adds', () => {
    const ws = full()
    ws.model.people[0].description = 'Path C:\\temp [x] a|b'
    const files = byPath(exportWorkspaceAsOkf(ws))
    // Frontmatter is JSON-quoted; the body is markdown-escaped.
    expect(files.get('people/customer.md')).toContain('description: "Path C:\\\\temp [x] a|b"')
    expect(files.get('people/customer.md')).toContain('Path C:\\\\temp \\[x\\] a\\|b')
  })
})

describe('exportWorkspaceAsOkf — deployment and views', () => {
  it('gives parser-synthesised ids a name-derived stem and no structurizr_id', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    expect(files.has('deployment/live.md')).toBe(true)
    expect(files.has('deployment/aws.md')).toBe(true)
    expect(files.has('deployment/usEast1.md')).toBe(true)
    expect([...files.keys()].some((p) => /\/p\d+\.md$/.test(p))).toBe(false)
    const env = files.get('deployment/live.md')!
    expect(frontmatterOf(env)).toEqual({ type: '"DeploymentEnvironment"', title: '"Live"' })
    // A node the user *did* name keeps its identifier.
    expect(frontmatterOf(files.get('deployment/lb.md')!)!.structurizr_id).toBe('"lb"')
  })

  it('renders the environment as a node tree with instances and infrastructure', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const env = files.get('deployment/live.md')!
    expect(env).toContain(
      '- [AWS](/deployment/aws.md) (Amazon Web Services)\n' +
      '  - [us-east-1](/deployment/usEast1.md) (AWS region)\n' +
      '    - [Load Balancer](/deployment/lb.md) — infrastructure\n' +
      '    - [Web Server](/deployment/webServer.md) (Ubuntu)\n' +
      '      - [Web Application](/containers/webApplication.md) — container instance',
    )
    const webServer = files.get('deployment/webServer.md')!
    expect(webServer).toContain('instances: "4"')
    expect(webServer).toContain('environment: "Live"')
    expect(webServer).toContain('parent: "deployment/usEast1"')
    expect(webServer).toContain('# Runs here\n\n- [Web Application](/containers/webApplication.md) — container instance')
  })

  it('exports each view with its type, key, scope, elements and relationships', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    const fm = frontmatterOf(files.get('views/Containers.md')!)!
    expect(fm.type).toBe('"View"')
    expect(fm.view_type).toBe('"container"')
    expect(fm.key).toBe('"Containers"')
    expect(fm.scope).toBe('"systems/internetBankingSystem"')
    expect(files.get('views/Containers.md')).toContain('| [Customer](/people/customer.md) | [Web Application](/containers/webApplication.md) | Uses |')

    const dynamic = files.get('views/SignIn.md')!
    expect(dynamic).toContain('| Step | From | To | Description |')
    expect(dynamic).toContain('| 1 | [Customer](/people/customer.md) | [Web Application](/containers/webApplication.md) | Submits credentials |')
    // A response step travels against the model relationship; the step's own
    // endpoints are already in travel order and must not be flipped again.
    expect(dynamic).toContain('| 3 | [Database](/containers/database.md) | [Web Application](/containers/webApplication.md) | Returns the account |')

    const deployment = files.get('views/LiveDeployment.md')!
    expect(frontmatterOf(deployment)!.environment).toBe('"Live"')
    // Instances in a deployment view list as the element they stand for, once.
    expect(deployment.match(/\[Web Application\]\(\/containers\/webApplication\.md\)/g)!.length).toBeGreaterThanOrEqual(1)
    expect(deployment).toContain('| [Load Balancer](/deployment/lb.md) | [Web Application](/containers/webApplication.md) (instance) | Forwards requests to |')
  })

  it('section indexes list every concept with its description', () => {
    const files = byPath(exportWorkspaceAsOkf(full()))
    expect(files.get('containers/index.md')).toContain('- [Web Application](webApplication.md) - Delivers the "SPA"')
    expect(files.get('views/index.md')).toContain('- [How sign in works](SignIn.md) - How sign in works')
    expect(files.get('index.md')).toContain('- [Views](views/) - The diagrams: each view is a focused slice of the model. (6)')
  })

  it('credits the generator in the root index', () => {
    const files = byPath(exportWorkspaceAsOkf(full(), { generator: 'c4hero 9.9.9' }))
    expect(files.get('index.md')).toContain('exported from Structurizr DSL by c4hero 9.9.9.')
  })
})

describe('conceptStem', () => {
  it('keeps a readable identifier as-is', () => {
    expect(conceptStem('apiGateway', new Set())).toBe('apiGateway')
    expect(conceptStem('shop.api', new Set())).toBe('shop.api')
  })

  it('replaces characters a filesystem or URL would choke on', () => {
    expect(conceptStem('view:Sign In/2', new Set())).toBe('view-Sign-In-2')
    expect(conceptStem('...', new Set())).toBe('concept')
  })

  it('sidesteps names Windows cannot create as files', () => {
    expect(conceptStem('con', new Set())).toBe('con-concept')
    expect(conceptStem('LPT1', new Set())).toBe('LPT1-concept')
  })

  it('never produces a reserved name and de-duplicates case-insensitively', () => {
    const taken = new Set<string>()
    expect(conceptStem('index', taken)).toBe('index-concept')
    expect(conceptStem('log', taken)).toBe('log-concept')
    expect(conceptStem('Api', taken)).toBe('Api')
    expect(conceptStem('api', taken)).toBe('api-2')
    expect(conceptStem('API', taken)).toBe('API-3')
  })
})

describe('okfBundleName', () => {
  it('derives from the workspace name with a fallback', () => {
    expect(okfBundleName(full())).toBe('Big Bank plc-okf')
    expect(okfBundleName({ ...full(), name: '  ' })).toBe('workspace-okf')
  })
})
