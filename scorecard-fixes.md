# Scorecard — Prioritized Fix List

**Repo:** c4hero (`/home/openclaw/Projects/c4hero`)
**Date:** 2026-05-04
**Composite Score:** 7.9/10

## How to use this list

Work through items top to bottom. Each item is ordered by impact — fixing items higher on the list will improve the composite score the most. Check off items as you go.

---

## Critical Priority

_None._

## High Priority

- [ ] **[Simplicity]** Eleven files exceed 500 lines; four exceed 1000 (parser.ts 1683, workspace.ts 1543, WelcomeScreen.tsx 1371, Canvas.tsx 1276). Concentrating logic in single files is the lowest-scored dimension on the audit. — `src/lib/dsl/parser.ts`, `src/store/workspace.ts`, `src/components/welcome/WelcomeScreen.tsx`, `src/components/canvas/Canvas.tsx`, plus 7 more
  - **Fix:** Split parser into lexer / grammar / semantic-analysis modules; decompose the workspace Zustand store into feature slices (model, views, selection, ui, persistence); extract WelcomeScreen subcomponents (Hero, CollectionGrid, RecentList); break Canvas.tsx into hooks (drag, selection, layout) plus a thin renderer.
- [ ] **[Simplicity]** Pervasive deep nesting in the DSL parser: ~650 lines indented 16+ spaces (4+ levels), with 333+ branching tokens in a single file. — `src/lib/dsl/parser.ts`
  - **Fix:** Replace the monolithic `parse()` loop with a dispatch table keyed on token kind, use early returns / guard clauses, and lift inner blocks into named helpers (`parseModel`, `parseView`, `parseRelationship`).
- [ ] **[Reuse]** Two parallel `ErrorBoundary` implementations exist with overlapping logic. `main.tsx` imports the simpler `/components/ErrorBoundary.tsx`; `App.tsx` imports the richer `/components/shared/ErrorBoundary.tsx`. (Observability flags the same divergence risk.) — `src/components/ErrorBoundary.tsx` and `src/components/shared/ErrorBoundary.tsx`
  - **Fix:** Delete the older `src/components/ErrorBoundary.tsx` and have `main.tsx` import the shared/ version with appropriate props (default label, `onHome` handler).
- [ ] **[Reuse]** A reusable `DialogShell` (focus trap, backdrop, Escape handling, `aria-modal`) is used by some dialogs but `ExportDialog`, `SearchDialog`, `CommandPalette`, and `WelcomeDialogs` each reimplement modal scaffolding independently — four parallel modal stacks. — `src/components/dialogs/ExportDialog.tsx`, `src/components/search/SearchDialog.tsx`, `src/components/command-palette/CommandPalette.tsx`, `src/components/welcome/WelcomeDialogs.tsx`
  - **Fix:** Migrate the remaining dialogs onto `DialogShell` so escape handling, focus trap, focus restoration, and ARIA semantics are guaranteed consistent. Extend `DialogShell` props if any need bespoke behavior (e.g., width sizing, autofocus targets).

## Medium Priority

- [ ] **[Simplicity]** WelcomeScreen.tsx (1371 lines) and workspace.ts (1543 lines, 228 branching tokens) blend rendering / state / effects, raising cyclomatic complexity beyond comfortable read-and-modify thresholds. — `src/components/welcome/WelcomeScreen.tsx`, `src/store/workspace.ts`
  - **Fix:** Extract subcomponents (Hero, CollectionGrid, RecentList) and split the store into slice files combined with Zustand's `combine` middleware composition.
- [ ] **[Simplicity]** Several layout components (FloatingTopPill 720, RightPanel 636, FloatingBottomStrip 558) are large single-file React components mixing state, derived UI, and presentational markup. — `src/components/layout/`
  - **Fix:** Extract toolbar groups and inspector sections into dedicated components; colocate hooks in `src/hooks` where state logic is reused.
- [ ] **[Reuse]** `localStorage` read/write `try/catch` + `JSON.parse/stringify` boilerplate is duplicated across multiple sites with the same defensive pattern. — `src/lib/viewportStorage.ts`, `src/store/settings.ts:92-105`, `src/lib/fileIO.ts:70-126,288-300`, `src/components/canvas/CanvasHints.tsx:9-25`
  - **Fix:** Add a tiny `safeStorage` helper (`src/lib/safeStorage.ts`) exposing `readJSON<T>(key, fallback)` and `writeJSON(key, value, opts)` that wraps the typeof / parse / quota guards and calls the existing logger.
