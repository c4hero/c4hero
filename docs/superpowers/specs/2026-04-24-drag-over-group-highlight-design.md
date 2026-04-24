# Drag-over-group highlight — design

**Status:** Draft for review
**Date:** 2026-04-24
**Scope:** Interactive feedback when a node is dragged over a group it is not a member of, and a persistent visual warning when a non-member node ends up overlapping a group's rectangle.

## Problem

Groups in c4hero are rendered as derived overlay rectangles that hug their members' bounds (`src/components/canvas/Canvas.tsx:199` `buildGroupNodes`). An element is "in" a group only if its id is listed in `group.elementIds`. Because the rectangle is derived from positions, a non-member node that happens to be positioned inside the rectangle looks visually indistinguishable from a member — the group appears to contain it. There is also no drag affordance for *joining* a group; membership is only editable via the right-panel "Add member" list (`src/components/layout/right-panel/GroupProperties.tsx`).

Two gaps to close:

1. Dragging a node over a group should offer a drop-to-join interaction.
2. When a non-member node is positioned overlapping a group without joining it, the canvas should visually flag the ambiguity so the user isn't misled about membership.

## Goals

- Make it possible to add a node to a group by dragging it over that group's rectangle.
- Enforce strict Structurizr grouping rules (exclusivity + parent-scope homogeneity) at the drag layer so invalid drops are rejected with visible feedback.
- When a drop would be allowed and the element is currently groupless, commit silently; rely on the existing undo stack for reversibility.
- When a drop would change group membership (element already in some other group), require an explicit modal confirmation.
- When a non-member node visually overlaps a group rectangle without being a member, surface a persistent amber warning on the group rectangle.

## Non-goals

- No global toast system. The silent-add path uses a small, transient 1.2s inline label anchored to the joined node, rendered by a new `<TransientInlineLabel>` that reads `store.lastSilentJoin = { elementId, groupName, at }` and auto-hides after 1.2s. Undo is the existing Ctrl+Z.
- No group creation via drag (e.g., dragging A onto B to make a new group). Out of scope.
- No change to the DSL serializer. See Follow-ups.

## Visual direction (selected: A — accent glow + confirm pill)

Three drag states are expressed on the target group rectangle plus an optional pill near the dragged node:

| State | Group rectangle | Pill near dragged node |
|---|---|---|
| Hover — allowed | Solid accent border + inner accent tint | `+ Add to group` on solid accent bg |
| Hover — disallowed | Muted dashed gray border, reduced-opacity members | `⊘ Out of scope` / `⊘ Move not allowed` on neutral bg |
| Hover — already member | Unchanged (no glow) | `Already in <GroupName>` in muted gray |

One static state, independent of drag:

| State | Group rectangle | Other |
|---|---|---|
| Static — overlap, not joined | Amber dashed border (`#d4a84a`), no fill change | `⚠` badge next to the group label |

Accent color reuses `var(--color-accent)` (the existing selected-group treatment in `GroupNode.tsx:21` uses dashed accent; hover upgrades to solid + tint). Amber does not collide with the red used for destructive actions.

## Architecture

Three coordinated pieces layered over React Flow's existing drag lifecycle:

1. **`useDragOverGroup` hook** (`src/hooks/useDragOverGroup.ts`) — wraps Canvas's `onNodeDragStart` / `onNodeDrag` / `onNodeDragStop` handlers, hit-tests the dragged node's bounds against group content-rectangles each animation frame, and writes `dragHover: { groupId, allowed, reason } | null` into the workspace store.
2. **Group validation module** (`src/lib/groupMembership.ts`) — pure functions that centralize the Structurizr rules so drag, right-panel add, and any future entry point agree. No React dependencies.
3. **Overlay state in the store** — a transient slice (`dragHover`, `pendingJoinGroup`, `staticOverlaps`) that `GroupNode` and the new `DragConfirmPill` subscribe to. Re-renders are scoped to these two consumers.

### Data flow

```
Canvas drag events
  → useDragOverGroup hook
      → groupMembership.findHoveredGroup + canJoinGroup
      → store.setDragHover(...)
          → GroupNode re-renders with hover state
          → DragConfirmPill renders at cursor

onNodeDragStop
  → if allowed && element has no current group   → commit silently (+ 1.2s inline label)
  → if allowed && element in another group       → store.requestJoinGroup(...)
                                                    → JoinGroupDialog appears
  → if disallowed or no hover                    → position commits as-is
                                                    → findStaticOverlaps recomputes
                                                    → GroupNode picks up static-warning for any group now overlapped by a non-member
```

## Components and files

### New files

- `src/lib/groupMembership.ts`
  - `canJoinGroup(workspace, element, group) → { allowed: boolean; mode?: 'add' | 'move'; reason?: 'already-member' | 'out-of-scope' | 'in-other-group' }`
  - `parentScopeOf(workspace, elementId) → { kind: 'root' } | { kind: 'system'; id } | { kind: 'container'; id }`
  - `scopesEqual(a, b) → boolean`
  - `overlapsGroup(nodeRect, groupContentRect) → boolean` — AABB intersection, group-content-rect excludes the 52px label band.
  - `findHoveredGroup(nodeRect, groupRects[]) → groupId | null` — innermost-wins for nested rects.
  - `findStaticOverlaps(nodes, groups) → Map<elementId, groupId>` — for each non-member node, the innermost group it overlaps.
