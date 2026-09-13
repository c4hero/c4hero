import type {
  Component,
  Container,
  DeploymentEnvironment,
  DeploymentNode,
  InfrastructureNode,
  ModelElement,
  Relationship,
  SoftwareSystem,
  View,
  Workspace,
} from '@/types/model'
import { deriveIdFromName } from '@/lib/identifier'
import { WINDOWS_RESERVED_NAME } from '@/lib/filenames'
import { allViewsOf } from '@/store/workspace-helpers'

/**
 * Export a workspace as an Open Knowledge Format (OKF v0.1) bundle.
 *
 * The interactive HTML export is the architecture for humans; this is the
 * architecture for agents. An OKF bundle is a directory of markdown files
 * with YAML frontmatter, cross-linked by path — the shape knowledge tools
 * and LLM retrieval pipelines already index — so a workspace exported this
 * way can be searched, graphed and cited by anything that reads OKF without
 * c4hero growing a backend or a search index of its own.
 *
 * The Structurizr DSL stays the source of truth. This is a one-way, lossy
 * projection: model structure, descriptions, metadata and view membership
 * come across; layout, styles and directives do not.
 *
 * Bundle layout (a section is omitted when it would be empty):
 *
 *   index.md                  root — the only index with frontmatter
 *   people/index.md           people/<id>.md
 *   systems/index.md          systems/<id>.md
 *   containers/index.md       containers/<id>.md
 *   components/index.md       components/<id>.md
 *   deployment/index.md       deployment/<id>.md  (environments, nodes, infra)
 *   views/index.md            views/<key>.md
 *
 * Spec rules honoured: `type` is the one required frontmatter key; `index`
 * and `log` are reserved names and never used for a concept; index files
 * carry no frontmatter (the root declares only `okf_version`); links between
 * concepts are bundle-relative and start with `/`.
 *
 * Deterministic: the same workspace produces byte-identical output (no
 * timestamps, no counters), so a re-export diffs cleanly in review. That is
 * why the spec's recommended `timestamp` key is deliberately absent.
 */

// ─── Public API ──────────────────────────────────────────────────────

export interface OkfFile {
  /** Path relative to the bundle root, `/`-separated. */
  path: string
  content: string
}

export interface OkfExportOptions {
  /** Credited in the root index, e.g. `c4hero 0.6.0`. */
  generator?: string
}

export const OKF_VERSION = '0.1'

export function exportWorkspaceAsOkf(workspace: Workspace, options: OkfExportOptions = {}): OkfFile[] {
  const ctx = buildContext(workspace)
  const files: OkfFile[] = []

  const sections: SectionOutput[] = [
    peopleSection(ctx),
    systemsSection(ctx),
    containersSection(ctx),
    componentsSection(ctx),
    deploymentSection(ctx),
    viewsSection(ctx),
  ].filter((s) => s.concepts.length > 0)

  files.push({ path: 'index.md', content: rootIndex(workspace, sections, options.generator) })
  for (const section of sections) {
    files.push({ path: `${section.dir}/index.md`, content: sectionIndex(section) })
    for (const concept of section.concepts) files.push({ path: concept.path, content: concept.content })
  }
  return files
}

/** Suggested base name for a bundle download, e.g. `Big Bank plc-okf`. */
export function okfBundleName(workspace: Workspace): string {
  return `${workspace.name?.trim() || 'workspace'}-okf`
}

// ─── Context ─────────────────────────────────────────────────────────

type ConceptNode = ModelElement | DeploymentNode | InfrastructureNode

interface Ctx {
  ws: Workspace
  /** Element / node / environment / view id → bundle path (`people/customer.md`). */
  paths: Map<string, string>
  /** Display name per addressable id, for link text and unresolved mentions. */
  names: Map<string, string>
  /** Container / system instance id → the element it instantiates. */
  instanceOf: Map<string, string>
  /** Element id → the deployment nodes that host an instance of it. */
  hostedOn: Map<string, DeploymentNode[]>
  /** Parent element id per container / component / nested node. */
  parents: Map<string, string>
  /** Element id → views that include it (instances count for their element). */
  inViews: Map<string, View[]>
  /** The deployment environment each node / infra node lives in. */
  environmentOf: Map<string, DeploymentEnvironment>
  /** Bundle id per view (`view:<key>`, suffixed when keys collide). */
  viewIds: Map<View, string>
  /** Relationship id → relationship. */
  relById: Map<string, Relationship>
  /** Element id → every relationship touching it (instances resolved to
   *  their element, a self-relationship listed once). */
  relsOf: Map<string, Relationship[]>
}

