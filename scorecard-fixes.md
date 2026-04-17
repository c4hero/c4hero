# Scorecard — Prioritized Fix List

**Repo:** c4hero
**Date:** 2026-04-16
**Composite Score:** 6.7/10

## How to use this list

Work through items top to bottom. Each item is ordered by impact — fixing items higher on the list will improve the composite score the most. Check off items as you go.

---

## Critical Priority

No critical findings detected.

## High Priority

- [ ] **[Observability]** No error tracking service integrated — errors only go to browser console — `src/main.tsx`
  - **Fix:** Add Sentry or Datadog Browser SDK and register a logger transport via addTransport() in main.tsx to capture errors and warnings from production users.

- [ ] **[Observability]** No application metrics or Web Vitals monitoring — `repo-wide`
  - **Fix:** Integrate web-vitals or a RUM SDK (e.g. Sentry Performance, Datadog RUM) to track Core Web Vitals, page load times, and key user interactions.

- [ ] **[DevOps]** CI pipeline never runs `npm run build` — broken builds not caught before merge — `.github/workflows/ci.yml`
  - **Fix:** Add a build job or step that runs `npm run build` to verify the production bundle compiles successfully.

- [ ] **[DevOps]** No deploy step or deployment documentation — `.github/workflows/ci.yml`
  - **Fix:** Either add a deploy job using Vercel CLI, or document the Vercel Git integration deployment process so it is not tribal knowledge.

- [ ] **[Simplicity]** 8 source files exceed 500 lines (parser 1748, workspace 1552, WelcomeScreen 1455, Canvas 1018, RightPanel 1010, templates 901, FloatingTopPill 798, FloatingBottomStrip 772) — `repo-wide`
  - **Fix:** Break WelcomeScreen.tsx into separate screen files. Extract parser body-parsing into shared utility methods. Split Canvas.tsx by extracting node/edge builders. Split workspace.ts CRUD operations into slices.

- [ ] **[Simplicity]** Multiple functions exceed 100 lines (WelcomeScreen ~507, Canvas ~548, parseModelBody ~167, duplicateElements ~155) — `src/components/welcome/WelcomeScreen.tsx:454`
  - **Fix:** Extract handler functions from WelcomeScreen into a custom hook. Extract Canvas node-building, edge-building, and event-handling into separate modules. Break addView's per-type element population into helper functions.

- [ ] **[Simplicity]** DSL parser has 6+ duplicated 'skip unknown keyword + brace block' patterns — `src/lib/dsl/parser.ts:550`
  - **Fix:** Extract the repeated pattern into a shared skipUnknownDirective() method on the parser class.

- [ ] **[Maintainability]** workspace.ts (1552 lines) mixes state, undo, CRUD, views, relationships, and UI toggles — `src/store/workspace.ts`
  - **Fix:** Split into focused modules: workspace-core, workspace-elements, workspace-views, workspace-relationships, workspace-ui. Re-export from an index.ts barrel.

- [ ] **[Maintainability]** Several UI components exceed 700-1000 lines — `src/components/layout/`
  - **Fix:** Extract sub-sections into dedicated child components. FloatingBottomStrip could split tag manager, status filter, and scope violation panels. WelcomeScreen could split startup view, collection view, and creation dialogs.

- [ ] **[Maintainability]** DSL parser is 1748 lines in a single file — `src/lib/dsl/parser.ts`
  - **Fix:** Split into focused parsing phases: model parsing, view parsing, style parsing, and directive handling.

- [ ] **[Testability]** Only 35% of source files have unit tests; 49 of 75 files lack coverage — `repo-wide`
  - **Fix:** Prioritize adding unit tests for interactive components (CommandPalette, ExportDialog, CreateViewDialog, CanvasSettingsDialog) and hooks (useKeyboardShortcuts, useAutoSave) that contain non-trivial logic.

- [ ] **[Reuse]** Built-in tags constant duplicated in 4 files with diverging membership — `src/store/workspace.ts:25`
  - **Fix:** Import the single BUILTIN_TAGS export from workspace.ts in all consuming files. Remove duplicate definitions in RightPanel.tsx, SearchDialog.tsx, and FloatingBottomStrip.tsx.

## Medium Priority

