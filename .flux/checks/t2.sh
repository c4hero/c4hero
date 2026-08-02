#!/usr/bin/env bash
# Task: Parser: accept External tag and c4hero properties on import, keep legacy keywords (t2)
# Run: run-2026-08-02T14-20-47-900Z-hrxwc
set -euo pipefail

test -f src/lib/dsl/import-compat.test.ts
grep -q 'c4hero.status' src/lib/dsl/parser-model.ts
grep -q 'c4hero.lineStyle' src/lib/dsl/parser-relationship.ts
grep -q 'c4hero.interactionStyle' src/lib/dsl/parser-relationship.ts
npx vitest run src/lib/dsl/import-compat.test.ts src/lib/dsl/location-roundtrip.test.ts src/lib/dsl/status-owner-roundtrip.test.ts src/lib/dsl/properties-roundtrip.test.ts src/lib/dsl/parser.test.ts src/lib/dsl/interaction-style-roundtrip.test.ts
