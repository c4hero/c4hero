// Values c4hero changes on the way out (TEA-169).
//
// Structurizr DSL has no escape for two character positions, so the serializer
// drops them by design rather than emitting something the parser would reject
// or silently misread (the policy and its rationale are TEA-163 / PR #118):
//
//   - a backslash immediately before `n`, or at the end of a value: the first
//     would decode as a newline escape, the second would escape the closing
//     quote
//   - a comma inside a tag: Structurizr splits tag strings on commas, so one
//     tag would become two — and each piece it splits out is trimmed, so a
//     tag's surrounding whitespace goes with it
//   - a carriage return: `\r` has no representation, so CR and CRLF both land
//     as `\n`
//
// The policy is right — the alternatives are refusing the value at input time
// or corrupting it — but nothing tells the user their value changed.
// `Shared Folder X:\` quietly becomes `Shared Folder X:` on save, and the tag
// `v1,beta` becomes `v1beta`.
//
// This is deliberately NOT the same question as structurizrValidation.ts.
// That module asks "would Structurizr refuse to load this?"; everything here
// loads perfectly well — it just isn't quite what the user typed. The two are
// surfaced together but they are different promises, and a value can trip one
// without tripping the other.
//
// The rules themselves live in dsl/encoding.ts, which the serializer also
// uses, so this predicts the drop from the same source of truth rather than
// keeping a second copy of it.

import type { DeploymentNode, Relationship, View, Workspace } from '@/types/model'
import { representable, representableTag, roundTripped, roundTrippedSelector, roundTrippedTag } from './dsl/encoding'

export type SerializationLossCode =
  /** A backslash with no representation was removed. */
  | 'dropped-backslash'
  /** A carriage return became a newline. */
  | 'normalized-newline'
  /** A comma was removed from a tag. */
  | 'stripped-tag-comma'
  /** Whitespace around a tag was trimmed off. */
  | 'trimmed-tag'
  /** Two tags became the same string, so one of them is lost. */
  | 'merged-tags'
  /** A property key changed, so the property is read back under a new name. */
  | 'renamed-property-key'
  /** A property is not emitted at all. */
  | 'dropped-property'

export interface SerializationLoss {
  code: SerializationLossCode
  /** One sentence, written for the person whose value is about to change. */
  message: string
  /** Which field — `name`, `description`, `tag "v1,beta"`, `property "a\\"`. */
  field: string
  elementId?: string
  relationshipId?: string
  viewKey?: string
}

/** Every way this value changes on the way out — nothing means it survives
 *  the trip unchanged. A value can both lose a backslash and have a carriage
 *  return flattened, and the user has to hear about both. */
function lossesOf(value: string): SerializationLossCode[] {
  const codes: SerializationLossCode[] = []
  if (representable(value) !== value) codes.push('dropped-backslash')
  // A `\n` round-trips as the `\n` escape; a carriage return does not exist in
  // the DSL at all, so CR and CRLF both arrive back as a bare newline.
  if (value.includes('\r')) codes.push('normalized-newline')
  return codes
}

const LOSS_SENTENCE: Record<SerializationLossCode, string> = {
  'dropped-backslash': 'a backslash that the DSL cannot represent will be removed',
  'normalized-newline': 'a carriage return will be saved as a plain line break',
  'stripped-tag-comma': 'the comma will be removed — Structurizr splits tags on commas',
  'trimmed-tag': 'the whitespace around it will be removed — Structurizr trims every tag it reads',
  'merged-tags': 'two tags collapse into one, so one of them is lost',
  'renamed-property-key': 'the key contains a character the DSL cannot represent, so the property is read back under a different name',
  'dropped-property': 'it is not written to the file at all',
}

/** Where a loss was found, so the message can name it. */
interface Carrier {
  label: string
  elementId?: string
  relationshipId?: string
  viewKey?: string
}

class LossCollector {
  readonly losses: SerializationLoss[] = []

  /** Record one loss against `carrier`, which supplies the ids. */
  private push(carrier: Carrier, code: SerializationLossCode, field: string, message: string): void {
    const { elementId, relationshipId, viewKey } = carrier
    this.losses.push({ code, field, message, elementId, relationshipId, viewKey })
  }