- [ ] **[Security]** CSP includes 'unsafe-eval' in script-src and 'unsafe-inline' in style-src — `index.html:9`
  - **Fix:** Remove 'unsafe-eval' from script-src. For Vite dev mode, use a nonce-based approach. Replace 'unsafe-inline' in style-src with nonce or hash-based approach.

- [ ] **[Security]** BYOK API keys in sessionStorage exposed by any XSS — `src/lib/ai.ts:25-40`
  - **Fix:** Document the XSS-exposure risk to users. Consider clearing sessionStorage on page unload or adding a session timeout.

- [ ] **[Security]** No `npm audit` step in CI pipeline — `.github/workflows/ci.yml`
  - **Fix:** Add `npm audit --audit-level=high` as a CI step to catch vulnerable dependencies before merge.

- [ ] **[Performance]** buildElementMap recomputed in 6+ components per workspace change — `src/store/workspace.ts:1433`
  - **Fix:** Memoize buildElementMap at the store level (e.g., WeakMap cache keyed by workspace reference) so it runs once per change.

- [ ] **[Performance]** Double structuredClone per mutation (cloneWs + pushUndo) — `src/store/workspace.ts:197`
  - **Fix:** Consolidate to single clone per mutation, or adopt immer for structural sharing.

- [ ] **[Performance]** No Vite manualChunks; 356KB main chunk bundles vendors + app — `vite.config.ts`
  - **Fix:** Add rollupOptions.output.manualChunks to split vendor dependencies (react, react-dom, @xyflow/react, dagre) into a separate cacheable chunk.

- [ ] **[Observability]** 6+ files bypass structured logger with raw console.* — `src/components/ErrorBoundary.tsx:20`
  - **Fix:** Replace direct console.* calls with createLogger() and add ESLint no-console rule.

- [ ] **[Observability]** Logger output is human-readable text, not JSON — `src/lib/logger.ts:122`
  - **Fix:** Add a JSON transport for production to make logs machine-parseable for aggregation.

- [ ] **[Observability]** No ESLint no-console rule to enforce logger usage — `eslint.config.js`
  - **Fix:** Add 'no-console': 'warn' to ESLint config.

- [ ] **[UI/UX]** All strings hardcoded in English with no i18n infrastructure — `repo-wide`
  - **Fix:** Extract user-facing strings into translation files and integrate react-intl or i18next.

- [ ] **[UI/UX]** Form labels lack htmlFor/id in ScopePickerDialog and others — `src/components/shared/ScopePickerDialog.tsx`
  - **Fix:** Add htmlFor on labels and matching id on inputs.

- [ ] **[UI/UX]** No inline validation error messages on forms — `src/components/shared/ScopePickerDialog.tsx`
  - **Fix:** Add inline validation with aria-describedby and aria-invalid attributes.

- [ ] **[UI/UX]** WorkspaceEditDialog doesn't use shared DialogShell — `src/components/welcome/WelcomeScreen.tsx:255`
  - **Fix:** Refactor to use DialogShell for consistent focus trapping and Escape handling.

- [ ] **[Reuse]** Two separate ErrorBoundary implementations — `src/components/ErrorBoundary.tsx`
  - **Fix:** Use the shared ErrorBoundary (with onReset/onHome callbacks) at root. Remove the minimal duplicate.

- [ ] **[Reuse]** NotFound/ServerError/ErrorBoundary share identical layout — `src/components/shared/`
  - **Fix:** Extract a shared StatusPage layout component that accepts icon, title, description, and action slots.

- [ ] **[Reuse]** SearchDialog and CommandPalette reimplement dialog overlay — `src/components/search/SearchDialog.tsx`
  - **Fix:** Refactor to compose with DialogShell for overlay/focus-trap layer.

- [ ] **[Reuse]** Selection-clear pattern repeated 7 times in store — `src/store/workspace.ts`
  - **Fix:** Extract a CLEAR_SELECTION constant and spread it in each action.

- [ ] **[Testability]** makeWorkspace() factory duplicated across 6+ test files — `src/lib/impliedRelationships.test.ts:5`
  - **Fix:** Extract a shared test factory in src/test/factories.ts.

