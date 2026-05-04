# Scorecard — Prioritized Fix List

**Repo:** c4hero
**Date:** 2026-05-04
**Composite Score:** 8.7/10

## How to use this list

Work through items top to bottom. Each item is ordered by impact — fixing items higher on the list will improve the composite score the most. Check off items as you go.

---

## Critical Priority

_None — no CRITICAL findings._

## High Priority

- [ ] **[Simplicity]** `parser.ts` is 1683 lines with 7 methods exceeding 90 lines (`parseRelationship` 156, `parseModelBody` 149, `parseViewBody` 110, `parseSoftwareSystemBody` 98, `parseContainerBody` 92, `parseViewsBody` 91, `applyRelStyleProperty` 90). Multi-level nesting in keyword dispatch. — `src/lib/dsl/parser.ts`
  - **Fix:** Extract per-keyword handlers into a dispatch table (`Map<keyword, handler>`) and split `parseModelBody` / `parseRelationship` into smaller focused helpers (e.g. `parsePropertyBlock`, `parseTags`, `parseRelationshipStyle`).

## Medium Priority

- [ ] **[Performance]** 23+ components subscribe to the entire workspace via `useWorkspaceStore((s) => s.workspace)`; any mutation re-renders all of them. — `src/components/layout/RightPanel.tsx`, `FloatingTopPill.tsx`, `ViewSwitcher.tsx`, `FloatingInspector.tsx`, `AddElementPanel.tsx`, etc.
  - **Fix:** Use narrower selectors with shallow equality (e.g. `s.workspace.model.softwareSystems`, or selector helpers in `workspace-selectors.ts`).

- [ ] **[Performance]** Every store mutation does `structuredClone` of the full workspace; expensive on large workspaces and live-typing patches. — `src/store/workspace-helpers.ts:152`, `src/store/workspace.ts` (cloneWs usage throughout)
  - **Fix:** Adopt structural sharing (Immer producer or targeted shallow-clone-along-path) for hot paths, or scope deep clones to the affected sub-tree as `updateElementLive` already does.

- [ ] **[Performance]** Canvas `initialNodes/initialEdges` memo depends on the full workspace reference, so any unrelated change invalidates the dagre layout rebuild. — `src/components/canvas/Canvas.tsx:183-225`
  - **Fix:** Depend on `workspace.model` / `workspace.model.groups` / `view` slices, or memoize `buildRelationshipMap` / `buildDrillableSet` separately.

- [ ] **[Simplicity]** 13 source files exceed 500 lines (workspace.ts 1209, Canvas.tsx 835, FloatingTopPill.tsx 720, WelcomeScreen.tsx 669, HighlighterPanel.tsx 642, RightPanel.tsx 636, serializer.ts 605, right-panel/fields.tsx 605, FloatingBottomStrip.tsx 558, WelcomeDialogs.tsx 503, workspace-helpers.ts 501). — `src/store/workspace.ts`, `src/components/canvas/Canvas.tsx`, `src/components/layout/FloatingTopPill.tsx`, `src/components/welcome/WelcomeScreen.tsx`
  - **Fix:** Continue decomposition — extract Canvas event handlers (drag/drop, selection) into hooks; lift FloatingTopPill's inline `WorkspaceSwitcherPanel` (182 lines) into a sibling file; consider splitting workspace.ts by slice (model/view/selection/undo).

- [ ] **[Simplicity]** Top-level React components have very long bodies: Canvas 776, WelcomeScreen 591, FloatingTopPill 463, ElementProperties 207. — `src/components/canvas/Canvas.tsx:60`, `src/components/welcome/WelcomeScreen.tsx`, `src/components/layout/RightPanel.tsx`
  - **Fix:** Hoist event handlers into custom hooks (`useCanvasDragHandlers`, `useSelectionSync`) and extract JSX sub-sections into smaller named components. Aim for component bodies under 250 lines.

- [ ] **[Simplicity]** Pockets of 5–6 level nesting in `parser.ts` (column 24+ indentation on if/for inside `parseModelBody` / `parseSoftwareSystemBody`). — `src/lib/dsl/parser.ts`
  - **Fix:** Apply early-return / guard-clause refactors and use lookup tables for keyword dispatch instead of nested if/else ladders.

- [ ] **[Maintainability]** Same set of oversized modules. — `src/lib/dsl/parser.ts`, `src/store/workspace.ts`, `src/components/canvas/Canvas.tsx`, `src/components/layout/FloatingTopPill.tsx`, `src/components/welcome/WelcomeScreen.tsx`
  - **Fix:** Decompose into focused submodules; extract workspace.ts slices into the existing workspace-helpers/workspace-selectors pattern.

- [ ] **[Maintainability]** ESLint `ecmaVersion` set to 2020 even though codebase targets Node 22 / modern browsers. — `eslint.config.js:19`
  - **Fix:** Bump `ecmaVersion` to 2023+ (or `'latest'`).

