#!/usr/bin/env bash
# Task: Structurizr-correct string escaping + legacy-escape-aware lexer (t1)
# Run: run-2026-08-02T14-20-47-900Z-hrxwc
set -euo pipefail

test -f src/lib/dsl/dsl-strings.ts
grep -q 'export function escapeDslString' src/lib/dsl/dsl-strings.ts
grep -q 'export function sanitizeTag' src/lib/dsl/dsl-strings.ts
grep -q 'export function detectLegacyEscapes' src/lib/dsl/lexer.ts
test -f src/lib/dsl/string-encoding.test.ts
npx vitest run src/lib/dsl/string-encoding.test.ts src/lib/dsl/serializer.test.ts src/lib/dsl/lexer.gaps.test.ts src/lib/dsl/roundtrip.test.ts
test -z "$(grep -rn '\.only(' src/lib/dsl || true)"
