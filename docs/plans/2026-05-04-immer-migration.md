# Immer Migration Plan — workspace store

> **Status:** Drafted 2026-05-04. Branch: `feat/immer-store-migration` (already created, no commits beyond `main`).
>
> **Self-contained plan for a fresh agent session.** Read top to bottom before touching code.

## Goal

Replace the per-mutation `structuredClone` in the workspace store with structural sharing (Immer middleware), so that:

1. Mutations don't deep-clone the entire workspace (currently O(workspace) per keystroke).
2. Sub-trees that didn't change keep their identity, enabling narrow Zustand selectors with `useShallow` to actually skip re-renders.

This is the only way to move the audit's Performance score from **6/10 → 8+/10** and unblock the broader 9.0 composite ceiling.

## Why this is risky

Same store has been audited at 8/10 maintainability. The migration touches **47 actions** in `src/store/workspace.ts`. A previous attempt in the calling session broke **279 tests** and was reverted. The failure mode is documented below — read it before starting.

## Pre-flight checklist

```bash
git checkout feat/immer-store-migration
git status                      # MUST be clean
git log main..HEAD --oneline    # MUST be empty (branch is at main)
npx tsc -b --force              # MUST pass before any change
npx vitest run                  # MUST report 966/966 passing
```

If any of these fail, stop and reset before proceeding.

## The previous failure mode (read this first)

In the prior session, the agent ran:

```ts
import { immer } from 'zustand/middleware/immer'
export const useWorkspaceStore = create<WorkspaceState>()(immer((set, get) => ({ ...same actions })))
```

279 tests failed. Sample errors:
- `expected "spy" to be called 1 times, but got 0 times`
- `expected { id: 'rel1', sourceId: 'alice', …(4) } to match object { technology: 'gRPC', …(1) }`
- `expected undefined to be 'Asynchronous'`

Root cause hypothesis (must be verified before relying on): **The `cloneWs(s)` helper in `workspace.ts` calls `structuredClone(s.workspace)`. With Immer middleware active, `s.workspace` is an Immer draft Proxy. `structuredClone` of a draft produces a detached plain object, not a draft.** Subsequent mutations to that plain object never reach the draft. The action then returns `{ workspace: ws, ...other }`, which Immer treats as "you returned new state" — but Immer's set with returned state **replaces** the state, not merges, so other fields like `selectedElementIds` may have been clobbered or left unchanged depending on the action.

This means the migration **cannot be done as a no-op middleware addition**. Every action that uses `cloneWs(s)` must be converted to one of:

- **Draft-mutation style:** drop `cloneWs`, mutate `s.workspace` directly, don't return.
- **Explicit replace:** keep producing a new workspace via plain JS spread (manual structural sharing) and return `{ workspace: newWs, ...allOtherFields }`.

The cleaner path is draft-mutation. That's what this plan executes.

## High-level strategy

**Incremental, action-by-action, one commit per batch, test after each.** Do not migrate all 47 actions in a single change. Do not attempt a "no-op middleware" intermediate state — there isn't one.

### Phase order (each phase = one or more commits)

1. **Phase 0:** Install dep + add middleware + convert internal helpers (`cloneWs`, `pushUndo`).
2. **Phase 1:** Convert simple state-only actions (no workspace mutation).
3. **Phase 2:** Convert workspace meta + lifecycle actions (`loadWorkspace`, `closeWorkspace`, `updateWorkspaceMeta`, `setActiveView`, navigation).
4. **Phase 3:** Convert selection actions (no workspace mutation, but several fields).
5. **Phase 4:** Convert element CRUD (`addPerson`, `addSoftwareSystem`, `addContainer`, `addComponent`, `updateElement`, `updateElementLive`, `updateElementTechnology`, `deleteElement`, `deleteElements`, `duplicateElements`).
6. **Phase 5:** Convert group CRUD.
7. **Phase 6:** Convert relationship CRUD.
8. **Phase 7:** Convert view management (add/remove/duplicate/rename views, view body actions).
9. **Phase 8:** Convert view-element management (`toggleElementInView`, `addToCurrentView`, `removeFromView`, position updates, etc.).
10. **Phase 9:** Convert tag/style/filter actions.
11. **Phase 10:** Convert undo/redo (most subtle — do last).
12. **Phase 11:** Cleanup — remove `cloneWs`/`cloneWorkspace` callsites; mark them deprecated; rip them out once all tests still pass.
13. **Phase 12:** Add narrow `useShallow` selectors for the 17 broad workspace subscriptions (separate from this plan, but the foundation is laid).

### After each phase

```bash
npx tsc -b --force
npx vitest run                  # MUST be 966/966
git add -A && git commit -m "phase N: <what changed>"
```

