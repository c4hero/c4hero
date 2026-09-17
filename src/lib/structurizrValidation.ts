// Structurizr acceptance checker (TEA-331, TEA-166) — a pure, non-throwing
// pass that answers "would the real Structurizr parser accept what this
// workspace serializes to?".
//
// This is a third checker, deliberately distinct from its two neighbours:
//
//   - modelIntegrity.ts asks "is this Workspace even well-formed?" (duplicate
//     ids, dangling refs, broken nesting). Its violations mean c4hero itself
//     is confused.
//   - scopeValidation.ts is a user-facing lint about c4hero's own
//     workspace-scope rules.
//   - this module asks only about *interoperability*: the model is perfectly
//     coherent, c4hero renders it happily, and yet no other Structurizr tool
//     will load the DSL it exports.
//
// Every rule below was confirmed against the Structurizr CLI (v2025.11.09),
// not inferred from the docs — the exact error text each one prevents is
// quoted on the check. Findings are *warnings*: they never block an edit or a
// save, they surface in the code pane so the user can see why an export would
// be rejected elsewhere.
//
// Most checks here were found by the generated conformance corpus (TEA-63):
// the generator had to be constrained around each because c4hero's store
// accepts states that serialize to DSL the real parser rejects. Relaxing a
// constraint in `generateWorkspace` and running the corpus is how those are
// proved — see `structurizr-conformance.test.ts`.
//
// The deployment-topology rules are the exception: `generateWorkspace` emits
// no deployment environments, so they are held to the CLI only by the probed
// cases in the unit tests. Teaching the generator deployment topology would
// bring them under the same corpus proof.

import type { DeploymentNode, ModelElement, Relationship, View, Workspace } from '@/types/model'
import { representable } from './dsl/encoding'
import { serialize } from './dsl/serializer'
import { lex } from './dsl/lexer'
import { isConformantViewKey } from './dsl/viewKey'

export type StructurizrWarningCode =
  | 'empty-name'
  | 'invalid-url'
  | 'duplicate-sibling-name'
  | 'ancestor-relationship'
  | 'duplicate-relationship'
  | 'implied-duplicate-relationship'
  | 'view-key-charset'
  | 'duplicate-view-key'

export interface StructurizrWarning {
  code: StructurizrWarningCode
  /** One sentence, written for the person who has to fix it. */
  message: string
  elementId?: string
  relationshipId?: string
  viewKey?: string
}

/** The protocols `java.net.URL` has a handler for. Structurizr validates urls
 *  with `new URL(...)`, so a well-formed URI under any other scheme —
 *  `urn:`, `data:`, `news:` — is still rejected, and a bare `example.com`
 *  (no scheme at all) with it. */
const JAVA_URL_PROTOCOLS = new Set(['http', 'https', 'file', 'ftp', 'jar', 'mailto'])

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/

/** Does `url` survive `new java.net.URL(url)`?
 *
 *  Deliberately lax about the path: Structurizr accepts spaces, quotes, angle
 *  brackets and non-ASCII inside one (`https://例え.jp/a b` validates), so the
 *  only things that actually fail are a missing or unhandled scheme and an
 *  authority whose port isn't numeric — which is how `file://C:\share` fails:
 *  with no `/` to end the authority, `C:\share` parses as host `C`, port
 *  `\share`. */