  /** One plain string field. */
  field(carrier: Carrier, field: string, value: string | undefined): void {
    if (!value) return
    for (const code of lossesOf(value)) {
      this.push(carrier, code, field, `${carrier.label} — ${field}: ${LOSS_SENTENCE[code]}.`)
    }
  }

  /**
   * A field the serializer smuggles out as a property rather than a keyword
   * (`owner`), so unlike a keyword field it is dropped outright — not merely
   * shortened — when its value encodes to nothing.
   */
  propertyField(carrier: Carrier, field: string, value: string | undefined): void {
    if (!value) return
    if (roundTripped(value) === '') {
      this.push(carrier, 'dropped-property', field, `${carrier.label} — ${field}: ${LOSS_SENTENCE['dropped-property']}.`)
      return
    }
    this.field(carrier, field, value)
  }

  /**
   * A field the serializer never writes for this kind of element, so whatever
   * it holds is lost outright. Deployment and infrastructure nodes take this
   * path for `owner` and `status`: the DSL has no keyword for either, and
   * unlike people, systems, containers and components they are serialized
   * straight from `properties` rather than through `elementProperties`, which
   * is what folds those two fields into the block.
   */
  alwaysDropped(carrier: Carrier, field: string, value: string | undefined): void {
    if (!value) return
    this.push(carrier, 'dropped-property', field, `${carrier.label} — ${field}: ${LOSS_SENTENCE['dropped-property']}.`)
  }

  /**
   * The tag set: commas are stripped, and two tags can collapse into one.
   *
   * `trimsOnRead` is what separates a tag from a *style tag selector*. A tag
   * is read back through `buildTags`, which splits on commas and trims each
   * piece; a selector is a plain quoted string the parser hands back verbatim.
   * Trimming a selector's prediction would claim a change that never happens —
   * and would call a whitespace-only selector dropped when it round-trips
   * exactly.
   */
  tags(carrier: Carrier, tags: string[] | undefined, trimsOnRead = true): void {
    if (!Array.isArray(tags)) return
    const emittedBy = new Map<string, string>()
    for (const tag of tags) {
      if (typeof tag !== 'string' || tag === '') continue
      const emitted = trimsOnRead ? roundTrippedTag(tag) : roundTrippedSelector(tag)
      const field = `tag "${tag}"`
      if (emitted === '') {
        this.push(carrier, 'dropped-property', field,
          `${carrier.label} — the tag "${tag}" encodes to nothing, so ${LOSS_SENTENCE['dropped-property']}.`)
        continue
      }
      const claimedBy = emittedBy.get(emitted)
      if (claimedBy !== undefined) {
        // The same tag listed twice is one tag either way — no loss, and its
        // own change was already reported on the first sighting.
        if (claimedBy !== tag) {
          this.push(carrier, 'merged-tags', field,
            `${carrier.label} — the tags "${claimedBy}" and "${tag}" both become "${emitted}": ${LOSS_SENTENCE['merged-tags']}.`)
        }
        continue
      }
      emittedBy.set(emitted, tag)
      if (emitted !== tag) {
        const code: SerializationLossCode = tag.includes(',')
          ? 'stripped-tag-comma'
          : representableTag(tag) !== tag
            ? 'dropped-backslash'
            : tag.includes('\r')
              ? 'normalized-newline'
              : 'trimmed-tag'
        this.push(carrier, code, field,
          `${carrier.label} — the tag "${tag}" becomes "${emitted}": ${LOSS_SENTENCE[code]}.`)
      }
    }
  }