- `src/hooks/useDragOverGroup.ts` — composes with Canvas's existing handlers. Throttles hit-tests to one per `requestAnimationFrame`. Returns wrapper handlers.
- `src/components/canvas/DragConfirmPill.tsx` — screen-space pill positioned via `reactFlowInstance.flowToScreenPosition`. Reads `dragHover` + `pendingJoinGroup` from the store to pick copy.
- `src/components/shared/JoinGroupDialog.tsx` — modal for the move-between-groups case. Mirrors the `pendingDelete` → dialog wiring (same render location, same render-only-when-set pattern).

### Modified files

- `src/components/canvas/nodes/GroupNode.tsx` — accept `data.hoverState: 'idle' | 'hover-allowed' | 'hover-disallowed' | 'already-member' | 'static-warning'`. Styles keyed off that state, using existing CSS variables.
- `src/components/canvas/Canvas.tsx` — compose the new hook's returned handlers into existing `onNodeDragStart/Drag/Stop`. Pass `hoverState` into the group node's `data` from `buildGroupNodes` by looking up both `dragHover.groupId` and `staticOverlaps`.
- `src/store/workspace.ts` — add:
  - `dragHover: { groupId: string; allowed: boolean; reason?: string } | null`
  - `pendingJoinGroup: { elementId: string; fromGroupId?: string; toGroupId: string } | null`
  - `staticOverlaps: Record<elementId, groupId>` (derived, recomputed on any position change)
  - `lastSilentJoin: { elementId: string; groupName: string; at: number } | null` (for the 1.2s inline "Added to *GroupName*" label)
  - Actions: `setDragHover`, `clearDragHover`, `requestJoinGroup`, `confirmJoinGroup`, `cancelJoinGroup`, `joinGroupSilent`
  - Clear `pendingJoinGroup` on workspace load / view change (mirror existing `pendingDelete` resets).
- Root render tree (wherever `pendingDelete` is rendered today) — add `<JoinGroupDialog />`.

## The rule: `canJoinGroup` (strict Structurizr)

```ts
canJoinGroup(ws, element, group):
  if group.elementIds.includes(element.id)
    → { allowed: false, reason: 'already-member' }

  const currentGroup = ws.model.groups.find(g => g.elementIds.includes(element.id))
  if currentGroup && currentGroup.id !== group.id:
    // Element is in another group. Drop is allowed but requires modal confirm.
    const groupScope = parentScopeOf(ws, group.elementIds[0])  // guaranteed non-empty here
    const elementScope = parentScopeOf(ws, element.id)
    if !scopesEqual(groupScope, elementScope)
      → { allowed: false, reason: 'out-of-scope' }
    return { allowed: true, mode: 'move' }

  // Element is groupless: check scope.
  if group.elementIds.length === 0:
    return { allowed: true, mode: 'add' }  // empty group takes element's scope

  const groupScope = parentScopeOf(ws, group.elementIds[0])
  const elementScope = parentScopeOf(ws, element.id)
  if !scopesEqual(groupScope, elementScope)
    → { allowed: false, reason: 'out-of-scope' }

  return { allowed: true, mode: 'add' }

parentScopeOf(ws, id):
  person               → { kind: 'root' }
  softwareSystem       → { kind: 'root' }
  container (of S)     → { kind: 'system',    id: S.id }
  component (of C)     → { kind: 'container', id: C.id }
```

### Rule rationale

Structurizr DSL nests a `group` block inside its parent scope: the model root holds `person` + `softwareSystem` groups; a `softwareSystem` block holds container groups; a `container` block holds component groups. All members of a single group therefore share one parent scope. Enforcing that at the drag layer keeps the UI aligned with what a valid Structurizr export would be.

Cross-type grouping *within* a scope is permitted (person + softwareSystem in one root-level group is legal Structurizr). Cross-scope grouping is not (container + component, or containers from two different systems).

## Drop handling branches

| Scenario | Behavior on drop |
|---|---|
| Hovering allowed group, element is groupless | `joinGroupSilent(elementId, groupId)`; node snaps into place; 1.2s inline "Added to *GroupName*" label near the node; undo via Ctrl+Z. |
| Hovering allowed group, element is in another group | `requestJoinGroup(...)`; modal appears: "Move *NodeName* from *OldGroup* to *NewGroup*?" Confirm commits the move; Cancel reverts node position to drag-start. |
| Hovering disallowed group (out-of-scope / already-member) | Position commits as a reposition; no membership change. `findStaticOverlaps` recomputes; if the element now overlaps a group it is not in, that group renders `static-warning`. |
| No group hovered | Plain reposition. Static overlaps recompute. |

## Edge cases

