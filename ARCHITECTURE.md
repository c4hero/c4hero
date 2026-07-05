# Architecture

How c4hero is put together — the shape of the code, where things live, and the
conventions that keep it consistent. Pairs with [CONTRIBUTING.md](CONTRIBUTING.md)
and the user-facing [docs/FEATURES.md](docs/FEATURES.md).

## What it is

c4hero is a **local-first** C4 architecture modeling tool. It runs entirely in
the browser — there is **no backend**. Diagrams are authored as
[Structurizr DSL](https://docs.structurizr.com/dsl), held in memory as a typed
model, rendered on an interactive canvas, and saved to the user's own files or
`localStorage`. The optional AI assistant is **BYOK** (bring-your-own-key): the
user's provider key lives only in their browser and requests go directly to the
provider.

### Stack

| Concern | Choice |
|---|---|
| UI | React 19, TypeScript (strict) |
| Build/dev | Vite |
| State | Zustand + immer (sliced store) |
| Canvas | `@xyflow/react` (React Flow) |
| Routing | React Router (`BrowserRouter`) |
| Model format | Structurizr DSL (custom lexer/parser/serializer) |
| Persistence | File System Access API + `localStorage` |
| AI | BYOK — Anthropic / OpenAI / Gemini, called direct from the browser |
| Tests | Vitest (unit) + Playwright (e2e) |
| Hosting | Static deploy (Vercel) |

## Directory map

```
src/
  main.tsx                 # entry: Router + ErrorBoundary, observability init
  App.tsx                  # route shell; mounts canvas chrome on /collection/:c/:d
  types/model.ts           # the core domain types (Workspace, Model, View, …)

  store/                   # Zustand store — the single source of UI + model state
    workspace.ts           #   composes all slices into useWorkspaceStore
    workspace-types.ts     #   WorkspaceState: the full store interface
    workspace-helpers.ts   #   pure draft mutators / view helpers
    workspace-selectors.ts #   derived reads (breadcrumb, creatable types, …)
    internals.ts           #   nanoid, pushUndoSnapshot
    slices/                #   11 slices (see "State")
    settings.ts            #   canvas/app settings (persisted)
    ai-settings.ts         #   BYOK provider/key/model settings (persisted)

  lib/
    dsl/                   # Structurizr DSL pipeline (lexer → parser → model; serializer)
    ai/                    # the BYOK AI engine (pure logic + provider adapters)
    templates/             # starter models (blank, bigBank, microservices, …)
    observability/         # Sentry, Cloudflare analytics, privacy signals
    fileIO.ts / folderIO.ts# File System Access wrappers
    safeStorage.ts         # localStorage with quota/parse guards
    viewportStorage.ts     # per-view camera persistence
    fitViewport.ts         # fit-to-screen geometry (chrome-aware)

  hooks/                   # cross-cutting React hooks (keyboard shortcuts, …)

  components/
    canvas/                # React Flow canvas, node/edge renderers, builders
    layout/                # floating chrome: top pill, tool rail, inspector, …
    ai/                    # the BYOK assistant panel + helpers
    command-palette/ search/ dialogs/ settings/ views/ welcome/ shared/
```

## The domain model

`src/types/model.ts` defines the whole domain. A **`Workspace`** is the unit of
work:

```
Workspace
  ├─ model:  people, softwareSystems(→ containers(→ components)), relationships, groups
  └─ views:  systemLandscape | systemContext | container | component  (+ styles config)
```

This mirrors the C4 hierarchy. Views are *projections* of the model: each holds a
list of element/relationship ids plus per-node layout. The same element can
appear in several views; the model is the source of truth.

Diagrams are authored as **Structurizr DSL** and round-trip through
`lib/dsl/`: `lexer` → `parser*` (model/relationship/styles/views) → `Workspace`,
and `serializer` back to DSL. `auto-views.ts` synthesizes default views when the
DSL omits them so the canvas is never empty.

## State

All model + UI state lives in one Zustand store (`store/workspace.ts`), built
with the **immer** middleware and split into 11 cohesive slices:

| Slice | Owns |
|---|---|
| `element-slice` | add/update/delete people, systems, containers, components |
| `relationship-slice` | relationships |
| `group-slice` | element groups |
| `view-slice` | create/populate/delete views |
| `navigation-slice` | active view, drill-in, breadcrumb history, focus |
| `selection-slice` | selected element/relationship/group |
| `filter-slice` | the highlighter (tag/status/tech/team facets) |
| `tag-style-slice` | per-tag styling |
| `ui-slice` | panel/dialog flags, canvas-mode toggles, AI-panel state |
| `undo-slice` | undo/redo snapshot stack |
| `lifecycle-slice` | load/close workspace, reset |

Conventions:

- **`WorkspaceState`** (`workspace-types.ts`) is the one interface; each slice is
  typed as a `Pick<WorkspaceState, …>` so the store stays cohesive and there's a
  single place to find any action's signature.
- **Mutations go through immer drafts** (`set((s) => { … })`). Shared draft logic
  lives in `workspace-helpers.ts` (e.g. `addToCurrentView`, `selectCreated`,
  `clearSelectionDraft`, `buildInitialViewContent`).
- **Undo** is snapshot-based: model-mutating actions call `pushUndoSnapshot(s)`
  before changing state.
- **Derived data** (breadcrumbs, which element types are creatable in the active
  view, lookups) lives in `workspace-selectors.ts`, not in components.

## Persistence

Nothing leaves the device. Three layers:

- **Local files** — `fileIO.ts` / `folderIO.ts` wrap the File System Access API
  (open/save DSL, scan a folder). A `.json` sidecar carries layout/state DSL
  can't express.
- **`localStorage`** — autosave + recent files/folders, via `safeStorage.ts`
  (guards quota and malformed JSON) and `viewportStorage.ts` (per-view camera).
- **Settings** — `store/settings.ts` (canvas/app prefs) and
  `store/ai-settings.ts` (BYOK provider/key/model) persist separately and have
  `normalize*` migrations for backward compatibility.

## Rendering & canvas chrome

The canvas is `@xyflow/react`. `components/canvas/canvasBuilders.ts` projects the
active view's elements/relationships into React Flow nodes/edges; node renderers
live under `components/canvas/nodes/`.

Floating UI (top pill, tool rail, inspector, AI panel, highlighter, zoom HUD)
sits over the canvas and follows two attribute conventions:

- **`data-canvas-chrome`** — marks a floating surface for shared CSS (e.g. the
  fade-while-dragging effect).
- **`data-canvas-fit-chrome="top|right|bottom|left"`** — the *only* attribute
  `fitViewport.ts` reads to reserve space, so "fit to screen" never tucks content
  behind a bar.

## The AI engine (BYOK)

`lib/ai/` is a self-contained, **mostly pure** engine; the panel UI is the only
React part. Layering:

```
AiPanel.tsx (UI, flows, sessionCache)
      │  calls features with a provider instance
      ▼
features.ts  ── generateDiagram, reviewArchitecture, autoDescribe, planEdit,
                 interviewAsk/BuildPlan, suggestTags, draftAdr
      │  uses prompts.ts + schema.ts + context.ts
      ▼
providers/   ── createProvider(id, {apiKey, model}) → AiProvider
   index.ts, anthropic.ts, openai.ts, gemini.ts, http.ts (shared fetch/parse)
```

Key seams and pure modules:

- **`AiProvider`** (`types.ts`) — `complete` / `completeJson(schema, validate)`.
  Providers differ only in request/response shape; `http.postJson` +
  `parseAndValidate` are shared. Errors map to a small `AiError` taxonomy.
- **`createProvider`** is the single id→implementation map (`providers/index.ts`);
  `providerMeta.ts` holds the per-provider model list, defaults, and key help.
- **Applying edits** — every feature ultimately produces an `EditPlan`
  (operations). `operations.ts#applyEditPlan` applies it through the
  **`EditActions`** interface (a fake in tests, the store in production), sorting
  ops parents-before-children and validating each before it touches the model.
- **Pure helpers (unit-tested in isolation):** `sweep.ts` (instant missing-info
  gaps + model-health %), `context.ts` (model flattening/serialization),
  `schema.ts` (tolerant `to*()` sanitizers), `dsl.ts` (extract DSL from model
  prose), `composeMode.ts` (new-vs-change intent), `review.ts`, `planScope.ts`.
- **`sessionCache.ts`** keeps an in-progress assistant flow (sweep/interview)
  alive across close→reopen, keyed on the diagram route, session-only.

Because the engine talks to the store through `EditActions` and to the network
through `AiProvider`, the bulk of it is testable without React or real HTTP.

## Entry & routing

`main.tsx` mounts `<BrowserRouter>` + `<ErrorBoundary>` and initializes
observability (Sentry, Cloudflare analytics, logger transports — all
privacy-gated). `App.tsx` is the route shell; the canvas + floating chrome render
only on a diagram route (`/collection/:collection/:diagram`), which is also the
signal several features use to scope themselves (e.g. the AI panel and the resume
cache).

## Testing

- **Unit** — Vitest, ~1,300 tests. The pure layers (`lib/*`, `store/*`) are
  heavily covered; the `EditActions`/`AiProvider` seams let the AI engine and
  store be tested with fakes. Coverage thresholds are enforced in
  `vite.config.ts`.
- **E2e** — Playwright suites under `e2e/` (canvas, file-io, keyboard, panels,
  search, journeys, scenarios).
- CI (`.github/workflows/ci.yml`) runs lint + typecheck, unit, e2e, build, and
  security gates (`npm audit`, secret-scan, CodeQL, dependency-review).

## Data-flow sketches

**A user edits the model**
```
component event → store action (immer draft, pushUndoSnapshot)
  → model + active-view mutated → React re-renders → canvasBuilders → React Flow
```

**The AI applies a plan**
```
prompt → features.* (provider.completeJson) → EditPlan
  → applyEditPlan(plan, storeActions, ws)  [sorted, validated, batch mode]
  → store mutates → focusViewForElements navigates once → canvas reflects it
```

**Opening a file**
```
fileIO.openDSLFile() → parseDSL() → Workspace (+ sidecar layout)
  → lifecycle-slice.loadWorkspace() → navigation picks the first view
```

## Conventions worth knowing

- **One store, typed via `WorkspaceState`**; slices are `Pick`s of it.
- **Mutations are immer drafts**; share logic via `workspace-helpers.ts`, not
  copy-paste.
- **Undo before mutate** (`pushUndoSnapshot`).
- **The AI panel and the inspector share one screen slot** — selecting an element
  closes the assistant and vice-versa; the inspector yields while the assistant
  is open.
- **`data-canvas-fit-chrome`** is the contract for fit-to-screen insets.
- **AI engine stays pure** — keep network behind `AiProvider` and store writes
  behind `EditActions` so it remains testable.