const SECTION_DIRS = {
  people: 'people',
  systems: 'systems',
  containers: 'containers',
  components: 'components',
  deployment: 'deployment',
  views: 'views',
} as const

/** Names the spec reserves for index and log files. A concept stem is never
 *  allowed to shadow them. */
const RESERVED_STEMS = new Set(['index', 'log'])

function buildContext(ws: Workspace): Ctx {
  const paths = new Map<string, string>()
  const names = new Map<string, string>()
  const instanceOf = new Map<string, string>()
  const hostedOn = new Map<string, DeploymentNode[]>()
  const parents = new Map<string, string>()
  const inViews = new Map<string, View[]>()
  const environmentOf = new Map<string, DeploymentEnvironment>()
  const viewIds = new Map<View, string>()
  const relById = new Map<string, Relationship>()
  const relsOf = new Map<string, Relationship[]>()

  const taken = new Map<string, Set<string>>()
  const assign = (dir: string, id: string, name: string, stemSource?: string) => {
    let set = taken.get(dir)
    if (!set) taken.set(dir, (set = new Set()))
    // A parser-synthesised id (an element declared without `x = …`) is
    // positional, so the stem comes from the name instead — that keeps the
    // path stable when a line is added above the element.
    const stem = stemSource ?? (isSyntheticId(id) ? deriveIdFromName(name) : id)
    paths.set(id, `${dir}/${conceptStem(stem, set)}.md`)
    names.set(id, name)
  }

  for (const p of ws.model.people) assign(SECTION_DIRS.people, p.id, p.name)
  for (const sys of ws.model.softwareSystems) {
    assign(SECTION_DIRS.systems, sys.id, sys.name)
    for (const c of sys.containers) {
      assign(SECTION_DIRS.containers, c.id, c.name)
      parents.set(c.id, sys.id)
      for (const comp of c.components) {
        assign(SECTION_DIRS.components, comp.id, comp.name)
        parents.set(comp.id, c.id)
      }
    }
  }

  const walkNode = (node: DeploymentNode, env: DeploymentEnvironment, parentId?: string) => {
    assign(SECTION_DIRS.deployment, node.id, node.name)
    environmentOf.set(node.id, env)
    if (parentId) parents.set(node.id, parentId)
    for (const infra of node.infrastructureNodes) {
      assign(SECTION_DIRS.deployment, infra.id, infra.name)
      environmentOf.set(infra.id, env)
      parents.set(infra.id, node.id)
    }
    for (const inst of node.containerInstances) {
      instanceOf.set(inst.id, inst.containerId)
      pushUnique(hostedOn, inst.containerId, node)
    }
    for (const inst of node.softwareSystemInstances) {
      instanceOf.set(inst.id, inst.softwareSystemId)
      pushUnique(hostedOn, inst.softwareSystemId, node)
    }
    for (const child of node.children) walkNode(child, env, node.id)
  }
  for (const env of ws.model.deploymentEnvironments) {
    assign(SECTION_DIRS.deployment, env.id, env.name)
    for (const node of env.deploymentNodes) walkNode(node, env)
  }

  for (const rel of ws.model.relationships) {
    relById.set(rel.id, rel)
    const source = instanceOf.get(rel.sourceId) ?? rel.sourceId
    const destination = instanceOf.get(rel.destinationId) ?? rel.destinationId
    pushTo(relsOf, source, rel)
    if (destination !== source) pushTo(relsOf, destination, rel)
  }

  const viewIdsTaken = new Set<string>()
  for (const view of allViewsOf(ws)) {
    // View keys are meant to be unique but nothing upstream enforces it for
    // explicit keys; suffix a repeat so two views never share one file.
    let id = viewId(view)
    for (let n = 2; viewIdsTaken.has(id); n++) id = `${viewId(view)}#${n}`
    viewIdsTaken.add(id)
    viewIds.set(view, id)
    assign(SECTION_DIRS.views, id, view.title || view.key, view.key)
    const seen = new Set<string>()
    for (const el of view.elements) {
      const id = instanceOf.get(el.id) ?? el.id
      if (seen.has(id)) continue
      seen.add(id)
      pushTo(inViews, id, view)
    }
  }

  return { ws, paths, names, instanceOf, hostedOn, parents, inViews, environmentOf, viewIds, relById, relsOf }
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** `pushTo`, skipping a value the list already holds (a node hosting two
 *  instances of the same container is still one host). */
function pushUnique<K, V>(map: Map<K, V[]>, key: K, value: V) {
  if (!map.get(key)?.includes(value)) pushTo(map, key, value)
}

/** Ids the DSL parser hands to elements declared without an identifier
 *  (`p1`, `p2`, …). They are not something the user wrote and are not stable
 *  across edits, so the bundle never exposes them. */
function isSyntheticId(id: string): boolean {
  return /^p\d+$/.test(id)
}

/** Views share an id space with elements only by accident; prefix so a view
 *  keyed `customer` never collides with the person `customer`. */
function viewId(view: View): string {
  return `view:${view.key}`
}

/** File stem for a concept: the Structurizr identifier, kept readable so the
 *  concept ID matches the DSL, with anything a filesystem or URL would choke
 *  on replaced. Unique within its section (case-insensitively, for macOS and
 *  Windows) and never a reserved name. */
export function conceptStem(id: string, taken: Set<string>): string {
  let stem = id
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (!stem) stem = 'concept'
  // `index` / `log` are reserved by the spec; `con`, `aux`, … cannot be
  // created as files on Windows at all.
  if (RESERVED_STEMS.has(stem.toLowerCase()) || WINDOWS_RESERVED_NAME.test(stem)) stem = `${stem}-concept`
  let candidate = stem
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}`
  taken.add(candidate.toLowerCase())
  return candidate
}

// ─── Sections ────────────────────────────────────────────────────────

interface Concept {
  path: string
  title: string
  description?: string
  content: string
}

interface SectionOutput {
  dir: string
  title: string
  blurb: string
  concepts: Concept[]
}

function peopleSection(ctx: Ctx): SectionOutput {
  return {
    dir: SECTION_DIRS.people,
    title: 'People',
    blurb: 'The people and roles who use the software systems.',
    concepts: ctx.ws.model.people.map((p) =>
      elementConcept(ctx, p, 'Person', [['location', p.location]], []),
    ),
  }
}

function systemsSection(ctx: Ctx): SectionOutput {
  return {
    dir: SECTION_DIRS.systems,
    title: 'Software systems',
    blurb: 'The software systems in the model and how they relate.',
    concepts: ctx.ws.model.softwareSystems.map((sys) =>
      elementConcept(ctx, sys, 'SoftwareSystem', [['location', sys.location]], [
        childList('Containers', ctx, sys.containers),
        hostedOnList(ctx, sys),
      ]),
    ),
  }
}

function containersSection(ctx: Ctx): SectionOutput {
  const containers: Container[] = ctx.ws.model.softwareSystems.flatMap((s) => s.containers)
  return {
    dir: SECTION_DIRS.containers,
    title: 'Containers',
    blurb: 'Deployable units — applications, services and data stores — inside each system.',
    concepts: containers.map((c) =>
      elementConcept(ctx, c, 'Container', [['technology', c.technology]], [
        childList('Components', ctx, c.components),
        hostedOnList(ctx, c),
      ]),
    ),
  }
}

function componentsSection(ctx: Ctx): SectionOutput {
  const components: Component[] = ctx.ws.model.softwareSystems.flatMap((s) =>
    s.containers.flatMap((c) => c.components),
  )
  return {
    dir: SECTION_DIRS.components,
    title: 'Components',
    blurb: 'The building blocks inside each container.',
    concepts: components.map((comp) =>
      elementConcept(ctx, comp, 'Component', [['technology', comp.technology]], []),
    ),
  }
}

function deploymentSection(ctx: Ctx): SectionOutput {
  const concepts: Concept[] = []
  const walk = (node: DeploymentNode) => {
    concepts.push(
      elementConcept(
        ctx,
        node,
        'DeploymentNode',
        [
          ['technology', node.technology],
          ['instances', node.instances],
          ['environment', ctx.environmentOf.get(node.id)?.name],
        ],
        [
          childList('Child nodes', ctx, node.children),
          childList('Infrastructure', ctx, node.infrastructureNodes),
          instanceList(ctx, node),
        ],
      ),
    )
    for (const infra of node.infrastructureNodes) {
      concepts.push(
        elementConcept(
          ctx,
          infra,
          'InfrastructureNode',
          [
            ['technology', infra.technology],
            ['environment', ctx.environmentOf.get(infra.id)?.name],
          ],
          [],
        ),
      )
    }
    for (const child of node.children) walk(child)
  }
  for (const env of ctx.ws.model.deploymentEnvironments) {
    concepts.push(environmentConcept(ctx, env))
    for (const node of env.deploymentNodes) walk(node)
  }
  return {
    dir: SECTION_DIRS.deployment,
    title: 'Deployment',
    blurb: 'Deployment environments, the nodes inside them, and which containers run where.',
    concepts,
  }
}

function viewsSection(ctx: Ctx): SectionOutput {
  return {
    dir: SECTION_DIRS.views,
    title: 'Views',
    blurb: 'The diagrams: each view is a focused slice of the model.',
    concepts: allViewsOf(ctx.ws).map((view) => viewConcept(ctx, view)),
  }
}

// ─── Concepts ────────────────────────────────────────────────────────

type FmValue = string | string[] | Record<string, string> | undefined
type FmField = [key: string, value: FmValue]
/** A rendered body section; empty string when there is nothing to say. */
type BodySection = string

function elementConcept(
  ctx: Ctx,
  el: ConceptNode,
  type: string,
  extra: FmField[],
  sections: BodySection[],
): Concept {
  const path = ctx.paths.get(el.id)!
  const parentId = ctx.parents.get(el.id)
  const fields: FmField[] = [
    ['type', type],
    ['title', el.name],
    ['description', el.description || undefined],
    ['tags', userTags(el.tags, type)],
    ['resource', el.url],
    ['structurizr_id', isSyntheticId(el.id) ? undefined : el.id],
    ...extra,
    ['status', el.status],
    ['owner', el.owner],
    ['parent', parentId ? conceptId(ctx, parentId) : undefined],
    ['properties', el.properties],
  ]
  const body = [
    el.description ? escapeInline(el.description) : '',
    relationshipTable(ctx, el.id),
    ...sections,
    viewList(ctx, el.id),
  ]
  return {
    path,
    title: el.name,
    description: el.description,
    content: document(fields, `# ${el.name}`, body),
  }
}

