# Repo Audit — Prioritized Fix List

**Repo:** c4hero-v2 (`/home/openclaw/Projects/c4hero-v2`)
**Date:** 2026-03-18
**Composite Score:** 6.1/10

## How to use this list

Work through items top to bottom. Each item is ordered by impact — fixing items higher on the list will improve the composite score the most. Check off items as you go.

---

## Critical Priority

- [ ] **[Testability]** Only 3 unit test files exist for 63 source files (~5% coverage). The entire React component layer, hooks, and most lib modules have zero tests. — `src/`
  - **Fix:** Add unit tests for all pure-function lib modules (fileIO, commands, exportUtils, impliedRelationships, sidecar validation) and store slices. Target at least 50% file coverage to match the declared coverage threshold.

## High Priority

- [x] **[Observability]** No structured logging library or strategy. All logging is bare console.error/console.warn with no consistent fields (timestamp, level, component, correlationId). — `repo-wide`
  - **Fix:** Adopt a lightweight structured logger (e.g. a thin wrapper around console that emits JSON with timestamp, level, component, and message fields). Replace all console.* call sites with it.

- [ ] **[Observability]** No error tracking or crash reporting integration. ErrorBoundary and global handlers only call console.error — no Sentry, Datadog, or equivalent. — `src/main.tsx:8-13`
  - **Fix:** Integrate Sentry via its React SDK. Initialize before root render, hook into ErrorBoundary's componentDidCatch, and capture global window.error/unhandledrejection events.

- [x] **[Observability]** ~15-20 catch blocks silently swallow errors with no logging, making production diagnosis impossible. — `src/lib/fileIO.ts, src/lib/ai.ts, src/lib/sidecar.ts, src/store/settings.ts`
  - **Fix:** Add at minimum a structured log call (warn or error) in every catch block that currently returns silently. Distinguish between expected no-ops (user cancelled, no sidecar) and true error conditions.

- [x] **[Testability]** Vitest configured with environment: 'node', structurally blocking all React component testing. — `vite.config.ts:20`
  - **Fix:** Change the Vitest environment to 'jsdom' or 'happy-dom' and install @testing-library/react so React components can be rendered and asserted against in unit tests.

- [ ] **[Testability]** Several E2E tests contain no assertions at all (tag-filtering, file I/O Ctrl+S). — `e2e/tags/tag-filtering.spec.ts:10-26, e2e/file-io/save-load.spec.ts:4-11`
  - **Fix:** Implement real assertions for these tests: check node opacity changes for tag filtering, verify download event or save indicator for Ctrl+S. Remove or mark as TODO any test that cannot yet be asserted.

- [ ] **[Testability]** E2E tests use waitForTimeout() extensively (~10 occurrences) instead of deterministic awaits. — `e2e/` (multiple files)
  - **Fix:** Replace all waitForTimeout calls with waitFor({ state: 'visible' }), locator.waitFor(), or expect(locator).toBeVisible() with appropriate retry logic.

- [x] **[Performance]** deleteElements uses O(N*V) nested scan — relationships.some() inside a per-view filter loop. — `src/store/workspace.ts:434`
  - **Fix:** Build a Set<string> from surviving relationship IDs once after the filter and use Set.has() inside the forEachView filter.

- [x] **[Performance]** canDrillInto called per node in buildNodes on every workspace change — O(E*(N+V)) per render. — `src/components/canvas/Canvas.tsx:141`
  - **Fix:** Pre-compute a Set of drillable element IDs before the node-building loop by iterating containerViews and componentViews once. Use O(1) Set.has() inside the loop.

- [ ] **[Performance]** structuredClone(workspace) on every mutation for undo deep-clones the entire workspace graph. — `src/store/workspace.ts:139`
  - **Fix:** Consider immer for structural sharing, or limit undo entries to a diff/patch format. Extend the updateElementLive partial-clone optimization to other high-frequency paths.

- [ ] **[Simplicity]** Six source files exceed 500 lines, three mixing multiple distinct concerns. — `parser.ts, workspace.ts, Canvas.tsx, RightPanel.tsx, FloatingBottomStrip.tsx`
  - **Fix:** Split FloatingBottomStrip.tsx into FloatingBottomStrip + TagManagerPanel + TagStyleEditor files. Extract node/edge builder functions from Canvas.tsx into canvas/builders.ts.

- [ ] **[Simplicity]** DSL parser contains three near-identical parse-body methods sharing 80%+ structural logic. — `src/lib/dsl/parser.ts:294,496,617`
  - **Fix:** Extract the common token-dispatch loop into a shared private method. The IDENTIFIER+EQUALS and IDENTIFIER+ARROW handling can become a parseAssignmentOrRelationship helper.

