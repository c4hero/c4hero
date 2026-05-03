# Spotlight Redesign — Cohesive Highlight-First Filtering

## Context

The bottom-strip "spotlight" was grown facet-by-facet (Tags first, then Status, then Tech) and the three facets disagree on almost everything that matters: **selection cardinality** (Tags/Status are single-select, Tech is multi-select), **visual semantic** (Tags/Status hard-dim non-matches to 0.18 opacity, Tech adds an accent rail/glow without dimming), and **visibility** (the top-level mode tabs hide the other facets, so a stale Status filter from another view can black out the canvas while the user is staring at the Tech tab).

The user's primary use case is **highlight in context**, not focus/hide. They want all four facets — Tags, Status, Tech, and Teams (new) — to behave like one feature with one mental model: stack any combination, and the things that match every active facet "pop" against the rest of the diagram, which stays fully readable.

**Decisions locked in by the user during brainstorming:**
- **Highlight, not focus.** Non-matches stay legible.
- **Stackable AND across facets.** A node pops only if it matches every lit facet.
- **Drop the mode tabs.** All facets visible inline.
- **Within-facet semantics differ:** Tags/Status/Teams are OR (multi-select), Tech is AND (multi-select).
- **Teams** is a new facet sourced from existing `element.owner`.

## Goal

Replace the mode-tab spotlight with a single inline row of four facet controls (Tags, Status, Tech, Teams) that share one selection model, one highlight semantic, and one visual treatment. Eliminate the dim-everything-else behavior.

## Critical files

- `src/components/layout/FloatingBottomStrip.tsx` — primary rewrite
- `src/store/workspace.ts` — filter state (`activeTagFilter`, `activeStatusFilter`, `activeTechFilter`) + new `activeTeamFilter`
- `src/components/canvas/Canvas.tsx` — `buildNodes` / `buildEdges` highlight logic
- `src/components/canvas/nodes/BaseC4Node.tsx` — under-node label generalization
- `src/components/canvas/edges/RelationshipEdge.tsx` — edge highlight already wired via `data.techHighlighted`; rename concept
- `src/index.css` — `.c4-tech-marquee`, `.c4-edge-tech-highlight`, `.c4-node-tag-label`
- `src/components/layout/FloatingInspector.tsx` — outside-click exemption
- Tests: `src/store/workspace.test.ts`, `e2e/tags/tag-filtering.spec.ts`

## Design

### 1. State model

Generalize the filter state from three ad-hoc fields into a per-facet model. Keep field names where they exist for diff size, add the new one.

```ts
// store/workspace.ts
activeTagFilter: string[]       // CHANGE: was string | null. OR-multi.
activeStatusFilter: ElementStatus[]  // CHANGE: was ElementStatus | null. OR-multi.
activeTechFilter: string[]      // unchanged. AND-multi.
activeTeamFilter: string[]      // NEW. OR-multi over element.owner.
```

Setters become idempotent multi-select helpers (mirroring `toggleActiveTechFilter`):
- `toggleTagFilter(tag)`, `toggleStatusFilter(status)`, `toggleTechFilter(tech)`, `toggleTeamFilter(team)`
- `setTagFilter(tags[])`, `setStatusFilter(statuses[])`, `setTechFilter(techs[])`, `setTeamFilter(teams[])`
- `clearAllFilters()` — single-shot for an "× clear" button on the strip.

Existing single-select call sites (a few in `workspace.ts:1441` etc. for tag rename/remove) need to migrate to array semantics.

### 2. Match semantics — single helper

One pure function in a new `src/lib/spotlight.ts`:

```ts
export interface SpotlightFilters {
  tags: string[]; statuses: ElementStatus[]; techs: string[]; teams: string[]
}
export function isSpotlit(el: ModelElement, f: SpotlightFilters): boolean
export function isSpotlitRel(rel: Relationship, f: SpotlightFilters): boolean
export function spotlightActive(f: SpotlightFilters): boolean
```

Rules:
- If no facet has any value, `spotlightActive` returns false → nothing is highlighted, nothing is dimmed.
- Otherwise AND across facets, with each facet's within-semantic:
  - **Tags:** OR — element has *any* selected tag.
  - **Status:** OR — element status equals *any* selected status.
  - **Tech:** AND — element technology contains *all* selected techs (current behavior).
  - **Teams:** OR — `element.owner` equals *any* selected team.
- Relationships participate via Tech only (matches today). Tags/Status/Teams don't apply to relationships in the current model — leave them out, document the asymmetry.

`Canvas.buildNodes` / `buildEdges` collapse into: compute `highlighted = spotlightActive(f) && isSpotlit(el, f)`. Pass `highlighted: boolean` on `node.data` / `edge.data`.

### 3. Visual treatment — drop the dim

- **Highlight ON, node matches:** existing `c4-tech-marquee` rail + `c4-node-tech-highlight` outer glow. Rename CSS class to `c4-node-spotlit` / `c4-edge-spotlit` (keep the visual; rename to reflect generalized purpose).
- **Highlight ON, node does not match:** **no** opacity change, **no** dim. Just absence of the spotlit ring. This is the central UX shift.
- **Highlight OFF (no facets active):** every node renders normally.
- Remove `style: { opacity: 0.18 }` from `Canvas.buildNodes` (line 231 today). Remove the `dimmed` data prop and the unused styling that depends on it.
- Edge: same treatment via `c4-edge-spotlit` (rename of `c4-edge-tech-highlight`).