function environmentConcept(ctx: Ctx, env: DeploymentEnvironment): Concept {
  const fields: FmField[] = [
    ['type', 'DeploymentEnvironment'],
    ['title', env.name],
    ['structurizr_id', isSyntheticId(env.id) ? undefined : env.id],
  ]
  const tree = env.deploymentNodes.map((n) => nodeTree(ctx, n, 0)).join('\n')
  const body = [tree ? section('Deployment nodes', tree) : '']
  return {
    path: ctx.paths.get(env.id)!,
    title: env.name,
    content: document(fields, `# ${env.name}`, body),
  }
}

function nodeTree(ctx: Ctx, node: DeploymentNode, depth: number): string {
  const pad = '  '.repeat(depth)
  const lines = [`${pad}- ${link(ctx, node.id)}${node.technology ? ` (${escapeInline(node.technology)})` : ''}`]
  for (const infra of node.infrastructureNodes) lines.push(`${pad}  - ${link(ctx, infra.id)} — infrastructure`)
  for (const inst of node.containerInstances) lines.push(`${pad}  - ${link(ctx, inst.containerId)} — container instance`)
  for (const inst of node.softwareSystemInstances) lines.push(`${pad}  - ${link(ctx, inst.softwareSystemId)} — system instance`)
  for (const child of node.children) lines.push(nodeTree(ctx, child, depth + 1))
  return lines.join('\n')
}