  /**
   * Properties. Keys go through the same encoding as values, so a key can be
   * renamed on the way out — and if the renamed key lands on a sibling that
   * already exists, the next parse keeps only one of them and the other
   * property is gone. The serializer also refuses to emit an entry whose key
   * or value encodes to nothing, because `"key" ""` is a hard rejection.
   */
  properties(carrier: Carrier, props: Record<string, string> | undefined): void {
    if (!props || typeof props !== 'object') return
    const emittedBy = new Map<string, string>()
    for (const [key, value] of Object.entries(props)) {
      const field = `property "${key}"`
      const emittedKey = roundTripped(key)
      const emittedValue = typeof value === 'string' ? roundTripped(value) : ''
      if (emittedKey === '' || emittedValue === '') {
        this.push(carrier, 'dropped-property', field,
          `${carrier.label} — the property "${key}" has an empty key or value once encoded, so ${LOSS_SENTENCE['dropped-property']}.`)
        continue
      }
      const claimedBy = emittedBy.get(emittedKey)
      // Claim the key either way: the parser keeps the last `"key" "value"` it
      // reads, so with three colliding keys the second loses to the third just
      // as the first lost to the second. Leaving the map on the first would
      // name it as the loser every time and never mention the ones between.
      emittedBy.set(emittedKey, key)
      if (claimedBy !== undefined) {
        // Both entries are written; the one that loses is whichever claimed
        // the key first.
        this.push(carrier, 'dropped-property', `property "${claimedBy}"`,
          `${carrier.label} — the properties "${claimedBy}" and "${key}" both encode to "${emittedKey}", so only one of them is read back — "${claimedBy}" is lost.`)
        continue
      }
      if (emittedKey !== key) {
        this.push(carrier, 'renamed-property-key', field,
          `${carrier.label} — the property "${key}" is saved as "${emittedKey}": ${LOSS_SENTENCE['renamed-property-key']}.`)
      }
      this.field(carrier, field, typeof value === 'string' ? value : undefined)
    }
  }
}

function describe(kind: string, name: string | undefined, id: string | undefined): string {
  const label = name?.trim()
  return label ? `${kind} "${label}"` : `${kind} ${id ?? '?'}`
}

/**
 * Every value in this workspace that will not survive a save byte-for-byte.
 * Pure, never throws, and safe to call on a partially-built model.
 *
 * Reports what the DSL cannot represent — not what Structurizr would reject.
 * For the latter see `validateForStructurizr`.
 */