If a phase fails:
1. Read the failures carefully — most will be expected from the migration shape change.
2. Fix the obvious cases (e.g., draft.x = y instead of return { x: y }).
3. If failures don't clear in 15 minutes, **stop and revert this phase's changes** (`git reset --hard HEAD`). Move on to the next phase. Come back later. Do not let one stuck phase block the rest.

## Conversion patterns — reference

### Pattern A: state-only setter (Phase 1)

```ts
// Before
selectElements: (ids) => set((s) => ({ selectedElementIds: ids, selectedRelationshipId: null, selectedGroupId: null })),

// After
selectElements: (ids) => set((s) => {
  s.selectedElementIds = ids
  s.selectedRelationshipId = null
  s.selectedGroupId = null
}),
```

### Pattern B: workspace mutation with undo (Phase 4+)

```ts
// Before
addSoftwareSystem: (name, position, location) => {
  const id = nanoid(8)
  set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const system: SoftwareSystem = { id, ... }
    ws.model.softwareSystems.push(system)
    addToCurrentView(ws, s.activeViewKey, id, position)
    for (const v of ws.views.systemLandscapeViews) {
      if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) v.elements.push({ id })
    }
    return { ...pushUndo(s), workspace: ws, focusElementId: id, selectedElementIds: [id], selectedRelationshipId: null, selectedGroupId: null }
  })
  get().revalidateScope()
  announce('System created')
  return id
},

// After
addSoftwareSystem: (name, position, location) => {
  const id = nanoid(8)
  set((s) => {
    if (!s.workspace) return
    pushUndoIntoDraft(s)              // see Phase 0 — mutates undoStack on the draft
    const system: SoftwareSystem = { id, ... }
    s.workspace.model.softwareSystems.push(system)
    addToCurrentView(s.workspace, s.activeViewKey, id, position)
    for (const v of s.workspace.views.systemLandscapeViews) {
      if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) v.elements.push({ id })
    }
    s.focusElementId = id
    s.selectedElementIds = [id]
    s.selectedRelationshipId = null
    s.selectedGroupId = null
  })
  get().revalidateScope()
  announce('System created')
  return id
},
```

### Pattern C: workspace mutation without undo (Phase 4 — `updateElementLive`)

```ts
// Before
updateElementLive: (id, patch) => set((s) => {
  if (!s.workspace) return s
  const ws = { ...s.workspace, model: structuredClone(s.workspace.model) }
  if (!applyElementPatch(ws, id, patch)) return s
  return { workspace: ws }
}),

// After
updateElementLive: (id, patch) => set((s) => {
  if (!s.workspace) return
  applyElementPatch(s.workspace, id, patch)   // mutates the draft directly
  // No-op guard: applyElementPatch returns false if nothing changed.
  // Immer auto-detects no-op mutations and skips state replacement, so we
  // don't need to early-return.
}),
```

⚠ `applyElementPatch` is in `src/store/workspace-helpers.ts`. It mutates the workspace passed in. **Verify it works correctly when given an Immer draft** — most operations should, since drafts implement standard Array/Map/object mutation traps. If anything inside reads + writes the same field within a transaction, double-check.

### Phase 0: cloneWs and pushUndo

`cloneWs` becomes a no-op (or removed entirely once all callsites are gone). During the migration, leave `cloneWs` exported but make it return `s.workspace` (the draft) so any unconverted action's `const ws = cloneWs(s); ws.foo = bar` still works against the draft.

```ts
// In workspace.ts during the migration
function cloneWs(s: WorkspaceState): Workspace | null {
  // During Immer migration: return the draft directly. The historical
  // structuredClone behavior is no longer needed because Immer gives us
  // structural sharing for free. Will be removed in Phase 11.
  return s.workspace
}
```

`pushUndo` currently returns `Partial<UndoState>` for spread merging. With Immer, it should mutate:

```ts
// Before
function pushUndo(s: WorkspaceState): Partial<UndoState> {
  if (!s.workspace) return {}
  const undoStack = [...s.undoStack, s.workspace].slice(-MAX_UNDO)
  return { undoStack, redoStack: [] }
}

// After
function pushUndoIntoDraft(s: WorkspaceState): void {
  if (!s.workspace) return
  // Snapshot the current workspace before any mutations in this set() run.
  // s.workspace is the Immer draft; current() unwraps it to a finalized snapshot.
  s.undoStack = [...s.undoStack, current(s.workspace)].slice(-MAX_UNDO)
  s.redoStack = []
}
```