### 4. Under-node label

Current `c4-node-tag-label` shows the active tag under matching nodes. Generalize: when a node is spotlit and there's a single most-specific reason, render it under the node. Priority: tech > tag > team > status. If multiple reasons tie, show the count (`+2`) — keep it small.

This is optional polish; cut if it adds friction. Default: keep tag-only behavior, evolve later.

### 5. Bottom strip layout

Single row, no mode tabs. All four facet buttons inline:

```
[Tags ▾ <chips>]  [Status ▾ <chips>]  [Tech ▾ <chips>]  [Team ▾ <chips>]   [✕ Clear]   [⌃ collapse]
```

**Collapse / expand.** With four facets each showing inline chips, the strip can grow wide. Two behaviors handle that:

1. **Manual collapse** — a chevron toggle (`⌃` / `⌄`) on the right collapses the strip to a single compact pill: `[● ● ● ●  3 filters active ▾]`. Each dot is colored to indicate which facets have selections (lit = has values, muted = empty). Clicking the pill (or the chevron) re-expands. Collapsed state is local UI state, persisted to `localStorage` key `c4hero:spotlight-collapsed` so it survives reloads but isn't part of the workspace.
2. **Auto-collapse on overflow** — when the expanded strip would exceed the viewport width minus safe margins, it auto-collapses to the same compact pill until the user expands. Hovering or focusing the pill shows a tooltip listing active filters per facet. (Implementation: ResizeObserver on the strip's content vs. its container.)

When collapsed and a facet is opened from the popover (e.g. the user clicks the pill, then a facet chevron in the expanded popover), the popover behaves the same as in expanded mode. So the collapsed pill is purely a presentation switch — it doesn't change selection semantics.

Each facet is rendered by **one** generic `<FacetControl>` component, parameterized by:
- Label, icon
- Source list (`viewTags`, `viewStatuses`, `viewTechs`, `viewTeams` — derived from current view's elements)
- Selected list + setter
- Within-facet semantic indicator (small `AND` / `ANY` hint in the popover header)
- Optional color resolver (Status/Tag chips show their accent color)

The popover reuses the existing `TechFilterControls` flip-and-anchor + sticky-selected + search pattern (`FloatingBottomStrip.tsx:567-752`). Extract that popover into the shared `<FacetControl>` so all four facets behave identically.

When a facet has no values in the current view, the trigger renders disabled with a tooltip ("No teams in this view"). Selected values from another view that don't exist here remain in state but show as a muted "(0)" count next to the facet button — they're not silently honored, they're not silently dropped.

The "auto-suppress when nothing matches" no-op behavior we already shipped in `Canvas.buildNodes` stays. The strip just makes it visible.

### 6. Inspector outside-click

Mark the bottom strip's outermost glass panel with `data-canvas-chrome="bottom-spotlight"` and update `FloatingInspector.tsx:32` to also exempt `[data-canvas-chrome]` from the outside-click clear. Clicking a facet chip stops closing the inspector.

### 7. Persistence

Filters remain session-only, global across views. No per-view storage. Auto-clear on workspace load already exists (`workspace.ts:374-376`) — extend to clear `activeTeamFilter` too.

### 8. Migration / removal

- Replace `c4-edge-tech-highlight` and `c4-tech-marquee` selectors with `c4-edge-spotlit` and `c4-node-spotlit` everywhere.
- Remove `data.dimmed` and `data.techHighlighted` from node data; replace with `data.spotlit`.
- Remove the now-dead "mode" local state from `FloatingBottomStrip.tsx`.

## Implementation order

1. Add `activeTeamFilter` + multi-select setters in store; keep old single-select setters as aliases that delegate to multi-set, then remove call sites in a follow-up commit.
2. Land `src/lib/spotlight.ts` with the match helpers + a unit test file.
3. Rewrite `Canvas.buildNodes` / `buildEdges` to use the helper. Drop opacity dim. Rename CSS classes.
4. Extract `<FacetControl>` from `TechFilterControls`. Replace the three current mode-specific renderers with four `<FacetControl>` instances.
5. Mark the strip with `data-canvas-chrome`; update inspector exemption.
6. Update `BaseC4Node` under-node label to read from `data.spotlit` + reason. Keep tag-priority default.
7. Migrate tests: existing tag e2e (`e2e/tags/tag-filtering.spec.ts`) must keep working with multi-select (a single tag toggle is still legal). Add e2e for status + tech + team multi-stack.

## Verification

- **Unit:** new `spotlight.test.ts` covers AND-across, OR-within (tags/status/teams), AND-within (tech), empty filters, missing-owner element.
- **Integration:** `workspace.test.ts` migrated — single-select setters delegate correctly; load clears all four filters.
- **E2E:**
  - Apply a tag, status, and tech together; only nodes matching all three show the spotlit rail.
  - Apply a status that no element in the current view has → no nodes dim, status chip shows `(0)`.
  - Click a facet chip with the inspector open → inspector stays open.
  - Switch views with filters set → carryover filters auto-suppress where they don't apply.
  - Resize the window narrow enough that the strip would overflow → strip auto-collapses to the compact pill; expand restores chips.
  - Manual collapse via the chevron persists across reload (localStorage).
- **Manual smoke:** open the dev server (`npm run dev`), open a workspace with mixed status/tech/owner, exercise every facet popover and confirm the diagram never goes "everything dim."
