# Scorecard — Prioritized Fix List

**Repo:** c4hero
**Date:** 2026-05-04
**Composite Score:** 8.0/10 (was 8.7 — same parser win, but auditors weighted Performance + Reuse findings more heavily this round)

## How to use this list

Work through items top to bottom. Each item is ordered by impact — fixing items higher on the list will improve the composite score the most. Check off items as you go.

---

## Critical Priority

_None — no CRITICAL findings._

## High Priority

- [ ] **[Performance]** 17 components subscribe to the entire workspace via `useWorkspaceStore((s) => s.workspace)`; every mutation forces them all to re-render. — `src/components/canvas/Canvas.tsx:60`, `src/components/layout/RightPanel.tsx:40,74,329,497`, `FloatingInspector.tsx:6`, `FloatingTopPill.tsx:46`, `FloatingBottomStrip.tsx:15,30`, `FloatingToolRail.tsx:38`, `FloatingViewsPanel.tsx:17`, `ViewSwitcher.tsx:38,111`, `AddElementPanel.tsx:33`, `HighlighterPanel.tsx:30`, `right-panel/fields.tsx:116,408`, `GroupProperties.tsx:9`, `SearchDialog.tsx:20`, `CreateViewDialog.tsx:21`
  - **Fix:** Replace whole-workspace selectors with narrowed selectors using `useShallow` (mirroring `SaveIndicator`/`CanvasHints`). Pull only the slices each component renders.

- [ ] **[Performance]** Every store mutation does `structuredClone` of the full workspace via `cloneWs` at 30+ call sites — every keystroke-level operation deep-clones the entire model. — `src/store/workspace.ts:264`, `src/store/workspace-helpers.ts:152`
  - **Fix:** Adopt Immer (`zustand/middleware/immer`) so only mutated branches are copied; structural sharing eliminates O(workspace) allocation per edit and lets shallow selectors actually skip re-renders. Coordinate with the selector-narrowing fix above.

- [ ] **[Simplicity]** 13 source files exceed 500 lines: `workspace.ts` (1209), `Canvas.tsx` (835), `FloatingTopPill.tsx` (720), `WelcomeScreen.tsx` (669), `HighlighterPanel.tsx` (642), `RightPanel.tsx` (636), `serializer.ts` (605), `right-panel/fields.tsx` (605), `parser-model.ts` (574), `FloatingBottomStrip.tsx` (558), `WelcomeDialogs.tsx` (503), `workspace-helpers.ts` (501). — `src/store/workspace.ts`, `src/components/...`
  - **Fix:** Apply the parser-style decomposition pattern. Split `workspace.ts` into per-domain action slices (model, views, selection, history); extract sub-panels from `Canvas.tsx`, `FloatingTopPill.tsx`, `HighlighterPanel.tsx` into sibling files.

- [ ] **[Simplicity]** `Canvas.tsx` contains 34 hook calls (useEffect/useCallback/useMemo) in a single 835-line component, indicating the component owns many independent concerns. — `src/components/canvas/Canvas.tsx`
  - **Fix:** Extract concern-specific custom hooks (`useCanvasSelection`, `useCanvasViewport`, `useCanvasKeyboard`, `useCanvasDragHandlers`) so the top-level component reads as composition rather than orchestration.

- [ ] **[Reuse]** Anchored-popover pattern (portal + `getBoundingClientRect` coords + outside-click + Escape + scroll/resize reposition) is reimplemented in at least 5 places. — `src/components/welcome/RowMenu.tsx:15-60`, `src/components/settings/CanvasSettingsDialog.tsx:326-360`, `src/components/layout/FloatingBottomStrip.tsx:470-516`, `src/components/layout/FloatingToolRail.tsx:69-110`, `src/components/layout/highlighter/HighlighterPanel.tsx:148`, `src/components/layout/FloatingInspector.tsx:21-40`
  - **Fix:** Extract a `useAnchoredPopover` hook (or `<FloatingPanel anchorRef>` component) that owns coords computation, document-level mousedown, Escape, and scroll/resize repositioning. Migrate the 5+ duplicate sites.

## Medium Priority

- [ ] **[Performance]** Canvas's `viewStructureKey` selector iterates every view and concatenates element IDs into a string on every store change. — `src/components/canvas/Canvas.tsx:164-169`
  - **Fix:** Cache the fingerprint store-side (recompute only on element/view add/remove) or hash counts incrementally.

- [ ] **[Performance]** Several iteration patterns in `workspace-helpers.ts` use `flatMap` + `find` over softwareSystems/containers without a shared element index. — `src/store/workspace-helpers.ts:209,229,288,315,354`
  - **Fix:** Reuse `buildElementMap` consistently in lookup-heavy helpers.

- [ ] **[Maintainability]** ESLint `ecmaVersion` pinned to 2020 despite Node 22 / TS 5.9 / Vite 7 supporting modern syntax. — `eslint.config.js`
  - **Fix:** Bump to 2022 (or `'latest'`).

- [ ] **[Maintainability]** `lucide-react` pinned to `^1.14.0` — unusual major (mainline is 0.x). — `package.json`
  - **Fix:** Verify against upstream and align/document the choice.

