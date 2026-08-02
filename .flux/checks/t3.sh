#!/usr/bin/env bash
# Task: Serializer: emit only Structurizr-valid keywords (External tag, properties, lowercase autoLayout) (t3)
# Run: run-2026-08-02T14-20-47-900Z-hrxwc
set -euo pipefail

test -f src/lib/dsl/structurizr-emit.test.ts
test -z "$(grep -n "emit('location External')" src/lib/dsl/serializer.ts || true)"
test -z "$(grep -n 'owner \"' src/lib/dsl/serializer.ts || true)"
grep -q 'c4hero.status' src/lib/dsl/serializer.ts
grep -q 'c4hero.lineStyle' src/lib/dsl/serializer.ts
npx vitest run src/lib/dsl
test -z "$(grep -rn '\.skip(\|\.only(' src/lib/dsl || true)"
npx tsc -b