- **Nested groups.** `findHoveredGroup` and `findStaticOverlaps` pick the innermost (smallest-area) hit.
- **Multi-select drag.** Hit-test and validate per node. Pill shows `+ Add N to group` when all allowed, or `⊘ N of M not allowed` when mixed. On drop with mixed validity, nothing commits; the pill flashes "Cannot drop — mixed scopes" for 1s before clearing.
- **Drop cancelled (Esc).** React Flow cancels drag; hook clears `dragHover`; no commit.
- **View change while modal open.** `pendingJoinGroup` is cleared on `activeViewKey` change (mirror `pendingDelete`).
- **Group drops below two members.** Already handled — `buildGroupNodes` skips groups with fewer than two members.
- **Empty group.** First valid drop sets its scope. Allowed unconditionally.
- **Dragged node is itself a member of the hovered group.** Pill shows "Already in *GroupName*"; no commit beyond reposition.
- **Group header band.** Hit-testing excludes the 52px label area so dragging through the header doesn't flash a hover state.

## Testing plan

### Unit — `src/lib/groupMembership.test.ts` (new)

- `canJoinGroup` matrix:
  - Already-member → `{ allowed: false, reason: 'already-member' }`
  - Groupless + matching scope → `{ allowed: true, mode: 'add' }`
  - In other group + matching scope → `{ allowed: true, mode: 'move' }`
  - In other group + mismatched scope → `{ allowed: false, reason: 'out-of-scope' }`
  - Person into container-level group → out-of-scope
  - Container of System X into group of System Y's containers → out-of-scope
  - Component into container group → out-of-scope
  - Empty group accepts any single element → allowed
- `overlapsGroup`: full containment, edge touch, non-overlap, label-band exclusion.
- `findHoveredGroup`: single hit, no hit, nested groups (innermost wins), ties broken by last-rendered.
- `findStaticOverlaps`: returns only non-members; skips already-members; handles nested groups.

### Unit — `src/store/workspace.test.ts` (extend)

- `requestJoinGroup` sets `pendingJoinGroup` and does not mutate membership.
- `confirmJoinGroup` removes from `fromGroupId`, adds to `toGroupId`, pushes to undo stack.
- `cancelJoinGroup` clears `pendingJoinGroup` only.
- `joinGroupSilent` adds to group, no `pendingJoinGroup`, pushes to undo stack.
- `pendingJoinGroup` is cleared on `activeViewKey` change and on workspace load.

### Unit — `src/hooks/useDragOverGroup.test.ts` (new)

- Drag enters an allowed group → `setDragHover({ groupId, allowed: true })` fires once.
- Drag crosses from group A to group B → two calls, last one with B.
- Drag exits all groups → `clearDragHover` called.
- Drag enters disallowed group → `setDragHover({ allowed: false, reason })`.
- Hit-tests throttle to one per frame.

### Component — `GroupNode.test.tsx` (extend)

- Renders each of the five `hoverState` values with the expected border/fill combination.

### Component — `DragConfirmPill.test.tsx` (new)

- Shows `+ Add to group` for `{ allowed: true, mode: 'add' }`.
- Shows `Move to <name>` for `{ allowed: true, mode: 'move' }`.
- Shows `⊘ Out of scope` for `{ allowed: false, reason: 'out-of-scope' }`.
- Shows `Already in <name>` for `already-member`.
- Shows `+ Add N to group` in multi-select all-allowed.
- Shows `⊘ K of N not allowed` in multi-select mixed, and flashes `Cannot drop — mixed scopes` for ~1s after a mixed drop.

### Component — `JoinGroupDialog.test.tsx` (new)

- Renders only when `pendingJoinGroup` is set.
- Confirm invokes `confirmJoinGroup`; cancel invokes `cancelJoinGroup`.
- Dismissed when `activeViewKey` changes mid-flow.

### E2E — `e2e/group-drag-join.spec.ts` (new)

1. **Silent add.** Drag a groupless container onto an allowed group. Verify pill appears; release. Verify inline "Added to X" label appears and fades. Verify DSL export now contains the container inside the group block.
2. **Move with confirm.** Drag a container from group A onto group B in the same system. Verify pill shows "Move to B"; release. Verify modal appears with correct copy. Confirm. Verify membership moved; undo restores.
3. **Cross-scope reject.** Drag a container onto a group whose members are components. Verify pill shows `⊘ Out of scope`; release. Verify no membership change.
4. **Static overlap.** Position a non-member node inside a group programmatically (store action), re-render. Verify the group renders amber dashed border and `⚠` badge.
5. **Esc-cancel mid-drag.** Start a drag, hit Esc. Verify no commit and `dragHover` clears.

## Follow-ups (out of scope)

- **DSL serializer: emit groups inside their parent scope.** Today `src/lib/dsl/serializer.ts:189` emits every group at the model root. With scope homogeneity enforced in the UI, groups will hold only elements of a single scope, and a Structurizr-valid export must nest them accordingly. Tracked separately in `2026-04-24-dsl-nested-groups-story.md`.
- **Global toast system.** Deliberately not introduced. Revisit if two or more features need it.
- **Drag-to-create-a-group.** Potential future feature building on this infrastructure.
- **Static-overlap detection on existing workspaces.** First run after this feature ships may amber-flag legitimate-looking layouts that predate the change. Accepted; treatment is a nudge, not an error.