- [ ] **[Maintainability]** Stale audit-artifact markdown files appear modified/deleted in the working tree. — repo root
  - **Fix:** Land or discard the in-flight working changes; move audit/checklist files into `docs/`.

- [ ] **[Reuse]** ~15 ad-hoc Escape handlers remain outside DialogShell's reach. — `RowMenu.tsx`, `FloatingToolRail.tsx`, `CanvasSettingsDialog.tsx`, `ViewSwitcher` rename, `fields.tsx` (×3), `HighlighterPanel.tsx`, `FloatingBottomStrip.tsx` (×2), `InlineName.tsx`, `ScopePickerDialog.tsx`, `CommandPalette.tsx`, `SearchDialog.tsx`, `WelcomeDialogs.tsx` (×2)
  - **Fix:** Introduce `useEscapeKey(active, onEscape)` and route all transient overlays through it.

- [ ] **[Reuse]** Several non-dialog overlays duplicate the `createPortal` + fixed-position boilerplate that DialogShell encapsulates. — `RowMenu.tsx`, `CanvasSettingsDialog.tsx`, `FloatingBottomStrip.tsx`, `HighlighterPanel.tsx`
  - **Fix:** Add a thin `<FloatingPanel anchorRef>` primitive in `src/components/shared/`.

- [ ] **[Simplicity]** Deep JSX nesting (≥6 logical levels) in some panels. — `src/components/layout/RightPanel.tsx:152`, `src/components/layout/highlighter/HighlighterPanel.tsx:570`
  - **Fix:** Hoist deeply-nested branches into named sub-components or early-return helpers.

- [ ] **[Simplicity]** `workspace.ts` mixes selectors, history (cloneWs/pushUndo), and 60+ mutator actions. — `src/store/workspace.ts`
  - **Fix:** Split into slices via Zustand `combine()` or a folder of action modules.

- [ ] **[UI/UX]** No i18n library; user-facing strings hardcoded English. — `src/components/**`
  - **Fix:** If multi-locale support is on the roadmap, integrate `react-i18next` or LinguiJS.

- [ ] **[UI/UX]** Limited responsive coverage — `useBreakpoint` consumed in only 2 components; many floating panels use fixed pixel sizes. — `src/components/layout/`, `src/index.css`
  - **Fix:** Audit floating panels at sub-768px widths; add breakpoint-aware layouts (or document desktop-only support).

- [ ] **[UI/UX]** Some inputs rely on aria-label/placeholder rather than associated `<label htmlFor>`. — `FloatingBottomStrip.tsx`, `CommandPalette.tsx`, `WelcomeScreen.tsx`
  - **Fix:** Standardize on visible `<label htmlFor>` for form fields.

- [ ] **[Observability]** No default error-tracking platform (Sentry/Datadog) wired in by default. — `src/main.tsx`, `src/lib/logger.ts`
  - **Fix:** Ship a default Sentry adapter behind an env flag.

- [ ] **[Testability]** Component-level test coverage is thin (~17% of components have a colocated test). — `src/components/`
  - **Fix:** Add tests for high-logic components (RightPanel, FloatingInspector, Canvas wrappers) using `@testing-library/react`.

- [ ] **[Security]** `index.html` meta CSP allows `'unsafe-eval'` in script-src. — `index.html:16`
  - **Fix:** Drop `'unsafe-eval'` from the meta CSP for production builds (move dev-only relaxations into Vite dev middleware).

## Suggestions

- [ ] **[Security]** No CodeQL workflow in CI beyond gitleaks + dependency-review. — `.github/workflows/ci.yml`
  - **Fix:** Add a CodeQL workflow for static JS/TS analysis.

- [ ] **[Testability]** No coverage thresholds enforced. — `vite.config.ts` / CI
  - **Fix:** Add lines/statements ≥ 70% gate.

- [ ] **[Testability]** No standalone `vitest.config.ts`. — repo root
  - **Fix:** Extract for clarity (setupFiles, env, coverage thresholds).

- [ ] **[UI/UX]** ErrorBoundary coverage could expand to dialog and right-panel subtrees. — `App.tsx`
  - **Fix:** Wrap RightPanel, FloatingInspector, and dialogs in localized ErrorBoundary instances.

- [ ] **[Observability]** No application-level metrics beyond Core Web Vitals. — `src/lib/webVitals.ts`
  - **Fix:** Emit `log.info` events for open/save/export and DSL parse-failure counts.

- [ ] **[Observability]** Per-session correlation ID exists but isn't surfaced in UI or attached as top-level field on remote-log payload. — `src/lib/logger.ts`, `src/main.tsx`
  - **Fix:** Show sessionId in About panel; include as top-level field on sendBeacon batches.

- [ ] **[DevOps]** CI doesn't include an explicit deploy job — Vercel auto-deploy is implicit via the GitHub integration. — `.github/workflows/ci.yml`
  - **Fix:** Document the Vercel auto-deploy trigger in `docs/DEPLOYMENT.md`.

- [ ] **[DevOps]** No Dockerfile / no IaC for Vercel. — repo root
  - **Fix:** Optional multi-stage Dockerfile + `.dockerignore` for self-hosters; Terraform Vercel provider for project/domain config.