export function isStructurizrUrl(url: string): boolean {
  const scheme = SCHEME.exec(url)
  if (!scheme || !JAVA_URL_PROTOCOLS.has(scheme[1].toLowerCase())) return false
  const rest = url.slice(scheme[0].length)
  if (!rest.startsWith('//')) return true
  const authority = rest.slice(2).split(/[/?#]/)[0]
  const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority
  if (hostPort.startsWith('[')) {
    // IPv6 literal: the port, if any, follows the closing bracket.
    const close = hostPort.indexOf(']')
    if (close === -1) return false
    const after = hostPort.slice(close + 1)
    return after === '' || /^:\d*$/.test(after)
  }
  const colon = hostPort.indexOf(':')
  return colon === -1 || /^\d*$/.test(hostPort.slice(colon + 1))
}

/** The name Structurizr will end up holding, after the serializer's
 *  unrepresentable-backslash rules. A lone backslash encodes to nothing, which
 *  is why the *raw* name being non-empty proves nothing. */
function storedName(element: { name?: unknown }): string {
  return typeof element.name === 'string' ? representable(element.name) : ''
}

/** Anything with a name and a url that Structurizr validates. Deployment and
 *  infrastructure nodes are not `ModelElement`s in c4hero's types, but the
 *  parser treats their names and urls by exactly the same rules. */
type NamedElement = ModelElement | DeploymentNode | { id: string; type: 'infrastructureNode'; name: string; url?: string }

/** Kind labels matching Structurizr's own error text, so a warning and the
 *  parser message a user might hit later read the same way. */
const KIND_LABEL: Record<NamedElement['type'], string> = {
  person: 'person',
  softwareSystem: 'software system',
  container: 'container',
  component: 'component',
  deploymentNode: 'deployment node',
  infrastructureNode: 'infrastructure node',
}

interface Placed {
  element: NamedElement
  /** The id of the scope this element's name must be unique within —
   *  undefined for top-level people and systems, which share one namespace.
   *  Deployment and infrastructure nodes scope to their environment or their
   *  parent node, and share that namespace with each other. */
  parent?: string
}

/** Every named element in the workspace, with the scope its name has to be
 *  unique within, in declaration order. */
function placedElements(ws: Workspace): Placed[] {
  const out: Placed[] = []
  for (const p of ws.model?.people ?? []) out.push({ element: p })
  for (const s of ws.model?.softwareSystems ?? []) {
    out.push({ element: s })
    for (const c of s.containers ?? []) {
      out.push({ element: c, parent: s.id })
      for (const comp of c.components ?? []) out.push({ element: comp, parent: c.id })
    }
  }
  // Deployment topology. Each environment is its own namespace ("a deployment
  // node named N" in Live and in Dev is fine), and within it a node's children
  // — deployment and infrastructure alike — share one.
  const walkNodes = (nodes: DeploymentNode[] | undefined, scope: string) => {
    for (const node of nodes ?? []) {
      out.push({ element: node, parent: scope })
      for (const infra of node.infrastructureNodes ?? []) out.push({ element: infra, parent: node.id })
      walkNodes(node.children, node.id)
    }
  }
  for (const env of ws.model?.deploymentEnvironments ?? []) walkNodes(env.deploymentNodes, `env:${env.id}`)
  return out
}

/** Every url in the workspace that Structurizr validates, with what carries
 *  it. Container and software-system instances have no name of their own but
 *  do have a url. */
function urlBearers(ws: Workspace): { url: string | undefined; elementId: string }[] {
  const out: { url: string | undefined; elementId: string }[] = []
  for (const { element } of placedElements(ws)) out.push({ url: element.url, elementId: element.id })
  const walkNodes = (nodes: DeploymentNode[] | undefined) => {
    for (const node of nodes ?? []) {
      for (const i of node.containerInstances ?? []) out.push({ url: i.url, elementId: i.id })
      for (const i of node.softwareSystemInstances ?? []) out.push({ url: i.url, elementId: i.id })
      walkNodes(node.children)
    }
  }
  for (const env of ws.model?.deploymentEnvironments ?? []) walkNodes(env.deploymentNodes)
  return out
}

function allViews(ws: Workspace): View[] {
  const v = ws.views
  return [
    ...(v?.systemLandscapeViews ?? []),
    ...(v?.systemContextViews ?? []),
    ...(v?.containerViews ?? []),
    ...(v?.componentViews ?? []),
    ...(v?.dynamicViews ?? []),
    ...(v?.deploymentViews ?? []),
  ]
}

/**
 * Report every way this workspace would be rejected by the real Structurizr
 * parser. Pure, never throws, and safe to call on a partially-built model.
 */
export function validateForStructurizr(ws: Workspace): StructurizrWarning[] {
  const warnings: StructurizrWarning[] = []
  if (!ws || typeof ws !== 'object') return warnings

  const placed = placedElements(ws)
  const parentOf = new Map<string, string>()
  for (const { element, parent } of placed) if (parent) parentOf.set(element.id, parent)

  // ── 1. Empty element names ────────────────────────────────────────
  // "A container name must be provided". Structurizr trims before testing, so
  // a whitespace-only name fails too.
  for (const { element } of placed) {
    if (storedName(element).trim() !== '') continue
    warnings.push({
      code: 'empty-name',
      message: element.name
        ? `This ${KIND_LABEL[element.type]}'s name encodes to nothing in the DSL, and Structurizr requires a name.`
        : `This ${KIND_LABEL[element.type]} has no name, and Structurizr requires one.`,
      elementId: element.id,
    })
  }

  // ── 2. Invalid urls ───────────────────────────────────────────────
  // "<url> is not a valid URL" — raised for elements and relationships alike.
  for (const { url, elementId } of urlBearers(ws)) {
    if (!url || isStructurizrUrl(url)) continue
    warnings.push({
      code: 'invalid-url',
      message: `"${url}" is not a URL Structurizr accepts — it needs an http, https, file, ftp, mailto or jar address.`,
      elementId,
    })
  }
  for (const rel of ws.model?.relationships ?? []) {
    const url = rel.url
    if (!url || isStructurizrUrl(url)) continue
    warnings.push({
      code: 'invalid-url',
      message: `"${url}" is not a URL Structurizr accepts — it needs an http, https, file, ftp, mailto or jar address.`,
      relationshipId: rel.id,
    })
  }

  // ── 3. Duplicate names among siblings ─────────────────────────────
  // "A container named 'X' already exists for this software system", "A
  // top-level element named 'X' already exists" (people and software systems
  // share one namespace, which groups do NOT subdivide), and "A
  // deployment/infrastructure node named 'X' already exists". Comparison is
  // exact on the stored name: "A" and "A " are different elements to
  // Structurizr, so this must not trim.
  const seenBySibling = new Map<string, Map<string, string>>()
  for (const { element, parent } of placed) {
    const name = storedName(element)
    if (name.trim() === '') continue // already reported as empty-name
    // Top-level people and systems share the scope key '' — containers and
    // components scope to their parent.
    const scope = parent ?? ''
    const taken = seenBySibling.get(scope) ?? new Map<string, string>()
    if (taken.has(name)) {
      warnings.push({
        code: 'duplicate-sibling-name',
        message: parent
          ? `Another ${KIND_LABEL[element.type]} here is already named "${name}" — Structurizr requires sibling names to be unique.`
          : `Another top-level element is already named "${name}" — Structurizr requires people and software systems to have unique names.`,
        elementId: element.id,
      })
    } else {
      taken.set(name, element.id)
      seenBySibling.set(scope, taken)
    }
  }

  // ── 4 & 5. Relationships ──────────────────────────────────────────
  warnings.push(...checkRelationships(ws, parentOf))

  // ── 6. View keys (TEA-166) ────────────────────────────────────────
  // "View keys can only contain the following characters: a-zA-Z0-9_-".
  // The DSL parser normalizes keys on the way in, so this is a backstop for
  // every other path into the store: a JSON workspace, an AI edit plan, a
  // hand-edited sidecar.
  //
  // A view with *no* key is deliberately not flagged: the serializer omits an
  // empty key and Structurizr generates one, so the export loads fine. A
  // keyless view does break c4hero's own navigation, but that is
  // modelIntegrity's business — saying "Structurizr would reject this" about
  // it would simply be false.
  //
  // Duplicates are a separate rule ("A view with the key X already exists"),
  // and one the DSL parser deliberately does not fix: renaming a view the user
  // named twice would be papering over their file's own error.
  const seenKeys = new Set<string>()
  for (const view of allViews(ws)) {
    const key = typeof view?.key === 'string' ? view.key : ''
    // An auto-generated view is never serialized and an auto key is never
    // emitted, so neither can collide with anything in the export.
    if (view?.autoView || view?.autoKey) continue
    if (!key) continue
    if (!isConformantViewKey(key)) {
      warnings.push({
        code: 'view-key-charset',
        message: `View key "${key}" uses characters Structurizr rejects — only letters, digits, "_" and "-" are allowed.`,
        viewKey: key,
      })
      continue
    }
    if (seenKeys.has(key)) {
      warnings.push({
        code: 'duplicate-view-key',
        message: `Another view already uses the key "${key}" — Structurizr requires view keys to be unique.`,
        viewKey: key,
      })
    }
    seenKeys.add(key)
  }

  return warnings
}

/** The ancestors of `id`, nearest first. */
function ancestorsOf(id: string, parentOf: Map<string, string>): string[] {
  const out: string[] = []
  let cur = parentOf.get(id)
  const guard = new Set<string>([id])
  while (cur && !guard.has(cur)) {
    out.push(cur)
    guard.add(cur)
    cur = parentOf.get(cur)
  }
  return out
}

/** All explicit relationships are emitted after the model declarations. Read
 * the effective strategy in emitted order: group/element anchors can reorder
 * directives, and a views-scope directive comes too late to affect the model.
 * Only serialize when a strategy override is present. */
function usesDefaultImpliedRelationships(ws: Workspace): boolean {
  const isOverride = (raw: string) => /^!impliedRelationships\b/i.test(raw.trim())
  const hasOverride = ws.directives?.some(d => isOverride(d.raw))
    || placedElements(ws).some(({ element }) =>
      'directives' in element && element.directives?.some(isOverride))
  if (!hasOverride) return true

  // This checker must remain non-throwing even when another export constraint
  // (such as overlapping groups) prevents serialization. In that case avoid
  // claiming an implied collision whose strategy we cannot establish.
  try {
    let enabled = true
    for (const token of lex(serialize(ws)).tokens) {
      if (token.type === 'ARROW') break
      if (token.type !== 'KEYWORD' || !isOverride(token.value)) continue
      const value = token.value.trim().split(/\s+/)[1]?.replace(/^"|"$/g, '')
      enabled = value?.toLowerCase() === 'true'
    }
    return enabled
  } catch {
    return false
  }
}

/**
 * Relationship checks 4 and 5.
 *
 * Both depend on Structurizr's *ordering*, so this walks
 * `model.relationships` in the order the serializer emits them (it writes the
 * array straight through, after the elements).
 *
 * - A relationship between an element and any of its ancestors or descendants
 *   is rejected outright.
 * - With `impliedRelationships` on (the default), adding `comp -> x` also
 *   creates `container -> x` and `system -> x`, but only where no
 *   relationship between that ancestor pair exists yet. A later *explicit*
 *   relationship that matches one of those implied ones on source,
 *   destination AND description is then rejected as a duplicate. Declaring the
 *   broad relationship first is fine — nothing is implied over it — which is
 *   why order is the whole story here.
 */
function checkRelationships(ws: Workspace, parentOf: Map<string, string>): StructurizrWarning[] {
  const warnings: StructurizrWarning[] = []
  const relationships: Relationship[] = ws.model?.relationships ?? []
  const implyRelationships = usesDefaultImpliedRelationships(ws)

  /** Pairs that hold any relationship — suppresses further implied ones. */
  const anyBetween = new Set<string>()
  /** Pairs plus description — what Structurizr rejects a duplicate of. */
  const exact = new Map<string, 'explicit' | 'implied'>()

  for (const rel of relationships) {
    if (!rel || typeof rel !== 'object') continue
    const { sourceId, destinationId } = rel
    if (typeof sourceId !== 'string' || typeof destinationId !== 'string') continue

    const sourceAncestors = ancestorsOf(sourceId, parentOf)
    const destAncestors = ancestorsOf(destinationId, parentOf)
    if (sourceAncestors.includes(destinationId) || destAncestors.includes(sourceId)) {
      warnings.push({
        code: 'ancestor-relationship',
        message: 'Structurizr does not allow a relationship between an element and its own parent or child — model it between siblings, or between the parents.',
        relationshipId: rel.id,
      })
      // Structurizr never gets as far as implying anything from a relationship
      // it refuses, so this one contributes nothing below.
      continue
    }

    const description = representable(rel.description ?? '')
    const pair = `${sourceId}\u0000${destinationId}`
    const key = `${pair}\u0000${description}`

    const clash = exact.get(key)
    if (clash === 'implied') {
      warnings.push({
        code: 'implied-duplicate-relationship',
        message: 'Structurizr already derives this relationship from one between these elements\u2019 children, so declaring it again is rejected as a duplicate — remove it, or give it a different description.',
        relationshipId: rel.id,
      })
    } else if (clash === 'explicit') {
      warnings.push({
        code: 'duplicate-relationship',
        message: 'Another relationship between these two elements already has this description — Structurizr rejects the second one.',
        relationshipId: rel.id,
      })
    }
    exact.set(key, 'explicit')
    anyBetween.add(pair)

    if (!implyRelationships) continue

    // Mirror the default strategy (create the implied relationship unless any
    // relationship already exists between that pair) over the ancestor lattice.
    for (const src of [sourceId, ...sourceAncestors]) {
      for (const dst of [destinationId, ...destAncestors]) {
        if (src === sourceId && dst === destinationId) continue
        if (src === dst) continue
        // A pair that is itself parent/child implies nothing.
        if (ancestorsOf(src, parentOf).includes(dst) || ancestorsOf(dst, parentOf).includes(src)) continue
        const impliedPair = `${src}\u0000${dst}`
        if (anyBetween.has(impliedPair)) continue
        anyBetween.add(impliedPair)
        exact.set(`${impliedPair}\u0000${description}`, 'implied')
      }
    }
  }

  return warnings
}