- [ ] **[Maintainability]** Several source files exceed 1000 lines, making them harder to navigate and modify safely (same root cause as Simplicity finding). — `src/store/workspace.ts`, `src/lib/dsl/parser.ts`, `src/components/welcome/WelcomeScreen.tsx`, `src/components/canvas/Canvas.tsx`
  - **Fix:** Decompose the largest modules into smaller focused units (extract DSL parser sub-grammars, split workspace store into slices, factor WelcomeScreen sub-views).
- [ ] **[Performance]** Repeated linear `Array.find` / `Array.some` lookups by id in workspace store mutation paths run O(n) on each store update. Acceptable now but compounds with model size. — `src/store/workspace.ts:577,602,752,781,822,911,981,1005,1089,1113,1349,1474-1500`
  - **Fix:** Build memoized id→element / id→parent maps per workspace snapshot and reuse them across helpers (especially in `toggleElementInView`, rename, and tag operations).
- [ ] **[Performance]** Nested loops in DSL serializer iterate `softwareSystems → containers → components` and `views → elements` with inner `Array.find` for related styles/relationships. — `src/lib/dsl/serializer.ts:49-57,178-200,268-307,404-548`
  - **Fix:** If serialization becomes a hotspot, precompute index maps (relationships by source/destination id, styles by tag) before the outer loops.
- [ ] **[Testability]** Unit-test coverage at the file level is ~32% (50 / 156). Many large UI components (Canvas, FloatingBottomStrip, FloatingTopPill, ViewSwitcher, WelcomeDialogs, ExportDialog) lack dedicated unit tests and rely on Playwright e2e only. — `src/components/`
  - **Fix:** Add unit tests for the larger interactive components in `src/components/canvas/` and `src/components/layout/` to catch regressions faster than via Playwright.
- [ ] **[Maintainability]** `lucide-react` is pinned at `^1.14.0` while the current major series may be newer; verify whether the version is intentional. — `package.json`
  - **Fix:** Confirm `lucide-react` version intent and bump to a current release if not.
- [ ] **[Security]** CSP allows `unsafe-inline` for styles, weakening style-injection protection (acceptable for Tailwind/runtime themes but worth noting). — `vercel.json` (Content-Security-Policy header)
  - **Fix:** Migrate to nonce/hash-based style sources to remove `unsafe-inline` from `style-src` once the styling stack permits it.
- [ ] **[UI/UX]** No internationalization infrastructure — all user-facing strings are hardcoded English. Acceptable for a single-locale tool today; blocks future localization. — `package.json`, `src/components/**`
  - **Fix:** If localization is on the roadmap, integrate i18next or react-intl and extract strings into message catalogs.
- [ ] **[UI/UX]** Form validation is minimal beyond `aria-invalid` on URL fields. Inline required-field indicators and descriptive validation messages are sparse across dialogs. — `src/components/views/CreateViewDialog.tsx`, `src/components/welcome/WelcomeDialogs.tsx`
  - **Fix:** Add explicit required indicators, real-time validation feedback, and `aria-describedby` error messaging for all dialog forms.
- [ ] **[Observability]** No error-tracking platform (Sentry/Datadog/Rollbar) is wired by default. The logger is transport-pluggable and remote endpoint can be enabled via `VITE_LOG_ENDPOINT`, but out of the box errors only land in the browser console. — `src/lib/logger.ts`, `src/main.tsx`
  - **Fix:** Add an opt-in Sentry transport gated on `VITE_SENTRY_DSN` that captures `level === 'error'` entries with component tags and `sessionId` so production builds get alerting without code changes.
- [ ] **[Observability]** No application metrics or web-vitals instrumentation. For a canvas-heavy app, lack of FPS / long-task / interaction metrics makes perf regressions hard to detect in the field. — `src/`
  - **Fix:** Add `web-vitals` (LCP/INP/CLS) reporting through the existing logger transport, and instrument key flows (DSL parse, layout, export) with `performance.measure()` emitted at info/debug.
