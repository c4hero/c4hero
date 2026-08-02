# c4hero DSL Serializer Knowledge

## Build/Test Commands
- `npm run check` — full test suite; note tests validate against c4hero's own parser, not real Structurizr
- `npm run dsl:conformance` — Structurizr CLI conformance gate; runs emitted DSL through real CLI and fails on rejection
- `npx vitest run src/lib/dsl` — DSL-specific tests (406+ cases)

## Layout Notes
- `src/lib/dsl/serializer.ts` — emits DSL; `escapeString()` (:592–598), `getExtraTags()` (:600–604), `serializeProperties()` (:106–117)
- `src/lib/dsl/dsl-strings.ts` — string encoding/decoding; holds ground truth about Structurizr escape behavior
- `src/lib/dsl/lexer.ts:150–172` — unescape path; must stay consistent with serializer strategy
- `src/types/model.ts` — `Location` type, `owner` field on `BaseElement`, `Person`, `SoftwareSystem`
- `src/lib/dsl/__fixtures__/hostile-strings.ts` — test corpus for backslashes, quotes, commas, newlines
- `.structurizr-cli/` — downloaded Structurizr CLI cache (git-ignored)

## Conventions
- Structurizr DSL has **no backslash escape syntax**; `\"` closes the string early, not an escape.
- String values must be sanitized, not escaped JSON-style.
- Tags are string values and require the same escaping/sanitizing as names/descriptions.
- Reserved Structurizr keywords: `location`, `owner` do not exist; use `External` tag and `properties { "owner" "..." }` instead.
- Keep accepting `location Internal`/`location External` and bare `owner` on import for back-compat.
- Conformance validation against real Structurizr CLI is mandatory; c4hero's own parser round-trip tests are insufficient.

## Gotchas / Recurring Catches
- **Backslash-n ground truth (critical, 2026-08-02)**: `\n` and `\t` are NOT unescaped by Structurizr — they stay two literal characters. Do NOT strip backslash runs before 'n' (treat identically to 't'). Any deviation silently corrupts Windows paths like `C:\new`, `\nightly`, etc. during round-trip.
- Parser–serializer symmetry creates false negatives in tests; mutual consistency ≠ Structurizr correctness.
- Tests encode assumptions about Structurizr behavior; verify assumptions against real CLI, not just internal round-trip tests.
- Reserved property keys in the `properties {}` block risk name collisions if not handled carefully.

## Things Checkers Should Always Verify
- Run emitted DSL through real Structurizr CLI (conformance gate) — never skip this.
- Round-trip test must preserve backslashes before 'n' byte-for-byte (e.g., `C:\new` → DSL → parse must equal `C:\new`).
- Tags containing commas or quotes must serialize to valid DSL and not split/break.
- No `location` or `owner` keywords in emitted DSL; check for `External` tag and `properties` block instead.
- `npm run dsl:conformance` and `npm run check` must both pass; passing one without the other hides bugs.
