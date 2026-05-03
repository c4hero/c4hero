# Highlighter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mode-tab highlighter with a single inline row of four facet controls (Tags, Status, Tech, Teams) that share one match helper, one highlight semantic, and a collapsible bar — eliminating dim-everything-else behavior.

**Architecture:** All filter facets become `string[]` in the store (Tags/Status/Tech already exist; Team is new). One pure helper (`src/lib/highlight.ts`) computes `isHighlighted` from `(element, filters)` with AND-across-facets and per-facet within-semantics (Tags/Status/Teams = OR, Tech = AND). `Canvas.buildNodes` / `buildEdges` use the helper to set a single `data.highlighted` boolean; CSS classes `c4-node-highlighted` / `c4-edge-highlighted` (renamed from `*-tech-highlight`) render the rail/glow. The bottom strip becomes four `<FacetControl>` instances around a shared popover, with manual + auto collapse to a compact pill.

**Tech Stack:** TypeScript, React 18, Zustand store, React Flow v12, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-05-03-highlighter-redesign-design.md`

---

## File Structure

**New files:**
- `src/lib/highlight.ts` — pure match helpers
- `src/lib/highlight.test.ts` — vitest unit tests
- `src/components/layout/highlighter/FacetControl.tsx` — generic facet popover
- `src/components/layout/highlighter/HighlighterBar.tsx` — orchestrator (replaces today's filter region of FloatingBottomStrip)
- `src/components/layout/highlighter/useHighlighterCollapsed.ts` — localStorage-backed collapsed state hook
- `e2e/highlighter/highlighter.spec.ts` — multi-facet stacking + collapse e2e

**Modified files:**
- `src/store/workspace.ts` — filter state arrays + `activeTeamFilter` + setters
- `src/components/canvas/Canvas.tsx` — call helper, drop opacity dim
- `src/components/canvas/nodes/BaseC4Node.tsx` — `data.highlighted` + reason instead of `activeTagFilter` lookup
- `src/components/canvas/edges/RelationshipEdge.tsx` — read `data.highlighted`
- `src/components/canvas/nodes/types.ts` — node data type updates
- `src/index.css` — class renames + highlighted visuals
- `src/components/layout/FloatingBottomStrip.tsx` — delegate filter UI to `<HighlighterBar>`; tag manager stays here
- `src/components/layout/FloatingInspector.tsx` — exempt `[data-canvas-chrome]` from outside-click
- `src/store/workspace.test.ts` — migrate single-select assertions to arrays
- `e2e/tags/tag-filtering.spec.ts` — adapt selectors to multi-select

---

## Task 1: Highlight match helper + tests

**Files:**
- Create: `src/lib/highlight.ts`
- Create: `src/lib/highlight.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/highlight.test.ts
import { describe, it, expect } from 'vitest'
import { isHighlighted, isHighlightedRel, highlightActive, type HighlightFilters } from "./highlight"
import type { Container, Person, Relationship } from '@/types/model'

const emptyFilters: HighlightFilters = { tags: [], statuses: [], techs: [], teams: [] }

const baseContainer: Container = {
  id: 'c1',
  type: 'container',
  name: 'API',
  tags: ['service', 'auth'],
  properties: {},
  status: 'Live',
  owner: 'Platform',
  technology: 'Go, Postgres, gRPC',
  components: [],
}

const noTechPerson: Person = {
  id: 'p1',
  type: 'person',
  name: 'Operator',
  tags: ['internal'],
  properties: {},
  status: 'Live',
  owner: 'Ops',
}

describe('highlightActive', () => {
  it('is false when every facet is empty', () => {
    expect(highlightActive(emptyFilters)).toBe(false)
  })
  it('is true when any facet has values', () => {
    expect(highlightActive({ ...emptyFilters, tags: ['auth'] })).toBe(true)
    expect(highlightActive({ ...emptyFilters, techs: ['Go'] })).toBe(true)
  })
})

describe('isHighlighted (AND across facets, within-semantic per facet)', () => {
  it('matches when no filters set (degenerate true — caller should gate via highlightActive)', () => {
    expect(isHighlighted(baseContainer, emptyFilters)).toBe(true)
  })

  it('tags use OR within: any selected tag suffices', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['auth', 'pii'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, tags: ['pii'] })).toBe(false)
  })

  it('statuses use OR within: any selected status suffices', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, statuses: ['Live', 'Planned'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, statuses: ['Deprecated'] })).toBe(false)
  })

  it('teams use OR within over element.owner', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, teams: ['Platform'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, teams: ['Security'] })).toBe(false)
  })

  it('teams: missing owner never matches', () => {
    const noOwner = { ...baseContainer, owner: undefined }
    expect(isHighlighted(noOwner, { ...emptyFilters, teams: ['Platform'] })).toBe(false)
  })

  it('techs use AND within: every selected tech must appear', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['Go', 'Postgres'] })).toBe(true)
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['Go', 'Kafka'] })).toBe(false)
  })

  it('techs: element with no technology field never matches a tech filter', () => {
    expect(isHighlighted(noTechPerson, { ...emptyFilters, techs: ['Go'] })).toBe(false)
  })

  it('AND across facets: must match every active facet', () => {
    expect(isHighlighted(baseContainer, { tags: ['auth'], statuses: ['Live'], techs: ['Go'], teams: ['Platform'] })).toBe(true)
    expect(isHighlighted(baseContainer, { tags: ['auth'], statuses: ['Deprecated'], techs: [], teams: [] })).toBe(false)
  })

  it('tech tokens are normalized: case-insensitive, comma+whitespace tolerant', () => {
    expect(isHighlighted(baseContainer, { ...emptyFilters, techs: ['go', 'POSTGRES'] })).toBe(true)
  })
})