- [ ] **[Testability]** useFocusTrap tests reimplement hook internals — `src/hooks/useFocusTrap.test.ts:46`
  - **Fix:** Use a test wrapper component that connects the hook's ref to real DOM elements.

- [ ] **[Simplicity]** 4+ levels of nesting in parser and store — `src/store/workspace.ts:626`
  - **Fix:** Use early returns and extract inner loops into helper functions.

- [ ] **[Simplicity]** workspace.ts Zustand store combines 40+ actions in one file — `src/store/workspace.ts:1`
  - **Fix:** Use Zustand slices pattern to separate CRUD, navigation, and UI state.

- [ ] **[Maintainability]** README is Vite boilerplate — `README.md`
  - **Fix:** Replace with project-specific docs covering architecture, setup, and deployment.

- [ ] **[Maintainability]** Prettier configured but not enforced in CI — `.prettierrc`
  - **Fix:** Add `prettier --check .` to CI pipeline.

- [ ] **[DevOps]** Hardcoded hostname in vite.config.ts — `vite.config.ts:21`
  - **Fix:** Read VITE_ALLOWED_HOSTS from environment variable as .env.example suggests.

- [ ] **[DevOps]** No Dockerfile for portable builds — `repo-wide`
  - **Fix:** Add lightweight nginx multi-stage Dockerfile for portability and local production testing.

## Suggestions

- [ ] **[Security]** AI error responses echoed to users could contain sensitive info — `src/lib/ai.ts:85-107`
  - **Fix:** Show generic error messages to users; log details via logger.

- [ ] **[Security]** connect-src CSP allows all ws:/wss: origins — `index.html:9`
  - **Fix:** Restrict connect-src in production to specific API domains only.

- [ ] **[Performance]** Canvas component not lazy-loaded — `src/App.tsx:18`
  - **Fix:** Lazy-load Canvas so @xyflow/react code loads only when workspace is active.

- [ ] **[Performance]** DSL serialization on main thread via requestIdleCallback — `src/hooks/useAutoSave.ts:54`
  - **Fix:** Move to Web Worker for large workspaces.

- [ ] **[UI/UX]** Some icon buttons use title but lack aria-label — `src/components/layout/FloatingViewsPanel.tsx:76`
  - **Fix:** Add aria-label to all icon-only buttons.

- [ ] **[UI/UX]** LoadingDot has no text fallback for longer loads — `src/components/shared/LoadingDot.tsx`
  - **Fix:** Add skeleton screen or text indicator.

- [ ] **[UI/UX]** --color-text-muted contrast ratio ~4.0:1 below AA for normal text — `src/index.css:20`
  - **Fix:** Lighten to at least #9198a1 for 4.5:1 ratio.

- [ ] **[Observability]** Production min level is 'warn'; info events dropped — `src/lib/logger.ts:105`
  - **Fix:** Consider raising to 'info' for key business events.

- [ ] **[Testability]** Coverage thresholds at 50% could be raised — `vite.config.ts:39`
  - **Fix:** Target 70% statements and 60% branches as next milestone.

- [ ] **[Testability]** No visible branch protection requiring CI to pass — `.github/workflows/ci.yml`
  - **Fix:** Configure GitHub branch protection rules.

- [ ] **[Reuse]** forEachElement reimplemented in sidecar.ts — `src/lib/sidecar.ts`
  - **Fix:** Export forEachElement from workspace.ts for reuse.

- [ ] **[Simplicity]** WelcomeScreen has 6+ inline sub-components — `src/components/welcome/WelcomeScreen.tsx:77`
  - **Fix:** Move self-contained sub-components to separate files.

- [ ] **[Maintainability]** Inconsistent JSDoc coverage on exports — `repo-wide`
  - **Fix:** Add JSDoc to all exported functions, especially store and lib utilities.

- [ ] **[Maintainability]** templates.ts (901 lines) has hardcoded object literals — `src/lib/templates.ts`
  - **Fix:** Move template definitions to .dsl fixture files.

- [ ] **[DevOps]** No IaC definitions — `repo-wide`
  - **Fix:** Add Vercel project configuration as the project grows.

- [ ] **[DevOps]** CI duplicates setup across 3 jobs without caching — `.github/workflows/ci.yml`
  - **Fix:** Use composite action or cache npm ci output across jobs.
