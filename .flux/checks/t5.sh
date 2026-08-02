#!/usr/bin/env bash
# Task: Wire the conformance gate into CI and record the change (t5)
# Run: run-2026-08-02T14-20-47-900Z-hrxwc
set -euo pipefail

python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); j=d['jobs']; assert 'dsl-conformance' in j, 'missing job'; s=j['dsl-conformance']['steps']; txt=str(s); assert 'npm run dsl:conformance' in txt, 'job does not run the gate'; assert 'setup-java' in txt, 'no java setup'; assert not j['dsl-conformance'].get('continue-on-error'), 'gate is non-blocking'; [k for k in ['lint-and-typecheck','test','e2e','build','security','secret-scan'] if k in j] == ['lint-and-typecheck','test','e2e','build','security','secret-scan'] or sys.exit('existing jobs missing')"
grep -q 'External' CHANGELOG.md
grep -qi 'structurizr cli' CHANGELOG.md
test -z "$(printf '%s\n' "$FLUX_CHANGED_PATHS" | grep -v '^$' | grep -vE '^(\.github/workflows/ci\.yml|CHANGELOG\.md)$')"