- [x] **[Reuse]** useBreakpoint hook exists but is never imported. FloatingTopPill re-implements the same logic inline. — `src/hooks/useBreakpoint.ts vs src/components/layout/FloatingTopPill.tsx:45-50`
  - **Fix:** Replace the inline isMobile state and resize listener in FloatingTopPill with useBreakpoint(), and delete the dead inline code.

- [x] **[UI/UX]** Form label elements not programmatically associated with inputs via htmlFor/id — screen readers can't announce field names. — `src/components/layout/RightPanel.tsx, src/components/ai/AISettingsDialog.tsx, src/components/views/CreateViewDialog.tsx`
  - **Fix:** Add matching id attributes to each input/select and htmlFor to the corresponding label. At minimum add aria-label to unlabeled selects.

- [x] **[UI/UX]** RightPanel tab buttons lack role="tablist"/role="tab"/aria-selected semantics. — `src/components/layout/RightPanel.tsx:192-210`
  - **Fix:** Wrap the tab row in a div with role='tablist', add role='tab' and aria-selected={activeTab === id} to each button, and add role='tabpanel' to the content area.

- [ ] **[Maintainability]** README is the unmodified Vite scaffold boilerplate with no project-specific content. — `README.md`
  - **Fix:** Replace with a project-specific README covering: what c4hero is, install/run steps, environment variables (AI API keys), test commands, and architectural overview.

## Medium Priority

- [ ] **[Performance]** SVG export inlineStyles blocks main thread with getComputedStyle per DOM element. — `src/lib/exportUtils.ts:123-134`
  - **Fix:** Move SVG export to a Web Worker, or batch getComputedStyle calls with requestAnimationFrame yields.

- [ ] **[Performance]** useMemo depends on entire workspace object — non-visual changes trigger full dagre re-layout. — `src/components/canvas/Canvas.tsx:514-545`
  - **Fix:** Derive a granular memo dependency fingerprinting only data relevant to the current view.

- [ ] **[Performance]** useBreakpoint resize listener not debounced. — `src/hooks/useBreakpoint.ts:17`
  - **Fix:** Wrap the resize handler with a 100ms debounce.

- [ ] **[Performance]** No manual chunk splitting for large vendor deps in Vite config. — `vite.config.ts`
  - **Fix:** Add rollupOptions.output.manualChunks to split dagre and html-to-image into separate async chunks.

- [ ] **[Testability]** Coverage thresholds (50%) not enforced in CI. — `vite.config.ts:28-31, .github/workflows/ci.yml`
  - **Fix:** Add a coverage run step to CI and temporarily lower thresholds to match reality, then raise incrementally.

- [x] **[Testability]** Vitest include glob excludes .tsx files. — `vite.config.ts:22`
  - **Fix:** Change to `['src/**/*.test.{ts,tsx}']`.

- [ ] **[Simplicity]** updateNodePosition and updateNodePositions share 90% identical view-array traversal logic. — `src/store/workspace.ts:602,623`
  - **Fix:** Extract a shared cloneActiveView(ws, activeViewKey) helper.

- [ ] **[Simplicity]** buildBoundaryNode has two nearly identical code blocks for container/component views. — `src/components/canvas/Canvas.tsx:222`
  - **Fix:** Unify into a parameterized helper receiving scope element, child IDs, and typeLabel.

- [ ] **[Reuse]** Escape-key handling duplicated in 4 separate places with near-identical addEventListener patterns. — `src/components/dialogs/ExportDialog.tsx:19-23, src/components/command-palette/CommandPalette.tsx:27-29`
  - **Fix:** Route modal dialogs through DialogShell's Escape handling rather than inlining addEventListener calls.

- [ ] **[Reuse]** External element styling logic duplicated in PersonNode and SystemNode. — `src/components/canvas/nodes/PersonNode.tsx:9-22, SystemNode.tsx:9-22`
  - **Fix:** Extract a getExternalProps(isExternal, colors) helper.

- [x] **[Reuse]** viewArrayKeys constant defined inline in 3 separate functions. — `src/store/workspace.ts:580,606,627`
  - **Fix:** Extract to a module-level constant or reuse forEachView/allViewsOf.

- [ ] **[UI/UX]** WelcomeScreen uses bare window.alert() for DSL parse failures. — `src/components/welcome/WelcomeScreen.tsx:83`
  - **Fix:** Replace with setErrorMsg() to use the existing in-UI error banner.

- [ ] **[UI/UX]** MultiSelectBar action buttons have title but no aria-label. — `src/components/layout/MultiSelectBar.tsx:113-189`
  - **Fix:** Add aria-label attributes matching the title props.

- [ ] **[UI/UX]** RecentFilesList items are non-interactive divs with hover treatment. — `src/components/welcome/WelcomeScreen.tsx:258-270`
  - **Fix:** Convert to buttons if openable, or remove hover styling.

