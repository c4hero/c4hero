# Semantic zoom validation

This worktree integrates the existing `7833853` Explore implementation with
C4Zoom-style inertial pan and a shared canvas-theme hook. Diagram remains the
default renderer. Explore uses stable nested geometry and the existing model,
inspector, search, keyboard navigation, themes and highlighting.

Focused unit coverage includes nested containment, deterministic layout,
authored-state isolation, relationship projection, camera anchoring, frame-rate
independence, idle detail completion, selection locking, reduced motion, camera
persistence and renderer switching.

Browser coverage is in `e2e/explore/explore.spec.ts`: mode/camera restoration,
deep search, partial reveal, relationship inspection, model reconciliation,
touch pinch, cancellation, reduced motion, presentation, themes and drag glide.
An optional 500-element benchmark records frame work and long tasks.

Run against an isolated server to avoid testing a different dev checkout:

```sh
npm run check
npm run dev -- --port 3106 --host 127.0.0.1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3106 npx playwright test e2e/explore --workers=1 --reporter=list
EXPLORE_BENCHMARK=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3106 npx playwright test e2e/explore -g benchmark --workers=1 --reporter=list
```

Browser screenshots and benchmark data are generated in Playwright's test
results. The dev hostname is Cloudflare Access gated; local-origin verification
does not establish an authenticated end-to-end visit through Access.

Explore supports the shared editing tool rail, contextual creation, dragging,
alignment, grouping, locks, hiding/restoring, connection creation/reconnection,
minimap and PNG/SVG export. Its layout is persisted separately in the sidecar,
with undo/redo; model edits use the shared workspace.
Deployment and dynamic views also remain in Diagram.

## Verified on 2026-09-20

- Full lint, TypeScript, unit tests and production build passed: 169 test files,
  3,227 passing tests, 100 skipped.
- 22 existing Diagram navigation, keyboard, search and DSL browser tests passed.
- Editing follow-up: 43 distinct browser checks passed across Explore editing/
  navigation and Diagram multi-selection, navigation, shortcuts, tool rail and
  auto-arrange overlays (two opt-in/pre-existing skips). The final focused rerun
  passed all 18 enabled editing/multi-selection checks, including vector SVG
  parsing, PNG download, grouping, layout locks and undo isolation.
- Seven Explore browser scenarios passed against the deployed origin, including
  the opt-in benchmark: 500 elements, 1,000 relationships, 271.4 ms initial
  layout, 4 ms p95 drawing work, 7.4 ms maximum, 16.7 ms median frame interval,
  no observed long tasks. This is headless Chromium evidence on this machine,
  not a guarantee across devices.
- Deployment uses the existing `c4hero-dev.service` with a reversible
  `zz-semantic-zoom.conf` WorkingDirectory override to this worktree. The previous
  override is retained. Origin returned HTTP 200; the public hostname returned
  its expected Cloudflare Access redirect. No Access or DNS configuration changed.

Final screenshot review also corrected focus framing to reserve the inspector
before it opens, with a browser assertion that the focused boundary is unobscured.