**Critical:** `current(draft)` from Immer (`import { current } from 'immer'`) returns a finalized snapshot of the draft at this point — *before* the action's mutations are applied. That's what undo wants. **Test this carefully in Phase 10 (undo/redo)**: undo→edit→redo must restore the correct state.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `applyElementPatch` (in workspace-helpers) doesn't work on drafts | Test it explicitly in Phase 4. If broken, refactor to take an Immer producer or to do its work via shallow mutations only. |
| `current(draft)` semantics differ from `structuredClone` for undo snapshots | Test undo/redo first thing in Phase 10. Compare a redo'd state against an explicitly-saved structuredClone snapshot. |
| Tests use `JSON.parse(JSON.stringify(...))` or `structuredClone` on workspace and rely on mutability | Grep before starting: `grep -rn "structuredClone\|JSON.parse(JSON.stringify" src/`. Audit each hit. |
| `useEffect`s elsewhere in the codebase rely on the workspace ref changing on every mutation | Grep: `grep -rn "useEffect.*\\[.*workspace" src/`. Audit each. Many will be fine because they read primitive fields, not the workspace ref itself. |
| Immer freezes finalized state; tests may try to mutate | If a test does `const ws = store.getState().workspace; ws.foo = ...`, it'll throw in strict mode. Either fix the test or set `setAutoFreeze(false)` early in the test setup. Prefer fixing tests. |
| `revalidateScope`, `announce`, side effects after `set` | These run after set returns. They read `get().workspace` which is now the post-mutation state. Should work unchanged. Verify in Phase 4. |

## Verification gates

After **every** phase:

```bash
npx tsc -b --force                  # types clean
npx vitest run                      # 966/966 unit tests pass
```

After **Phase 4** (element CRUD), **Phase 7** (view management), and **Phase 10** (undo/redo):

```bash
npx playwright test e2e/welcome/ e2e/keyboard/ e2e/scenarios/ e2e/canvas/ e2e/search/
```

After **Phase 11** (cloneWs removal):

```bash
npx playwright test    # full e2e
```

If full e2e passes after Phase 11, the migration is **done**. Phase 12 (selector narrowing) is a follow-up branch.

## Rollback strategy

Each phase = one commit. If a phase introduces a bug that surfaces only later:

1. **Same-session rollback:** `git revert <phase-commit-sha>` and continue.
2. **Branch-level rollback:** `git reset --hard main` to discard all migration work and start over with lessons learned.
3. **Don't cherry-pick partial phases back** — the conversions are coupled within each phase. Either the whole phase is in or it's out.

## Definition of done

The migration is complete when:

- [ ] All 47 actions in `workspace.ts` are converted to draft-mutation style or explicit return-replace.
- [ ] `cloneWs` is deleted from `workspace.ts` and `cloneWorkspace` is deleted from `workspace-helpers.ts` (or kept only for `loadWorkspace` deep-copy semantics, with a comment).
- [ ] `pushUndo` mutates the draft via `current()` rather than returning partial state.
- [ ] `npx vitest run` reports 966/966.
- [ ] Full Playwright e2e suite passes.
- [ ] Production `npx vite build` succeeds.
- [ ] One smoke benchmark before/after, captured in the merge PR description: load a sample workspace, type a 20-character rename in the inspector, observe React DevTools profiler. Before-state: ~10–15 components re-render per keystroke. After-state goal: ~3–5 (the inspector itself + immediate parents).

## What this plan does NOT cover

- Selector narrowing (Phase 12 above; separate branch).
- The `workspace.ts` decomposition into per-domain action slices that the audit also wants. **Doing that BEFORE this migration would be cleaner** (each slice file becomes its own conversion target), but is independent. A future agent may decide to reorder. If decomposition lands first, this plan still works — just edit the file paths in each Phase.

## Notes for the implementing agent

- The previous attempt failed in 30 minutes because the entire surface was changed at once. **Do not repeat this.** One phase at a time. One commit per batch within a phase.
- The user has explicitly authorized this work on `feat/immer-store-migration`. Auto mode is on.
- Take your time. The user prefers a careful, well-tested migration over a fast one.
- If you discover a phase that's larger than expected, split it. There's no prize for matching the phase numbering above — only for landing each step green.
- Tag a draft PR after Phase 4 lands so the user can preview perf gains incrementally.
- The `feat/immer-store-migration` branch is currently at the same commit as `main` (HEAD: `f306cb8`). All scorecard fix work is already committed and pushed.

## Quick reference

- **Branch:** `feat/immer-store-migration`
- **Files to touch:** `src/store/workspace.ts`, `src/store/workspace-helpers.ts`, `package.json` (add immer)
- **Files NOT to touch in this branch:** consumers of `useWorkspaceStore` (selector narrowing is Phase 12 / separate branch)
- **Estimated effort:** 4–6 hours of focused work across the 12 phases
- **Rollback:** safe at any phase boundary