- [ ] **[DevOps]** README does not document the deployment process; Vercel deploy is implicit with no runbook for rollbacks, env setup, or preview-vs-prod flow. — `README.md`
  - **Fix:** Add a short Deployment section to the README describing the Vercel pipeline, required env vars, preview/prod promotion, and rollback steps.
- [ ] **[DevOps]** No infrastructure-as-code definitions are versioned in the repo; hosting/edge configuration lives only in `vercel.json`. — repo root
  - **Fix:** If hosting ever expands beyond Vercel defaults, introduce IaC (Terraform for DNS or Pulumi for Vercel) to keep infra reproducible.

## Suggestions

- [ ] **[Simplicity]** Adopt a soft 300-400 line ceiling for components and split the 11 files currently above 500 lines into focused modules and subcomponents. — repo-wide
  - **Fix:** Add a soft per-file size convention to CONTRIBUTING.md and treat it as a refactor signal (not a blocking lint rule).
- [ ] **[Reuse]** Inline `Escape`-key `useEffect` handlers reappear ~15 times across components; several at the dialog/sheet level overlap with what `DialogShell` already does. — `ExportDialog`, `WelcomeDialogs`, `WelcomeScreen`, `CanvasSettingsDialog`, `CommandPalette`
  - **Fix:** After migrating dialogs to `DialogShell`, remove their bespoke Escape `useEffect`s. For non-dialog input cases consider a small `useEscapeKey(handler)` hook.
- [ ] **[Performance]** No memoization layer for derived view data (filtered/highlighted nodes), relying on React render and Zustand selectors only. — `src/store/workspace.ts`, `src/hooks/useAutoSave.ts`
  - **Fix:** Consider `createSelector`-style memoization (or `subscribeWithSelector` + memo) for expensive derived collections if profiling shows redundant recompute.
- [ ] **[Testability]** `makeWorkspace()` factory helper is duplicated inline across multiple store/lib tests rather than centralized. — `src/store/workspace.test.ts`, `src/lib/dsl/*roundtrip.test.ts`
  - **Fix:** Extract a shared `src/test/factories` module with reusable `Workspace` / `Element` / `Relationship` builders to reduce duplication and improve test data realism.
- [ ] **[Testability]** No coverage reporting in CI; can't track test breadth over time or surface untested modules. — `.github/workflows/ci.yml`
  - **Fix:** Add a `vitest --coverage` step to CI and (optionally) upload a coverage badge.
- [ ] **[Security]** No automated secret-scanning workflow (gitleaks, trufflehog) configured in GitHub Actions; relies on manual review and Dependabot. — `.github/workflows/`
  - **Fix:** Add a gitleaks or trufflehog GitHub Action to CI to catch accidental secret commits.
- [ ] **[Security]** No CodeQL / `npm audit` step in CI; vulnerability detection currently depends solely on Dependabot PRs. — `.github/workflows/ci.yml`
  - **Fix:** Add `npm audit --audit-level=high` and/or CodeQL scanning to CI for proactive vulnerability detection.
- [ ] **[UI/UX]** Loading state vocabulary is limited to a single `LoadingDot`. No skeleton screens for canvas hydration or import; long-running imports may appear unresponsive. — `src/components/shared/LoadingDot.tsx`, `src/components/dialogs/ExportDialog.tsx`
  - **Fix:** Add skeleton/progress feedback for long DSL parses, exports, and initial canvas hydration.
- [ ] **[UI/UX]** Only one `@media (max-width: 760px)` breakpoint; mobile usability of the floating chrome (FloatingTopPill, FloatingBottomStrip, RightPanel) may degrade below it. — `src/index.css:1132`, `src/components/layout/*`
  - **Fix:** Audit floating panels at narrow widths and add progressive disclosure or stacked layouts for tablet/mobile.
- [ ] **[Observability]** Note in README that the app is fully client-side so future contributors do not look for backend telemetry / health endpoints. — `README.md`
  - **Fix:** Add a one-line note to README clarifying the local-first architecture has no server-side telemetry.
- [ ] **[DevOps]** No SBOM or artifact upload from CI; failed-run debugging relies on rerunning. — `.github/workflows/ci.yml`
  - **Fix:** Upload Playwright HTML report and Vitest output as workflow artifacts to aid post-mortem.
