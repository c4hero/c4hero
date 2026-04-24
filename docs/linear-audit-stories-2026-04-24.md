# Linear stories drafted from 2026-04-24 broad fidelity audit

## Story 1 — Preserve intentional empty groups across DSL roundtrip
- **Area:** Group behavior vs C4 meaning / import-export fidelity
- **Problem:** The app can create empty groups in memory, but DSL serialization omits them. That means an intentional boundary/group can disappear after export/reload if it temporarily has no members.
- **Why it matters:** This makes group intent unstable and can mislead users about whether boundaries are semantic containers or just member-derived adornments.
- **Suggested acceptance criteria:**
  - Decide whether empty groups are valid product semantics.
  - If valid, serialize and parse them roundtrip.
  - If invalid, prevent creating/saving them in the UI and explain why.

## Story 2 — Add browser-level regression coverage for reconnecting relationships into scoped context views
- **Area:** Relationship editing semantics / C4 scope
- **Problem:** Store-level behavior is now covered, but there is still no end-to-end test proving the canvas/inspector flow keeps scoped context diagrams semantically correct after drag-reconnecting a relationship.
- **Why it matters:** A future canvas regression could silently reintroduce misleading context diagrams even if unit tests stay green.
- **Suggested acceptance criteria:**
  - Add Playwright coverage for reconnecting a relationship so one endpoint becomes the scoped software system.
  - Verify the other endpoint is shown in the context view and the relationship remains visible after save/reload.

## Story 3 — Stress-test layout stability across repeated mixed mutations and view switches
- **Area:** Layout quality after repeated mutations
- **Problem:** Existing E2E coverage checks group bounds after auto-arrange, but not longer create/connect/group/delete/undo/redo/view-switch sequences.
- **Why it matters:** Drift, overlap, or unstable edge routing in longer sessions would be semantically misleading even without a crash.
- **Suggested acceptance criteria:**
  - Add a deterministic Playwright scenario with repeated mixed mutations.
  - Assert group bounds continue to contain members and relationships stay attached after undo/redo and switching views.