describe('isHighlightedRel (Tech only)', () => {
  const rel: Relationship = {
    id: 'r1',
    sourceId: 'a',
    destinationId: 'b',
    technology: 'gRPC, HTTP/2',
  }
  it('relationships ignore tag/status/team filters', () => {
    expect(isHighlightedRel(rel, { ...emptyFilters, tags: ['auth'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, statuses: ['Live'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, teams: ['Platform'] })).toBe(true)
  })
  it('relationships AND on tech', () => {
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC', 'HTTP/2'] })).toBe(true)
    expect(isHighlightedRel(rel, { ...emptyFilters, techs: ['gRPC', 'Kafka'] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/highlight.test.ts`
Expected: FAIL with "Cannot find module './highlighter'"

- [ ] **Step 3: Implement `src/lib/highlight.ts`**

```ts
import type { ElementStatus, ModelElement, Relationship } from '@/types/model'

export interface HighlightFilters {
  tags: string[]
  statuses: ElementStatus[]
  techs: string[]
  teams: string[]
}

export function highlightActive(f: HighlightFilters): boolean {
  return f.tags.length > 0 || f.statuses.length > 0 || f.techs.length > 0 || f.teams.length > 0
}

function elementTechTokens(el: ModelElement): Set<string> {
  const raw = 'technology' in el ? el.technology : undefined
  if (!raw) return new Set()
  return new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
}

function relTechTokens(rel: Relationship): Set<string> {
  if (!rel.technology) return new Set()
  return new Set(rel.technology.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
}

function matchesTechAND(tokens: Set<string>, techs: string[]): boolean {
  if (techs.length === 0) return true
  if (tokens.size === 0) return false
  for (const t of techs) {
    if (!tokens.has(t.toLowerCase())) return false
  }
  return true
}

export function isHighlighted(el: ModelElement, f: HighlightFilters): boolean {
  if (f.tags.length > 0) {
    if (!f.tags.some((t) => el.tags.includes(t))) return false
  }
  if (f.statuses.length > 0) {
    if (!el.status || !f.statuses.includes(el.status)) return false
  }
  if (f.teams.length > 0) {
    if (!el.owner || !f.teams.includes(el.owner)) return false
  }
  if (!matchesTechAND(elementTechTokens(el), f.techs)) return false
  return true
}

export function isHighlightedRel(rel: Relationship, f: HighlightFilters): boolean {
  return matchesTechAND(relTechTokens(rel), f.techs)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/highlight.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/highlight.ts src/lib/highlight.test.ts
git commit -m "feat(highlighter): add pure match helper for facet filtering"
```

---

## Task 2: Migrate filter state to arrays + add team filter

**Files:**
- Modify: `src/store/workspace.ts:93-100, 135, 188-192, 336-342, 372-377, 1384-1395, 1441, 1464`
- Modify: `src/store/workspace.test.ts` (assertion updates only — see Step 4)

- [ ] **Step 1: Update state types and initial values**

In `src/store/workspace.ts` change the type and initial declarations:

```ts
// Replace:
//   activeTagFilter: string | null
//   activeStatusFilter: ElementStatus | null
//   activeTechFilter: string[]
// With:
activeTagFilter: string[]
activeStatusFilter: ElementStatus[]
activeTechFilter: string[]
activeTeamFilter: string[]
```

In the WorkspaceActions interface (around line 188-192), replace the setter signatures:

```ts
setActiveTagFilter: (tags: string[]) => void
toggleActiveTagFilter: (tag: string) => void
setActiveStatusFilter: (statuses: ElementStatus[]) => void
toggleActiveStatusFilter: (status: ElementStatus) => void
setActiveTechFilter: (techs: string[]) => void
toggleActiveTechFilter: (tech: string) => void
setActiveTeamFilter: (teams: string[]) => void
toggleActiveTeamFilter: (team: string) => void
clearAllHighlightFilters: () => void
```

In every initial-state literal (lines ~336-338, 374-376, plus any other reset path), replace `activeTagFilter: null` with `activeTagFilter: []`, `activeStatusFilter: null` with `activeStatusFilter: []`, and add `activeTeamFilter: []`. Use grep to find all of them:

Run: `grep -n "activeTagFilter:\|activeStatusFilter:\|activeTechFilter:" src/store/workspace.ts`

Update each match to the array form and add an `activeTeamFilter: []` line next to each.

- [ ] **Step 2: Replace setter implementations**

Around line 1384, replace the existing `setActiveTagFilter` / `setActiveStatusFilter` and the existing `setActiveTechFilter` / `toggleActiveTechFilter` block with:

```ts
setActiveTagFilter: (tags) => set({ activeTagFilter: tags }),
toggleActiveTagFilter: (tag) => set((s) => ({
  activeTagFilter: s.activeTagFilter.includes(tag)
    ? s.activeTagFilter.filter((t) => t !== tag)
    : [...s.activeTagFilter, tag],
})),
setActiveStatusFilter: (statuses) => set({ activeStatusFilter: statuses }),
toggleActiveStatusFilter: (status) => set((s) => ({
  activeStatusFilter: s.activeStatusFilter.includes(status)
    ? s.activeStatusFilter.filter((x) => x !== status)
    : [...s.activeStatusFilter, status],
})),
setActiveTechFilter: (techs) => set({ activeTechFilter: techs }),
toggleActiveTechFilter: (tech) => set((s) => ({
  activeTechFilter: s.activeTechFilter.includes(tech)
    ? s.activeTechFilter.filter((t) => t !== tech)
    : [...s.activeTechFilter, tech],
})),
setActiveTeamFilter: (teams) => set({ activeTeamFilter: teams }),
toggleActiveTeamFilter: (team) => set((s) => ({
  activeTeamFilter: s.activeTeamFilter.includes(team)
    ? s.activeTeamFilter.filter((t) => t !== team)
    : [...s.activeTeamFilter, team],
})),
clearAllHighlightFilters: () => set({
  activeTagFilter: [],
  activeStatusFilter: [],
  activeTechFilter: [],
  activeTeamFilter: [],
}),
```

- [ ] **Step 3: Update tag rename/remove integrations**

Line ~1441 currently reads `activeTagFilter: s.activeTagFilter === oldTag ? newTag : s.activeTagFilter`. Replace with:

```ts
activeTagFilter: s.activeTagFilter.map((t) => (t === oldTag ? newTag : t)),
```

Line ~1464 currently reads `activeTagFilter: s.activeTagFilter === tag ? null : s.activeTagFilter`. Replace with:

```ts
activeTagFilter: s.activeTagFilter.filter((t) => t !== tag),
```

- [ ] **Step 4: Update unit tests**

In `src/store/workspace.test.ts`, find every assertion that compares `activeTagFilter` or `activeStatusFilter` against a string or `null` and convert to array form. Use grep to find them:

Run: `grep -n "activeTagFilter\|activeStatusFilter" src/store/workspace.test.ts`

For each line:
- `expect(...).toBe('foo')` → `expect(...).toEqual(['foo'])`
- `expect(...).toBe(null)` → `expect(...).toEqual([])`
- Calls like `setActiveTagFilter('foo')` → `setActiveTagFilter(['foo'])` (or use `toggleActiveTagFilter('foo')` if the test was simulating a single click)

Add a new test:

```ts
it('clearAllHighlightFilters resets all four facets', () => {
  const s = useWorkspaceStore.getState()
  s.setActiveTagFilter(['x'])
  s.setActiveStatusFilter(['Live'])
  s.setActiveTechFilter(['Go'])
  s.setActiveTeamFilter(['Platform'])
  s.clearAllHighlightFilters()
  const after = useWorkspaceStore.getState()
  expect(after.activeTagFilter).toEqual([])
  expect(after.activeStatusFilter).toEqual([])
  expect(after.activeTechFilter).toEqual([])
  expect(after.activeTeamFilter).toEqual([])
})

it('loadWorkspace clears activeTeamFilter', () => {
  useWorkspaceStore.getState().setActiveTeamFilter(['Platform'])
  useWorkspaceStore.getState().loadWorkspace(/* existing fixture used in this file */)
  expect(useWorkspaceStore.getState().activeTeamFilter).toEqual([])
})
```

For the second test, copy whatever fixture the existing "loadWorkspace clears activeTagFilter and activeStatusFilter" test (around line 692) uses.

- [ ] **Step 5: Run store tests**

Run: `npx vitest run src/store/workspace.test.ts`
Expected: PASS. If failures remain, fix the call sites the test points to. Do not move on with red tests.

- [ ] **Step 6: Commit**

```bash
git add src/store/workspace.ts src/store/workspace.test.ts
git commit -m "feat(highlighter): migrate filter state to arrays, add team filter"
```

---

## Task 3: Wire Canvas to highlighter helper, drop opacity dim, rename CSS classes

**Files:**
- Modify: `src/components/canvas/Canvas.tsx:163-237, 403-519, 533-545, 614-672`
- Modify: `src/components/canvas/nodes/types.ts`
- Modify: `src/index.css:1560-1586` (rename `.c4-tech-marquee` → `.c4-node-highlighted-rail`, `.c4-edge-tech-highlight` → `.c4-edge-highlighted`)
- Modify: `src/components/canvas/nodes/BaseC4Node.tsx:120` (read `data.highlighted` + use new class)
- Modify: `src/components/canvas/edges/RelationshipEdge.tsx` (read `data.highlighted`)

- [ ] **Step 1: Update node data type**

In `src/components/canvas/nodes/types.ts`, find the `C4NodeData` interface. Remove `dimmed` and `techHighlighted`. Add:

```ts
highlighted?: boolean
```

- [ ] **Step 2: Replace buildNodes filter logic**

In `src/components/canvas/Canvas.tsx`, replace the `buildNodes` body's filter section (lines ~163-237) with one that reads `HighlightFilters` instead of three separate filters and calls `isHighlighted`. New signature:

```ts
import { isHighlighted, isHighlightedRel, highlightActive, type HighlightFilters } from '@/lib/highlight'

function buildNodes(
  workspace: Workspace,
  view: View,
  onDrillIn: (elementId: string) => void,
  filters: HighlightFilters,
  viewCountMap: Map<string, number>,
  drillableIds: Set<string>,
  themeStyles: ElementStyle[],
): Node[] {
  const elementMap = buildElementMap(workspace)
  const styleIndex = buildStyleIndex([...themeStyles, ...workspace.views.configuration.styles.elements])

  const active = highlightActive(filters)
  const nodes: Node[] = []

  for (const viewEl of view.elements) {
    const element = elementMap.get(viewEl.id)
    if (!element) continue

    const style = getElementStyle(element, styleIndex)
    const highlighted = active && isHighlighted(element, filters)
    const pos = { x: viewEl.x ?? 0, y: viewEl.y ?? 0 }

    nodes.push({
      id: element.id,
      type: element.type,
      position: pos,
      data: {
        element,
        style,
        childCount: getChildCount(element),
        canDrill: drillableIds.has(element.id),
        onDrillIn,
        highlighted,
        viewCount: viewCountMap.get(element.id) ?? 1,
      },
      // No more opacity dim. Highlighted nodes get the rail/glow class; non-matches render normally.
      className: highlighted ? 'c4-node-highlighted' : undefined,
    })
  }

  return nodes
}
```

Delete the previous `effectiveTagFilter` / `effectiveStatusFilter` "auto-suppress" logic — it's no longer needed: `isHighlighted` already returns false for elements that don't match, and a facet that matches nothing in the view simply means no node gets the rail. (The "show count `(0)` for facets with no match in view" UX moves to Task 5.)

- [ ] **Step 3: Replace buildEdges filter logic**

Same file, in `buildEdges` (around line 403-519), replace the per-edge tech matching with `isHighlightedRel`:

```ts
function buildEdges(
  workspace: Workspace,
  view: View,
  nodes: Node[],
  filters: HighlightFilters,
): Edge[] {
  // ... existing setup unchanged ...
  const active = highlightActive(filters)

  // ... inside the loop, replace the techHighlighted block with: ...
  const highlighted = active && isHighlightedRel(e.rel, filters)

  edges.push({
    id: e.rel.id,
    source: e.sourceId,
    target: e.targetId,
    sourceHandle: `${e.sourceSide}-${srcSlot}-source`,
    targetHandle: `${e.targetSide}-${tgtSlot}-target`,
    type: 'relationship',
    data: { relationship: e.rel, relationshipStyle: e.relStyle, highlighted },
    className: highlighted ? 'c4-edge-highlighted' : undefined,
  })
  // ... existing return unchanged ...
}
```

- [ ] **Step 4: Update Canvas component to read all four filter arrays**

In `Canvas.tsx` around line 533, the component reads three filter values. Replace with four reads + a memoized `HighlightFilters` object:

```ts
const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
const activeTechFilter = useWorkspaceStore((s) => s.activeTechFilter)
const activeTeamFilter = useWorkspaceStore((s) => s.activeTeamFilter)

const highlighterFilters = useMemo<HighlightFilters>(() => ({
  tags: activeTagFilter,
  statuses: activeStatusFilter,
  techs: activeTechFilter,
  teams: activeTeamFilter,
}), [activeTagFilter, activeStatusFilter, activeTechFilter, activeTeamFilter])
```

Update the `buildNodes` and `buildEdges` calls inside the `useMemo` (lines ~636 and ~649) to pass `highlighterFilters`. Update that `useMemo`'s deps array to use `highlighterFilters` instead of the three previous filter values.

- [ ] **Step 5: Update CSS class names**

In `src/index.css`:
- Rename `.c4-tech-marquee` → `.c4-node-highlighted-rail` everywhere it appears (selector + person variant).
- Rename `.c4-edge-tech-highlight` → `.c4-edge-highlighted` everywhere it appears.

Run: `grep -n "c4-tech-marquee\|c4-edge-tech-highlight" src/`
Expected after rename: zero results.

Add a wrapping outer-glow class on the node:

```css
.c4-node-highlighted {
  /* nothing visual on the wrapper itself yet — the rail is rendered inside.
     If we want an outer ring, add it here. */
}
```

(Visual treatment can stay the same as today's tech-highlight; we're just generalizing names. If the user wants a stronger visual later, edit this class.)

- [ ] **Step 6: Update BaseC4Node to read data.highlighted**

In `src/components/canvas/nodes/BaseC4Node.tsx`, around line 120 the rail is conditionally rendered:

```tsx
{data.techHighlighted && <span className="c4-tech-marquee" aria-hidden="true" />}
```

Replace with:

```tsx
{data.highlighted && <span className="c4-node-highlighted-rail" aria-hidden="true" />}
```

Also: replace the `activeTagFilter` lookup block (lines 58 + 216-240) that renders `c4-node-tag-label`. New behavior: render the under-node label only when the node is `data.highlighted`. The label text comes from a small helper that reads from the highlighter filters and picks the most-specific reason. Add to BaseC4Node:

```tsx
const filters = useWorkspaceStore(useShallow((s) => ({
  tags: s.activeTagFilter,
  statuses: s.activeStatusFilter,
  techs: s.activeTechFilter,
  teams: s.activeTeamFilter,
})))

const reasonLabel = data.highlighted ? pickHighlightReason(element, filters) : null
```

…and replace the existing `{activeTagFilter && element.tags.includes(activeTagFilter) && (...)}` block with:

```tsx
{reasonLabel && (
  <span
    className="c4-highlight-label"
    style={{ /* same styling as the previous c4-node-tag-label inline style block */ }}
    aria-label={`Match: ${reasonLabel}`}
  >
    {reasonLabel}
  </span>
)}
```

Define `pickHighlightReason` as a local helper at the bottom of the file:

```tsx
function pickHighlightReason(el: ModelElement, f: HighlightFilters): string | null {
  // Priority: tech > tag > team > status. Tie-breaker: first selected.
  if (f.techs.length > 0) {
    const elTech = ('technology' in el ? el.technology : undefined) ?? ''
    const tokens = elTech.split(',').map((t) => t.trim())
    const hit = f.techs.find((t) => tokens.some((tok) => tok.toLowerCase() === t.toLowerCase()))
    if (hit) return hit
  }
  if (f.tags.length > 0) {
    const hit = f.tags.find((t) => el.tags.includes(t))
    if (hit) return hit
  }
  if (f.teams.length > 0 && el.owner && f.teams.includes(el.owner)) return el.owner
  if (f.statuses.length > 0 && el.status && f.statuses.includes(el.status)) return el.status
  return null
}
```

(Imports: `import type { ModelElement } from '@/types/model'`, `import type { HighlightFilters } from '@/lib/highlight'`.)

Rename the CSS class `c4-node-tag-label` → `c4-highlight-label` in `index.css` and the JSX.

- [ ] **Step 7: Update RelationshipEdge to read data.highlighted**

In `src/components/canvas/edges/RelationshipEdge.tsx`, find any read of `data.techHighlighted` and rename to `data.highlighted`. (If the edge component currently doesn't render a marquee, no visual change is needed — the className `c4-edge-highlighted` is applied at the React Flow edge level by `buildEdges` and the CSS already targets `.c4-edge-highlighted path.react-flow__edge-path`.)

Run: `grep -rn "techHighlighted" src/`
Expected after rename: zero results.

- [ ] **Step 8: Verify**

Run: `npx vitest run` (full unit suite)
Expected: PASS.

Run: `npm run typecheck` (or `npx tsc --noEmit` if there's no script)
Expected: PASS.

Smoke-test the dev server:
1. `npm run dev`
2. Open a workspace, open the highlighter, toggle a tag.
3. Confirm: matching nodes show the rail; **non-matching nodes are not dimmed**.
4. Toggle on a status — only nodes matching both tag AND status retain the rail.

- [ ] **Step 9: Commit**

```bash
git add src/lib/highlight.ts src/components/canvas/Canvas.tsx src/components/canvas/nodes/BaseC4Node.tsx src/components/canvas/nodes/types.ts src/components/canvas/edges/RelationshipEdge.tsx src/index.css
git commit -m "feat(highlighter): drop opacity dim, route all facets through isHighlighted helper"
```

---

## Task 4: Generic FacetControl popover

**Files:**
- Create: `src/components/layout/highlighter/FacetControl.tsx`

This task extracts the existing `TechFilterControls` popover from `FloatingBottomStrip.tsx:567-752` into a reusable component that can drive any facet (Tags, Status, Tech, Teams).

- [ ] **Step 1: Implement FacetControl**

```tsx
// src/components/layout/highlighter/FacetControl.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

export interface FacetControlProps {
  label: string                                     // e.g. "Tech"
  icon: ReactNode                                   // e.g. <Cpu size={13} />
  withinSemantic: 'AND' | 'ANY'                     // tooltip hint in popover header
  /** All values that exist in the current view. */
  available: string[]
  /** Currently selected values (may include items not in `available`). */
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
  /** Optional swatch color for a value (Tags use tag style background, Status uses status color). */
  colorFor?: (value: string) => string | undefined
  /** Render label for a value (Status uses Title-case "Live", same as raw). */
  renderValue?: (value: string) => string
  /** Limit of inline preview chips next to the trigger. */
  visibleChipLimit?: number
  /** When `available` is empty, render the trigger disabled with this tooltip. */
  emptyHint?: string
}

const POPUP_WIDTH = 280
const POPUP_MAX_HEIGHT = 380

export default function FacetControl({
  label,
  icon,
  withinSemantic,
  available,
  selected,
  onToggle,
  onClear,
  colorFor,
  renderValue = (v) => v,
  visibleChipLimit = 2,
  emptyHint,
}: FacetControlProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDisabled = available.length === 0 && selected.length === 0

  function openPopup() {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    let left = r.left
    left = Math.max(8, Math.min(left, window.innerWidth - POPUP_WIDTH - 8))
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    const top = openUp
      ? Math.max(8, r.top - Math.min(POPUP_MAX_HEIGHT, spaceAbove) - 6)
      : r.bottom + 6
    const maxHeight = openUp ? Math.min(POPUP_MAX_HEIGHT, spaceAbove) : Math.min(POPUP_MAX_HEIGHT, spaceBelow)
    setCoords({ top, left, width: POPUP_WIDTH, maxHeight })
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  useEffect(() => {
    if (!open) return
    function onDocPointer(e: MouseEvent | TouchEvent | PointerEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (popupRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer, true)
    document.addEventListener('mousedown', onDocPointer, true)
    document.addEventListener('touchstart', onDocPointer, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true)
      document.removeEventListener('mousedown', onDocPointer, true)
      document.removeEventListener('touchstart', onDocPointer, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filteredValues = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((v) => v.toLowerCase().includes(q))
  }, [available, query])

  const ordered = useMemo(() => {
    const sel = filteredValues.filter((v) => selected.includes(v))
    const unsel = filteredValues.filter((v) => !selected.includes(v))
    return { sel, unsel }
  }, [filteredValues, selected])

  const visibleChips = selected.slice(0, visibleChipLimit)
  const hiddenChipCount = Math.max(0, selected.length - visibleChipLimit)
  const matchedInView = selected.filter((v) => available.includes(v)).length
  const stale = selected.length > 0 && matchedInView === 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        disabled={isDisabled}
        title={isDisabled ? emptyHint : undefined}
        className="hover-lift-inactive"
        data-active={open ? 'true' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          height: 30,
          padding: '0 10px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: stale ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
          background: open ? 'var(--color-accent-active)' : undefined,
          opacity: isDisabled ? 0.5 : 1,
          cursor: isDisabled ? 'default' : 'pointer',
          border: 'none',
          flexShrink: 0,
        }}
      >
        {icon}
        {label}
        {selected.length > 0 && (
          <span style={{ marginLeft: 4, opacity: stale ? 0.6 : 1 }}>
            {stale ? `${selected.length} (0)` : selected.length}
          </span>
        )}
        <ChevronDown size={11} />
      </button>

      {visibleChips.map((value) => {
        const swatch = colorFor?.(value)
        return (
          <button
            key={value}
            onClick={() => onToggle(value)}
            title={`Remove ${renderValue(value)}`}
            style={{
              height: 26,
              padding: '0 8px',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-bg-primary)',
              background: swatch ?? 'var(--color-accent)',
              border: 'none',
              cursor: 'pointer',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderValue(value)}</span>
            <X size={10} style={{ flexShrink: 0 }} />
          </button>
        )
      })}
      {hiddenChipCount > 0 && (
        <button
          onClick={openPopup}
          style={{
            height: 26, padding: '0 8px', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)', fontWeight: 600,
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
            border: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          +{hiddenChipCount} more
        </button>
      )}
      {selected.length > 0 && (
        <button
          onClick={onClear}
          title={`Clear ${label} filter`}
          aria-label={`Clear ${label} filter`}
          style={{
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            cursor: 'pointer', border: 'none', background: 'transparent',
            flexShrink: 0,
          }}
        >
          <X size={11} />
        </button>
      )}

      {open && coords && createPortal(
        <div
          ref={popupRef}
          className="glass-panel-solid"
          style={{
            position: 'fixed',
            top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight,
            zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          role="dialog"
          aria-label={`${label} filter`}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
          }}>
            <span style={{ fontWeight: 700 }}>{label}</span>
            <span title={withinSemantic === 'AND' ? 'All selected match' : 'Any selected match'}>
              match: {withinSemantic === 'AND' ? 'all' : 'any'}
            </span>
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--color-border)',
              outline: 'none', background: 'transparent', color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {[...ordered.sel, ...ordered.unsel].map((value) => {
              const isSel = selected.includes(value)
              const swatch = colorFor?.(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggle(value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: isSel ? 'var(--color-accent-active)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 'var(--text-sm)',
                    color: isSel ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  }}
                >
                  {swatch && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: swatch, flexShrink: 0 }} />
                  )}
                  {renderValue(value)}
                </button>
              )
            })}
            {ordered.sel.length === 0 && ordered.unsel.length === 0 && (
              <div style={{ padding: '12px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                No matches
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <button
              onClick={onClear}
              style={{
                padding: '8px 12px', borderTop: '1px solid var(--color-border)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)',
                textAlign: 'left',
              }}
            >
              Clear all ({selected.length})
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/highlighter/FacetControl.tsx
git commit -m "feat(highlighter): add generic FacetControl popover"
```

---

## Task 5: HighlighterBar orchestrator + collapse hook

**Files:**
- Create: `src/components/layout/highlighter/useHighlighterCollapsed.ts`
- Create: `src/components/layout/highlighter/HighlighterBar.tsx`

- [ ] **Step 1: Collapse state hook**

```tsx
// src/components/layout/highlighter/useHighlighterCollapsed.ts
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'c4hero:highlighter-collapsed'

export function useHighlighterCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, '1')
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage unavailable — ignore
    }
  }, [])

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCollapsedState(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return [collapsed, setCollapsed]
}
```

- [ ] **Step 2: HighlighterBar**

```tsx
// src/components/layout/highlighter/HighlighterBar.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Tag, Activity, Cpu, Users, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useWorkspaceStore, getActiveView, buildElementMap } from '@/store/workspace'
import type { ElementStatus } from '@/types/model'
import FacetControl from './FacetControl'
import { useHighlighterCollapsed } from './useHighlighterCollapsed'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: 'var(--color-status-live)',
  Planned: 'var(--color-status-planned)',
  Deprecated: 'var(--color-status-deprecated)',
  Removed: 'var(--color-status-removed)',
}

const DEFAULT_BUILTIN_TAGS = ['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship',
  'Web Application', 'Service', 'Database', 'Queue', 'Mobile App', 'File System']

export default function HighlighterBar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
  const activeTechFilter = useWorkspaceStore((s) => s.activeTechFilter)
  const activeTeamFilter = useWorkspaceStore((s) => s.activeTeamFilter)
  const toggleTag = useWorkspaceStore((s) => s.toggleActiveTagFilter)
  const setTags = useWorkspaceStore((s) => s.setActiveTagFilter)
  const toggleStatus = useWorkspaceStore((s) => s.toggleActiveStatusFilter)
  const setStatuses = useWorkspaceStore((s) => s.setActiveStatusFilter)
  const toggleTech = useWorkspaceStore((s) => s.toggleActiveTechFilter)
  const setTechs = useWorkspaceStore((s) => s.setActiveTechFilter)
  const toggleTeam = useWorkspaceStore((s) => s.toggleActiveTeamFilter)
  const setTeams = useWorkspaceStore((s) => s.setActiveTeamFilter)
  const clearAll = useWorkspaceStore((s) => s.clearAllHighlightFilters)

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const elementMap = useMemo(() => (workspace ? buildElementMap(workspace) : new Map()), [workspace])

  const viewTags = useMemo(() => {
    if (!view) return []
    const tags = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el) for (const tag of el.tags) {
        if (!DEFAULT_BUILTIN_TAGS.includes(tag)) tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [view, elementMap])

  const viewStatuses = useMemo<ElementStatus[]>(() => {
    if (!view) return []
    const statuses = new Set<ElementStatus>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.status) statuses.add(el.status)
    }
    // Stable order
    return (['Live', 'Planned', 'Deprecated', 'Removed'] as ElementStatus[]).filter((s) => statuses.has(s))
  }, [view, elementMap])

  const viewTechs = useMemo(() => {
    if (!view) return []
    const techs = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id) as { technology?: string } | undefined
      const raw = el?.technology
      if (!raw) continue
      for (const t of raw.split(',').map((s) => s.trim()).filter(Boolean)) techs.add(t)
    }
    return Array.from(techs).sort((a, b) => a.localeCompare(b))
  }, [view, elementMap])

  const viewTeams = useMemo(() => {
    if (!view) return []
    const teams = new Set<string>()
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el?.owner) teams.add(el.owner)
    }
    return Array.from(teams).sort((a, b) => a.localeCompare(b))
  }, [view, elementMap])

  const tagStyles = workspace?.views.configuration.styles.elements ?? []
  const tagColorFor = (tag: string) => tagStyles.find((s) => s.tag === tag)?.background

  // Collapse state
  const [manuallyCollapsed, setManuallyCollapsed] = useHighlighterCollapsed()
  const [autoCollapsed, setAutoCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const ro = new ResizeObserver(() => {
      // If we're already collapsed, don't fight the user — only auto-collapse from expanded.
      if (manuallyCollapsed) { setAutoCollapsed(false); return }
      // Compare scrollWidth to clientWidth on the inner row.
      setAutoCollapsed(content.scrollWidth > content.clientWidth + 2)
    })
    ro.observe(container)
    ro.observe(content)
    return () => ro.disconnect()
  }, [manuallyCollapsed])

  const collapsed = manuallyCollapsed || autoCollapsed
  const totalSelected =
    activeTagFilter.length + activeStatusFilter.length + activeTechFilter.length + activeTeamFilter.length

  const facetDots = [
    { lit: activeTagFilter.length > 0, label: 'Tags' },
    { lit: activeStatusFilter.length > 0, label: 'Status' },
    { lit: activeTechFilter.length > 0, label: 'Tech' },
    { lit: activeTeamFilter.length > 0, label: 'Teams' },
  ]

  if (!workspace) return null

  return (
    <div
      ref={containerRef}
      data-canvas-chrome="highlighter-panel"
      className="glass-panel"
      style={{
        pointerEvents: 'auto',
        maxWidth: '100%',
        display: 'flex',
        alignItems: 'center',
        height: 44,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => { setManuallyCollapsed(false); setAutoCollapsed(false) }}
          title={
            totalSelected === 0
              ? 'Highlighter (no filters)'
              : `Highlighter: ${totalSelected} filter${totalSelected === 1 ? '' : 's'} active`
          }
          style={{
            height: '100%', padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {facetDots.map((d) => (
              <span
                key={d.label}
                aria-label={`${d.label}${d.lit ? ' active' : ''}`}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: d.lit ? 'var(--color-accent)' : 'var(--color-border)',
                }}
              />
            ))}
          </span>
          <span>{totalSelected === 0 ? 'Highlighter' : `${totalSelected} active`}</span>
          <ChevronUp size={12} />
        </button>
      ) : (
        <div
          ref={contentRef}
          style={{
            display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, height: '100%', overflow: 'hidden',
          }}
        >
          <FacetControl
            label="Tags"
            icon={<Tag size={13} />}
            withinSemantic="ANY"
            available={viewTags}
            selected={activeTagFilter}
            onToggle={toggleTag}
            onClear={() => setTags([])}
            colorFor={tagColorFor}
            emptyHint="No custom tags in this view"
          />
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <FacetControl
            label="Status"
            icon={<Activity size={13} />}
            withinSemantic="ANY"
            available={viewStatuses}
            selected={activeStatusFilter}
            onToggle={(v) => toggleStatus(v as ElementStatus)}
            onClear={() => setStatuses([])}
            colorFor={(v) => STATUS_COLORS[v as ElementStatus]}
            emptyHint="No statuses in this view"
          />
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <FacetControl
            label="Tech"
            icon={<Cpu size={13} />}
            withinSemantic="AND"
            available={viewTechs}
            selected={activeTechFilter}
            onToggle={toggleTech}
            onClear={() => setTechs([])}
            emptyHint="No technology values in this view"
          />
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <FacetControl
            label="Teams"
            icon={<Users size={13} />}
            withinSemantic="ANY"
            available={viewTeams}
            selected={activeTeamFilter}
            onToggle={toggleTeam}
            onClear={() => setTeams([])}
            emptyHint="No owners set in this view"
          />
          <div style={{ flex: 1 }} />
          {totalSelected > 0 && (
            <button
              type="button"
              onClick={clearAll}
              title="Clear all highlighter filters"
              style={{
                height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600,
                marginRight: 4, flexShrink: 0,
              }}
            >
              <X size={11} />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setManuallyCollapsed(true)}
            title="Collapse highlighter"
            aria-label="Collapse highlighter"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)',
              marginRight: 6, flexShrink: 0,
            }}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/highlighter/HighlighterBar.tsx src/components/layout/highlighter/useHighlighterCollapsed.ts
git commit -m "feat(highlighter): add HighlighterBar orchestrator with collapse"
```

---

## Task 6: Replace FloatingBottomStrip filter UI with HighlighterBar; mark canvas chrome

**Files:**
- Modify: `src/components/layout/FloatingBottomStrip.tsx`
- Modify: `src/components/layout/FloatingInspector.tsx:32`

- [ ] **Step 1: Replace the filter region**

In `FloatingBottomStrip.tsx`:

1. Remove the local `Mode` state, the `mode` `useState`, and the `ModeTab` usages (the Tags/Status/Tech tab block at the top of the inner glass panel).
2. Remove the inline Tags / Status / Tech filter bodies (the `mode === 'tags'`, `mode === 'status'`, `mode === 'tech'` JSX blocks) — they're replaced by `<HighlighterBar />`.
3. Remove `TechFilterControls` and the `STATUS_OPTIONS` constant (now in `HighlighterBar`/`FacetControl`).
4. Keep the `TagManagerPanel` and `ScopeViolationBanner` parts — they're not replaced.

The outer file becomes a thin shell that wraps `<HighlighterBar />` with the existing fixed-bottom positioner and renders the manage-tags pencil button + portal alongside.

Replacement skeleton (modify, don't rewrite the whole file):

```tsx
import HighlighterBar from "./highlight"HighlighterBar'
// ... existing imports for Pencil button + TagManagerPanel + ScopeViolationBanner ...

export default function FloatingBottomStrip() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const scopeViolations = useWorkspaceStore((s) => s.scopeViolations)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  if (!workspace) return null

  return (
    <>
      {scopeViolations.filter((v) => !v.elementId && !v.relationshipId).length > 0 && (
        <ScopeViolationBanner violations={scopeViolations.filter((v) => !v.elementId && !v.relationshipId)} />
      )}
      <div
        data-canvas-fit-chrome="bottom"
        style={{
          position: 'fixed',
          bottom: 'max(14px, calc(env(safe-area-inset-bottom, 0px) + 8px))',
          left: 0, right: 0, zIndex: 50,
          display: 'flex', justifyContent: 'center', padding: '0 14px',
          pointerEvents: 'none',
        }}
      >
        <HighlighterBar />
        {/* Pencil button to open the tag manager — kept here so HighlighterBar stays focused on filters. */}
        {/* (Position absolute or inline next to HighlighterBar — pick whichever fits the existing layout.) */}
      </div>
      {tagManagerOpen && createPortal(<TagManagerPanel onClose={() => setTagManagerOpen(false)} />, document.body)}
    </>
  )
}
```

If keeping the pencil button proves awkward, accept that as scope: move it inside `HighlighterBar` as a final trailing button next to the collapse chevron, or surface it via the Tags facet popover header (`+ Manage tags`). Default: trailing button next to collapse chevron in the expanded bar.

- [ ] **Step 2: Update FloatingInspector outside-click**

Replace `FloatingInspector.tsx:32`:

```tsx
const inCanvas = (target as Element).closest?.('.react-flow')
```

with:

```tsx
const inCanvas = (target as Element).closest?.('.react-flow, [data-canvas-chrome]')
```

Now clicking a highlighter chip won't dismiss the inspector.

- [ ] **Step 3: Smoke-test**

Run: `npm run dev`
1. Select a node; inspector opens.
2. Click a Tag chip in the highlighter → inspector stays open, node's highlighted ring updates if the tag matches.
3. Toggle multiple facets; confirm the inline preview chips show selections; confirm `Clear` button appears and clears all four facets.
4. Drag the browser narrow until the bar overflows → it auto-collapses to the pill. Expand by clicking it.
5. Collapse manually via the chevron, reload the page, confirm it stays collapsed.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/FloatingBottomStrip.tsx src/components/layout/FloatingInspector.tsx
git commit -m "feat(highlighter): mount HighlighterBar; protect inspector from chip clicks"
```

---

## Task 7: E2E coverage for stacked filters + collapse

**Files:**
- Create: `e2e/highlighter/highlighter.spec.ts`
- Modify: `e2e/tags/tag-filtering.spec.ts` (selector adjustments only)

- [ ] **Step 1: Add new e2e file**

```ts
// e2e/highlighter/highlighter.spec.ts
import { test, expect } from '@playwright/test'

test.describe('highlighter bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Bootstrap: open the demo workspace. Use whatever helper exists in the
    // repo's e2e/ for opening a fixture workspace — copy from
    // `e2e/welcome/welcome.spec.ts` if needed.
  })

  test('AND across facets: matches must satisfy every active facet', async ({ page }) => {
    // Open Tags facet, toggle a known tag.
    await page.getByRole('button', { name: /^Tags/ }).click()
    await page.getByRole('button', { name: 'auth' }).click()
    await page.keyboard.press('Escape')

    // Open Status facet, toggle Live.
    await page.getByRole('button', { name: /^Status/ }).click()
    await page.getByRole('button', { name: 'Live' }).click()
    await page.keyboard.press('Escape')

    // Verify only nodes matching auth + Live carry the highlighted class.
    const highlighted = page.locator('.react-flow__node.c4-node-highlighted')
    await expect(highlighted).toHaveCount(/* fill in expected count from fixture */ 1)
  })

  test('inactive filter (no match in this view) does not dim the canvas', async ({ page }) => {
    // Apply a status no element in this view has — fixture-dependent; pick "Removed".
    await page.getByRole('button', { name: /^Status/ }).click()
    await page.getByRole('button', { name: 'Removed' }).click()
    await page.keyboard.press('Escape')

    // No node should be dimmed. (We removed the dim entirely; this asserts no node has opacity < 1.)
    const nodes = page.locator('.react-flow__node:not(.react-flow__node-group)')
    const count = await nodes.count()
    for (let i = 0; i < count; i++) {
      const opacity = await nodes.nth(i).evaluate((n) => Number(getComputedStyle(n).opacity))
      expect(opacity).toBeGreaterThanOrEqual(0.95)
    }
  })

  test('clicking a facet chip does not close the inspector', async ({ page }) => {
    // Select a node by clicking it.
    await page.locator('.react-flow__node').first().click()
    await expect(page.getByLabel('Element properties')).toBeVisible()

    // Toggle a tag chip; inspector should remain visible.
    await page.getByRole('button', { name: /^Tags/ }).click()
    await page.getByRole('button', { name: /auth/i }).first().click()
    await expect(page.getByLabel('Element properties')).toBeVisible()
  })

  test('manual collapse persists across reload', async ({ page }) => {
    await page.getByLabel('Collapse highlighter').click()
    await expect(page.getByRole('button', { name: /Highlighter|active/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /Highlighter|active/ })).toBeVisible()
  })
})
```

Adjust the fixture-dependent counts and tag/status names by reading the fixture workspace used in existing e2e tests. If the existing tests select tags by exact case-sensitive name, mirror that.

- [ ] **Step 2: Update existing tag e2e**

In `e2e/tags/tag-filtering.spec.ts`, the highlighter no longer has a `Tags` mode tab; instead clicking the Tags facet button opens the popover. Update each interaction:

- Replace selector for the mode tab with the `Tags` facet button.
- Replace assertions that check for a single active tag (`activeTagFilter === tag`) with assertions that the tag pill renders with the active styling.
- Pin a tag, switch view, return — the pill should still be active.

Keep the tag rename / tag remove tests intact (state migration in Task 2 already preserved their semantics: rename maps in array; remove filters out).

- [ ] **Step 3: Run e2e**

Run: `npx playwright test e2e/highlighter e2e/tags`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/highlighter/highlighter.spec.ts e2e/tags/tag-filtering.spec.ts
git commit -m "test(highlighter): cover AND-stacking, no-match inactivity, collapse persistence"
```

---

## Task 8: Cleanup pass

**Files:**
- Modify: `src/components/canvas/Canvas.tsx` (remove the now-unused `tagFilterMatchesAny` / `statusFilterMatchesAny` helpers if any survived Task 3)
- Modify: `src/index.css` (audit for orphan `c4-tech-marquee` / `c4-edge-tech-highlight` / `c4-node-tag-label` references)

- [ ] **Step 1: Grep for stale identifiers**

Run:
```bash
grep -rn "c4-tech-marquee\|c4-edge-tech-highlight\|c4-node-tag-label\|techHighlighted\|tagFilterMatchesAny\|statusFilterMatchesAny" src/
```

Expected output: zero matches. Each remaining match must be removed.

- [ ] **Step 2: Run full verification**

Run: `npx vitest run`
Run: `npx tsc --noEmit`
Run: `npx playwright test e2e/highlighter e2e/tags`

All three: PASS.

- [ ] **Step 3: Commit (if anything changed in Step 1)**

```bash
git add -u
git commit -m "chore(highlighter): remove stale tech-highlight identifiers"
```

If nothing changed, skip the commit.

---

## Verification (end-to-end manual check)

1. `npm run dev`
2. Open a workspace with mixed elements — at least one of each: a tagged element, a Live + Deprecated mix, two technology values, and two distinct owners.
3. **Empty state:** no facets active → all nodes render at full opacity, no rails.
4. **Single facet:** toggle a tag → matching nodes get the rail; non-matches stay full opacity.
5. **AND stacking:** add a status, then a tech, then a team. After each, the set of highlighted nodes shrinks (or stays the same), never grows. Hover any highlighted node — under-node label shows the most-specific reason (tech > tag > team > status).
6. **Stale filter:** switch to a view that has no element with the active status → highlighter bar's Status pill shows `1 (0)` and is muted; canvas has no highlighted rings; nothing is dimmed.
7. **Inspector:** select a node, toggle facet chips — inspector stays open.
8. **Collapse:** narrow the window until auto-collapse fires; expand manually by clicking the pill. Toggle the chevron; reload; collapsed state persists.
9. **Clear:** with multiple facets active, click `× Clear` in the bar — all four facets reset; bar returns to empty state.

If every step holds, the redesign is shipped.