function viewConcept(ctx: Ctx, view: View): Concept {
  const title = view.title || view.key
  const scopeId = view.softwareSystemId ?? view.containerId
  const fields: FmField[] = [
    ['type', 'View'],
    ['title', title],
    ['description', view.description || undefined],
    ['view_type', view.type],
    ['key', view.key],
    ['scope', scopeId ? conceptId(ctx, scopeId) : undefined],
    ['environment', view.environment],
  ]

  const seen = new Set<string>()
  const elements: string[] = []
  for (const el of view.elements) {
    const id = ctx.instanceOf.get(el.id) ?? el.id
    if (seen.has(id)) continue
    seen.add(id)
    elements.push(`- ${link(ctx, id)}`)
  }

  const dynamic = view.type === 'dynamic'
  const rows: string[][] = []
  for (const riv of view.relationships) {
    const rel = ctx.relById.get(riv.id)
    if (!rel) continue
    // A dynamic step's own endpoints are already in travel order; only when
    // they are absent does `response` mean "the model relationship, reversed".
    const from = riv.sourceId ?? (riv.response ? rel.destinationId : rel.sourceId)
    const to = riv.destinationId ?? (riv.response ? rel.sourceId : rel.destinationId)
    const description = riv.description ?? rel.description ?? ''
    const row = [endpoint(ctx, from), endpoint(ctx, to), escapeInline(description)]
    if (dynamic) row.unshift(escapeInline(riv.order ?? ''))
    rows.push(row)
  }
  const headers = dynamic ? ['Step', 'From', 'To', 'Description'] : ['From', 'To', 'Description']

  const body = [
    view.description ? escapeInline(view.description) : '',
    elements.length ? section('Elements', elements.join('\n')) : '',
    rows.length ? section('Relationships', table(headers, rows)) : '',
  ]
  return {
    path: ctx.paths.get(ctx.viewIds.get(view)!)!,
    title,
    description: view.description,
    content: document(fields, `# ${title}`, body),
  }
}

