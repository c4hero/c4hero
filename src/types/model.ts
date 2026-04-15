// Core C4 model types — aligned with Structurizr workspace JSON schema

export type Location = 'Internal' | 'External' | 'Unspecified'
export type InteractionStyle = 'Synchronous' | 'Asynchronous'
export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL'
export type ElementStatus = 'Live' | 'Planned' | 'Deprecated' | 'Removed'
export type LineStyle = 'Curved' | 'Straight' | 'Orthogonal'

// ─── Elements ────────────────────────────────────────────────────────

export interface BaseElement {
  id: string
  name: string
  description?: string
  tags: string[]
  properties: Record<string, string>
  url?: string
  status?: ElementStatus
  owner?: string
}

export interface Person extends BaseElement {
  type: 'person'
  location?: Location
}

export interface SoftwareSystem extends BaseElement {
  type: 'softwareSystem'
  location?: Location
  containers: Container[]
}

export interface Container extends BaseElement {
  type: 'container'
  technology?: string
  components: Component[]
}

export interface Component extends BaseElement {
  type: 'component'
  technology?: string
}

export interface Group {
  id: string
  name: string
  elementIds: string[]
}

export type ModelElement = Person | SoftwareSystem | Container | Component

// ─── Relationships ───────────────────────────────────────────────────

export interface Relationship {
  id: string
  sourceId: string
  destinationId: string
  description?: string
  technology?: string
  interactionStyle?: InteractionStyle
  lineStyle?: LineStyle
  url?: string
  tags: string[]
  properties: Record<string, string>
}

// ─── Views ───────────────────────────────────────────────────────────

export type ViewType = 'systemLandscape' | 'systemContext' | 'container' | 'component'

export interface ElementInView {
  id: string
  x?: number
  y?: number
  /** True when the user has manually dragged this node */
  pinned?: boolean
}

export interface RelationshipInView {
  id: string
}

export interface AutoLayout {
  direction: LayoutDirection
  rankSeparation?: number
  nodeSeparation?: number
}

export interface View {
  type: ViewType
  key: string
  /** True when `key` was synthesised by the parser because the DSL omitted one.
   *  The serializer skips emitting auto keys so the source DSL roundtrips
   *  byte-identical for views without explicit keys. */
  autoKey?: boolean
  /** True when this entire view was synthesised by the parser because the DSL
   *  defined no views at all. The serializer skips auto views so the source
   *  DSL roundtrips unchanged; users still see them on the canvas. */
  autoView?: boolean
  title?: string
  description?: string
  softwareSystemId?: string
  containerId?: string
  elements: ElementInView[]
  relationships: RelationshipInView[]
  autoLayout?: AutoLayout
}

// ─── Styles ──────────────────────────────────────────────────────────

export interface ElementStyle {
  tag: string
  background?: string
  color?: string
  shape?: string
  fontSize?: number
  border?: string
  opacity?: number
  icon?: string
  stroke?: string
  strokeWidth?: number
}

export interface RelationshipStyle {
  tag: string
  color?: string
  thickness?: number
  dashed?: boolean
  fontSize?: number
  opacity?: number
}

export interface ViewConfiguration {
  styles: {
    elements: ElementStyle[]
    relationships: RelationshipStyle[]
  }
  themes?: string[]
}

// ─── Model ───────────────────────────────────────────────────────────

export interface Model {
  people: Person[]
  softwareSystems: SoftwareSystem[]
  relationships: Relationship[]
  groups: Group[]
}

// ─── Workspace ───────────────────────────────────────────────────────

export type WorkspaceScope = 'softwaresystem' | 'landscape' | 'none'

export interface Workspace {
  name?: string
  description?: string
  scope?: WorkspaceScope
  model: Model
  views: {
    systemLandscapeViews: View[]
    systemContextViews: View[]
    containerViews: View[]
    componentViews: View[]
    configuration: ViewConfiguration
  }
}