- [ ] **[UI/UX]** No i18n infrastructure; all strings hardcoded in English. — `repo-wide`
  - **Fix:** Consider a thin i18n layer or extract strings to a single en.ts constants file.

- [ ] **[Maintainability]** ESLint uses syntax-only rules, not type-aware. — `eslint.config.js:13`
  - **Fix:** Upgrade to tseslint.configs.recommendedTypeChecked with parserOptions.project.

- [ ] **[Maintainability]** Prettier not invoked in CI pipeline. — `.github/workflows/ci.yml`
  - **Fix:** Add `npx prettier --check .` CI step.

- [ ] **[Maintainability]** DSL parser/serializer use 4-space indentation vs project 2-space standard. — `src/lib/dsl/parser.ts`
  - **Fix:** Run `npx prettier --write src/lib/dsl/parser.ts src/lib/dsl/serializer.ts`.

- [ ] **[Security]** CSP meta tag uses 'unsafe-inline' for style-src. — `index.html:7`
  - **Fix:** Replace with nonce or hash-based approach, or document the Tailwind trade-off explicitly.

- [ ] **[Security]** CI pipeline has no 'npm audit' step. — `.github/workflows/ci.yml`
  - **Fix:** Add `npm audit --audit-level=high` as a CI step.

- [ ] **[Security]** API error handlers log partial response bodies to console. — `src/lib/ai.ts:77,99,145,167`
  - **Fix:** Log only HTTP status code and safe error code/message field.

- [ ] **[Observability]** No web-vitals or performance metrics collection. — `repo-wide`
  - **Fix:** Add web-vitals package and instrument key actions with performance marks.

- [ ] **[Observability]** Log levels applied inconsistently. — `src/components/welcome/WelcomeScreen.tsx:54, src/lib/fileIO.ts:37-39`
  - **Fix:** Apply consistent severity semantics: ERROR for failures, WARN for degraded states, DEBUG for diagnostics.

- [ ] **[DevOps]** API base URLs hardcoded in source code. — `src/lib/ai.ts:61,85,129,153`
  - **Fix:** Extract to VITE_ env vars and document in .env.example.

- [ ] **[DevOps]** No deployment documentation. — `README.md`
  - **Fix:** Add deployment section covering build steps, hosting target, and required env vars.

- [ ] **[DevOps]** No Infrastructure as Code definitions. — `repo-wide`
  - **Fix:** Add IaC definitions as the project matures.

## Suggestions

- [ ] **[Performance]** buildElementMap/buildRelationshipMap called redundantly in render cycle. — `src/components/canvas/Canvas.tsx:118-311`
  - **Fix:** Build both maps once at the top of useMemo and pass as arguments.

- [ ] **[Simplicity]** handleAlign switch with 6 similar cases. — `src/components/layout/FloatingToolRail.tsx:100`
  - **Fix:** Consider a data-driven lookup table of transform functions.

- [ ] **[Simplicity]** WorkspaceState interface at 130 lines with 40+ methods. — `src/store/workspace.ts:21`
  - **Fix:** If the store grows further, consider Zustand's slice pattern.

- [ ] **[Testability]** E2E fixtures rely on fragile CSS class selectors. — `e2e/fixtures/workspace.ts`
  - **Fix:** Add data-testid attributes to key elements.

- [ ] **[Reuse]** FieldLabel component in RightPanel not exported/reused by other dialogs. — `src/components/layout/RightPanel.tsx vs src/components/views/CreateViewDialog.tsx`
  - **Fix:** Promote FieldLabel to src/components/shared/ and import everywhere.

- [ ] **[UI/UX]** Form fields use silent disable-only validation, no inline error messages. — `src/components/ai/AISettingsDialog.tsx, src/components/views/CreateViewDialog.tsx`
  - **Fix:** Add inline validation feedback and required-field indicators with aria-describedby.

- [ ] **[UI/UX]** FloatingInspector has aria-label but no explicit role. — `src/components/layout/FloatingInspector.tsx:41`
  - **Fix:** Add role='complementary'.

- [ ] **[Security]** Security headers (HSTS, X-Content-Type-Options) absent; CSP in meta tag not HTTP header. — `index.html:7`
  - **Fix:** Serve via hosting layer with HTTP-level security headers.

- [ ] **[DevOps]** No Dockerfile or container configuration. — `repo-wide`
  - **Fix:** Add optional multi-stage Dockerfile (Node build + nginx:alpine serve).

- [ ] **[DevOps]** CI has no build artifact upload step. — `.github/workflows/ci.yml`
  - **Fix:** Add a build job that uploads dist/ as a GitHub Actions artifact.