// ─── Body sections ───────────────────────────────────────────────────

function relationshipTable(ctx: Ctx, elementId: string): BodySection {
  const rows: string[][] = []
  for (const rel of ctx.relsOf.get(elementId) ?? []) {
    const source = ctx.instanceOf.get(rel.sourceId) ?? rel.sourceId
    const outgoing = source === elementId
    // A self-relationship shows once, as outgoing.
    const other = outgoing ? rel.destinationId : rel.sourceId
    rows.push([outgoing ? '->' : '<-', endpoint(ctx, other), escapeInline(rel.description ?? ''), escapeInline(rel.technology ?? '')])
  }
  return rows.length ? section('Relationships', table(['Direction', 'Element', 'Description', 'Technology'], rows)) : ''
}

/** A relationship endpoint: a link to the element, or to the element an
 *  instance stands for (marked as such), or — if the id points at nothing the
 *  bundle knows — the bare id in code, so no link is ever left dangling. */
function endpoint(ctx: Ctx, id: string): string {
  const base = ctx.instanceOf.get(id)
  if (base !== undefined) return `${link(ctx, base)} (instance)`
  return link(ctx, id)
}

function childList(heading: string, ctx: Ctx, children: ReadonlyArray<ConceptNode>): BodySection {
  if (children.length === 0) return ''
  const lines = children.map((c) => {
    const tech = 'technology' in c && c.technology ? ` (${escapeInline(c.technology)})` : ''
    return `- ${link(ctx, c.id)}${tech}${c.description ? ` — ${escapeInline(c.description)}` : ''}`
  })
  return section(heading, lines.join('\n'))
}

function instanceList(ctx: Ctx, node: DeploymentNode): BodySection {
  const lines = [
    ...node.containerInstances.map((i) => `- ${link(ctx, i.containerId)} — container instance`),
    ...node.softwareSystemInstances.map((i) => `- ${link(ctx, i.softwareSystemId)} — system instance`),
  ]
  return lines.length ? section('Runs here', lines.join('\n')) : ''
}

function hostedOnList(ctx: Ctx, el: SoftwareSystem | Container): BodySection {
  const hosts = ctx.hostedOn.get(el.id)
  if (!hosts || hosts.length === 0) return ''
  const lines = hosts.map((node) => {
    const env = ctx.environmentOf.get(node.id)
    return `- ${link(ctx, node.id)}${env ? ` (${escapeInline(env.name)})` : ''}`
  })
  return section('Deployed on', lines.join('\n'))
}

function viewList(ctx: Ctx, elementId: string): BodySection {
  const views = ctx.inViews.get(elementId)
  if (!views || views.length === 0) return ''
  const lines = views.map((v) => `- ${link(ctx, ctx.viewIds.get(v)!)} — ${VIEW_TYPE_LABEL[v.type]} view`)
  return section('Appears in', lines.join('\n'))
}

const VIEW_TYPE_LABEL: Record<View['type'], string> = {
  systemLandscape: 'system landscape',
  systemContext: 'system context',
  container: 'container',
  component: 'component',
  dynamic: 'dynamic',
  deployment: 'deployment',
}

// ─── Index files ─────────────────────────────────────────────────────