export function findSerializationLoss(ws: Workspace): SerializationLoss[] {
  const c = new LossCollector()
  if (!ws || typeof ws !== 'object') return c.losses

  const wsCarrier: Carrier = { label: 'This workspace' }
  c.field(wsCarrier, 'name', ws.name)
  c.field(wsCarrier, 'description', ws.description)

  const model = ws.model
  const elementCarrier = (kind: string, e: { id?: string; name?: string }): Carrier =>
    ({ label: describe(kind, e.name, e.id), elementId: e.id })

  /** name / description / technology / url / owner, plus tags and properties.
   *
   *  `writesOwner` is false for deployment and infrastructure nodes, whose
   *  serializer emits `properties` directly instead of going through
   *  `elementProperties` — so their `owner` and `status` never reach the file
   *  at all, however representable the value is. */
  function common(
    carrier: Carrier,
    e: { description?: string; technology?: string; url?: string; owner?: string; status?: string; tags?: string[]; properties?: Record<string, string>; name?: string },
    writesOwner = true,
  ): void {
    c.field(carrier, 'name', e.name)
    c.field(carrier, 'description', e.description)
    c.field(carrier, 'technology', e.technology)
    c.field(carrier, 'url', e.url)
    if (writesOwner) {
      // `owner` is not a DSL keyword: it rides out inside the properties
      // block, where an entry with an empty value is skipped entirely.
      c.propertyField(carrier, 'owner', e.owner)
    } else {
      c.alwaysDropped(carrier, 'owner', e.owner)
      c.alwaysDropped(carrier, 'status', e.status)
    }
    c.tags(carrier, e.tags)
    c.properties(carrier, e.properties)
  }

  for (const p of model?.people ?? []) {
    if (!p || typeof p !== 'object') continue
    common(elementCarrier('Person', p), p)
  }
  for (const s of model?.softwareSystems ?? []) {
    if (!s || typeof s !== 'object') continue
    common(elementCarrier('Software system', s), s)
    for (const ct of s.containers ?? []) {
      if (!ct || typeof ct !== 'object') continue
      common(elementCarrier('Container', ct), ct)
      for (const cp of ct.components ?? []) {
        if (!cp || typeof cp !== 'object') continue
        common(elementCarrier('Component', cp), cp)
      }
    }
  }

  for (const rel of model?.relationships ?? []) {
    if (!rel || typeof rel !== 'object') continue
    const r = rel as Relationship
    const carrier: Carrier = { label: describe('Relationship', r.description, r.id), relationshipId: r.id }
    c.field(carrier, 'description', r.description)
    c.field(carrier, 'technology', r.technology)
    c.field(carrier, 'url', r.url)
    c.tags(carrier, r.tags)
    c.properties(carrier, r.properties)
  }

  for (const g of model?.groups ?? []) {
    if (!g || typeof g !== 'object') continue
    c.field({ label: describe('Group', g.name, g.id) }, 'name', g.name)
  }

  const walkNodes = (nodes: DeploymentNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (!node || typeof node !== 'object') continue
      const nodeCarrier = elementCarrier('Deployment node', node)
      common(nodeCarrier, node, false)
      c.field(nodeCarrier, 'instances', node.instances)
      for (const infra of node.infrastructureNodes ?? []) {
        if (!infra || typeof infra !== 'object') continue
        common(elementCarrier('Infrastructure node', infra), infra, false)
      }
      for (const i of node.containerInstances ?? []) {
        if (!i || typeof i !== 'object') continue
        const carrier: Carrier = { label: `Container instance ${i.id}`, elementId: i.id }
        c.field(carrier, 'url', i.url)
        c.tags(carrier, i.tags)
        c.properties(carrier, i.properties)
      }
      for (const i of node.softwareSystemInstances ?? []) {
        if (!i || typeof i !== 'object') continue
        const carrier: Carrier = { label: `Software system instance ${i.id}`, elementId: i.id }
        c.field(carrier, 'url', i.url)
        c.tags(carrier, i.tags)
        c.properties(carrier, i.properties)
      }
      walkNodes(node.children)
    }
  }
  for (const env of model?.deploymentEnvironments ?? []) {
    if (!env || typeof env !== 'object') continue
    c.field({ label: describe('Deployment environment', env.name, env.id) }, 'name', env.name)
    walkNodes(env.deploymentNodes)
  }

  const views = ws.views
  const allViews: View[] = [
    ...(views?.systemLandscapeViews ?? []),
    ...(views?.systemContextViews ?? []),
    ...(views?.containerViews ?? []),
    ...(views?.componentViews ?? []),
    ...(views?.dynamicViews ?? []),
    ...(views?.deploymentViews ?? []),
  ]
  for (const v of allViews) {
    if (!v || typeof v !== 'object') continue
    // An auto-generated view is never written to the file, so nothing about it
    // can be lost on the way out.
    if (v.autoView) continue
    const carrier: Carrier = { label: describe('View', v.title ?? v.key, v.key), viewKey: v.key }
    c.field(carrier, 'title', v.title)
    c.field(carrier, 'description', v.description)
    c.field(carrier, 'environment', v.environment)
    // Only a dynamic view writes its steps' own descriptions; every other view
    // type takes the label from the model relationship.
    if (v.type === 'dynamic') {
      for (const step of v.relationships ?? []) {
        if (!step || typeof step !== 'object') continue
        c.field(carrier, `step ${step.order ?? step.id} description`, step.description)
      }
    }
  }

  // Style tag selectors go through the same comma + backslash rules as the
  // tags they point at, but *not* the trim — the parser hands a selector back
  // verbatim (`trimsOnRead: false`). A selector the rules do change no longer
  // matches its tag, which is a style silently dropped from the diagram.
  for (const style of views?.configuration?.styles?.elements ?? []) {
    if (!style || typeof style.tag !== 'string') continue
    const carrier: Carrier = { label: `Element style for "${style.tag}"` }
    c.tags(carrier, [style.tag], false)
    c.field(carrier, 'icon', style.icon)
  }
  for (const style of views?.configuration?.styles?.relationships ?? []) {
    if (!style || typeof style.tag !== 'string') continue
    c.tags({ label: `Relationship style for "${style.tag}"` }, [style.tag], false)
  }

  for (const theme of views?.configuration?.themes ?? []) {
    if (typeof theme !== 'string') continue
    c.field({ label: 'Themes' }, `theme "${theme}"`, theme)
  }

  return c.losses
}