- [ ] **[Reuse]** Inline Escape-key handling is reimplemented in 8+ components with similar `useEffect` + keydown listener patterns. — `src/components/layout/FloatingToolRail.tsx:72`, `src/components/settings/CanvasSettingsDialog.tsx:352`, `src/components/welcome/RowMenu.tsx:44`, `src/components/welcome/WelcomeDialogs.tsx:105,454`, `src/components/command-palette/CommandPalette.tsx:32`
  - **Fix:** Add a `useEscape(callback, enabled?)` hook in `src/hooks/` and replace the duplicated useEffect blocks across menus and flyouts.

- [ ] **[UI/UX]** All user-facing strings are hardcoded English; no i18n library present. — `package.json`, `src/components/**`
  - **Fix:** If multi-locale support is on the roadmap, integrate i18next or react-intl and extract user-visible strings to translation catalogs.

- [ ] **[UI/UX]** No global toast/notification system; user feedback for non-fatal async ops relies on inline state or `SaveIndicator` only. — `src/components/**`
  - **Fix:** Add a lightweight toast primitive (or adopt sonner) for confirmations like "View created", "Export failed — retry?".

- [ ] **[Observability]** No default error-tracking platform (Sentry/Datadog/Rollbar) wired in. — `src/main.tsx:106-122`, `src/lib/logger.ts:18-52`
  - **Fix:** Ship a default Sentry adapter behind an env flag so production builds get error grouping, release tagging, and alerting.

- [ ] **[DevOps]** No Dockerfile / container configuration. — repo root
  - **Fix:** Optionally add a multi-stage Dockerfile (node build + nginx/caddy serve, non-root) and `.dockerignore` for self-hosters.

- [ ] **[DevOps]** No infrastructure-as-code for the Vercel deployment. — repo root
  - **Fix:** Capture project/domain/header configuration in IaC (e.g. Terraform Vercel provider).

- [ ] **[Testability]** UI component coverage thinner than lib/store layers (~45% by file count). — `src/components/canvas/`, `src/components/layout/`
  - **Fix:** Expand unit tests for canvas-node and layout components.

- [ ] **[Security]** `index.html` meta CSP includes `'unsafe-eval'` for script-src and `ws:`/`wss:` in connect-src — looser than the production Vercel header. — `index.html:15`
  - **Fix:** Drop `'unsafe-eval'` and `ws:`/`wss:` from the production index.html CSP (move dev-only relaxations into Vite dev middleware) so meta CSP matches the Vercel header.

## Suggestions

- [ ] **[Security]** No CodeQL or scheduled `npm audit` job in CI beyond Dependabot. — `.github/workflows/ci.yml`
  - **Fix:** Add a CodeQL workflow and/or a scheduled `npm audit --production` step.

- [ ] **[Testability]** Test data constructed inline via per-file `makeWorkspace()` helpers; some duplication. — `src/store/workspace.test.ts`, `src/lib/dsl/*.test.ts`
  - **Fix:** Extract shared test fixture/factory builders for `Workspace`, `Element`, `Relationship`.

- [ ] **[Testability]** `WelcomeScreen.test.tsx` contains extensive ad-hoc `vi.mock()` calls for lucide-react and fileIO. — `src/components/welcome/WelcomeScreen.test.tsx`
  - **Fix:** Move common module mocks into a shared vitest setup file.

- [ ] **[Reuse]** Per-node C4 type wrappers (PersonNode, SystemNode, ComponentNode, ContainerNode) duplicate isExternal/typeColor/border ternaries. — `src/components/canvas/nodes/{Person,System,Component,Container}Node.tsx`
  - **Fix:** Move typeColor/tint/borderStyle/chipLabel/icon computation into `elementMeta.ts`; nodes shrink to passthroughs.

- [ ] **[Reuse]** Workspace-listing pipeline (`listDSLFiles` + parse + stats) duplicated between WelcomeScreen and FloatingTopPill. — `src/components/layout/FloatingTopPill.tsx`, `src/components/welcome/WelcomeScreen.tsx`
  - **Fix:** Extract a `useWorkspaceList()` / `loadWorkspaceEntries()` hook.

- [ ] **[UI/UX]** Only one layout breakpoint (`max-width: 760px`); narrow responsive coverage for mid-sized viewports. — `src/index.css`, `src/hooks/useBreakpoint.ts`
  - **Fix:** Add an intermediate breakpoint (~1024px) and audit floating panels (Inspector, BottomStrip, RightPanel) for overlap at mid widths.

- [ ] **[Observability]** Per-session correlation ID exists but no per-operation/trace ID — multi-step flows can't be correlated as a unit. — `src/lib/logger.ts:110-123`
  - **Fix:** Add an optional `operationId`/`traceId` field on `createLogger` or a `withContext()` helper.

- [ ] **[Observability]** No application-level metrics beyond Core Web Vitals. — `src/lib/webVitals.ts`, `src/lib/logger.ts`
  - **Fix:** Emit info-level events for key user actions (`workspace_loaded`, `export_succeeded`, `export_failed`).

- [ ] **[DevOps]** CI builds but doesn't smoke-test the production artifact. — `.github/workflows/ci.yml`
  - **Fix:** Run Playwright e2e against `vite preview` of the built dist/, or upload dist/ as an artifact.