function rootIndex(ws: Workspace, sections: SectionOutput[], generator?: string): string {
  const title = ws.name?.trim() || 'Architecture'
  const lines = [
    '---',
    `okf_version: ${yaml(OKF_VERSION)}`,
    '---',
    '',
    `# ${title}`,
    '',
  ]
  if (ws.description) lines.push(escapeInline(ws.description), '')
  lines.push(
    `A C4 architecture model exported from Structurizr DSL by ${escapeInline(generator ?? 'c4hero')}.`,
    'The DSL is the source of truth; this bundle is a read-only projection of it.',
    '',
    '# Sections',
    '',
  )
  for (const s of sections) {
    lines.push(`- [${s.title}](${s.dir}/) - ${s.blurb} (${s.concepts.length})`)
  }
  lines.push(
    '',
    '# Conventions',
    '',
    '- Every concept is a person, software system, container, component, deployment node,',
    '  infrastructure node, deployment environment or view; the `type` field says which.',
    '- `structurizr_id` is the identifier the element has in the DSL. `parent` is the concept',
    '  ID of the element that contains it (a container\'s system, a component\'s container).',
    '- `# Relationships` lists every relationship touching the concept: `->` outgoing, `<-` incoming.',
    '- Links between concepts are bundle-relative and start with `/`, e.g. `/containers/api.md`.',
    '',
  )
  return lines.join('\n')
}

function sectionIndex(section: SectionOutput): string {
  const lines = [`# ${section.title}`, '', section.blurb, '']
  for (const c of section.concepts) {
    const file = c.path.slice(section.dir.length + 1)
    lines.push(`- [${escapeInline(c.title)}](${file})${c.description ? ` - ${escapeInline(c.description)}` : ''}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ─── Markdown & YAML helpers ─────────────────────────────────────────

function document(fields: FmField[], heading: string, body: BodySection[]): string {
  const parts = [frontmatter(fields), '', heading, ...body.filter(Boolean).flatMap((s) => ['', s])]
  return parts.join('\n') + '\n'
}

function section(heading: string, content: string): string {
  return `# ${heading}\n\n${content}`
}

/** Concept ID as the spec defines it: the path without `.md`. */
function conceptId(ctx: Ctx, id: string): string {
  const path = ctx.paths.get(id)
  return path ? path.slice(0, -3) : id
}

/** Markdown link to an addressable id; the bare id in code when unknown. */
function link(ctx: Ctx, id: string): string {
  const path = ctx.paths.get(id)
  if (!path) return `\`${escapeInline(id)}\``
  return `[${escapeInline(ctx.names.get(id) ?? id)}](/${path})`
}

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n')
}

/** Text that lands inside link text, list items or headings: collapse
 *  newlines and neutralise the characters that would change structure. */
function escapeInline(text: string): string {
  // Backslash first, so an escape we add is never itself escaped.
  return text.replace(/\s*\n\s*/g, ' ').replace(/[\\[\]|]/g, '\\$&').trim()
}

/** Structurizr adds `Element` plus the type name (`Software System`,
 *  `Deployment Node`, …) to every element's tags. The `type` field already
 *  carries that, so only the user's own tags are exported. */
function userTags(tags: ReadonlyArray<string>, type: string): string[] {
  const implicit = new Set(['Element', IMPLICIT_TYPE_TAG[type] ?? type])
  return tags.filter((t) => !implicit.has(t))
}

const IMPLICIT_TYPE_TAG: Record<string, string> = {
  Person: 'Person',
  SoftwareSystem: 'Software System',
  Container: 'Container',
  Component: 'Component',
  DeploymentNode: 'Deployment Node',
  InfrastructureNode: 'Infrastructure Node',
}

function frontmatter(fields: FmField[]): string {
  const lines = ['---']
  for (const [key, value] of fields) {
    if (value === undefined || value === '') continue
    if (typeof value === 'string') {
      lines.push(`${key}: ${yaml(value)}`)
    } else if (Array.isArray(value)) {
      if (value.length) lines.push(`${key}: [${value.map(yaml).join(', ')}]`)
    } else {
      const keys = Object.keys(value)
      if (keys.length) {
        lines.push(`${key}:`)
        for (const k of keys) lines.push(`  ${yaml(k)}: ${yaml(value[k])}`)
      }
    }
  }
  lines.push('---')
  return lines.join('\n')
}

/** A double-quoted YAML scalar. JSON string syntax is a subset of YAML's
 *  double-quoted style, so this escapes quotes, backslashes and control
 *  characters correctly and never needs a block scalar. */
function yaml(value: string): string {
  return JSON.stringify(value)
}
