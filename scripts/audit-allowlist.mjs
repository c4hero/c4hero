#!/usr/bin/env node
// Security audit gate with a documented allowlist.
//
// Replaces a bare `npm audit --audit-level=moderate` so we can suppress
// specific advisories that (a) have no available fix and (b) do not apply to
// how this app actually runs — while still failing CI on every other
// moderate-or-higher advisory. Each entry MUST carry a reason and a review
// date so allowlisting can never become a silent, permanent bypass.
//
// To review: run `npm audit` for the full report. To un-allowlist, delete the
// entry and let CI tell you what breaks.

import { execSync } from 'node:child_process'

const AUDIT_LEVEL = 'moderate' // fail on moderate | high | critical
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }
const THRESHOLD = SEVERITY_RANK[AUDIT_LEVEL]

/**
 * GHSA ids we knowingly accept, each with a justification and a re-review date.
 * Keep this list SHORT and revisit on each date — an available fix or a
 * changed usage assumption means the entry should go.
 */
const ALLOWLIST = {
  'GHSA-mh99-v99m-4gvg': {
    package: 'brace-expansion',
    reason:
      'DoS via unbounded brace expansion. Only a dev/build-time transitive ' +
      '(minimatch <- glob/eslint/rollup); never bundled or shipped to users. ' +
      'The sole patched release (5.0.8) is ESM-only and breaks the CJS ' +
      'consumers that pull the vulnerable 1.x/2.x lines ("expand is not a ' +
      'function"); no backport exists. Re-check when a CJS-compatible patch ships.',
    review: '2026-10-01',
  },
}

function runAudit() {
  try {
    const out = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return JSON.parse(out)
  } catch (err) {
    // `npm audit` exits non-zero when vulnerabilities exist; the JSON is still
    // on stdout. Only a genuinely unparseable payload is a hard error.
    if (err.stdout) {
      try { return JSON.parse(err.stdout) } catch { /* fall through */ }
    }
    console.error('audit-allowlist: could not run/parse `npm audit --json`')
    console.error(err.message)
    process.exit(2)
  }
}

const report = runAudit()
const vulns = report.vulnerabilities ?? {}

// Collect every distinct advisory (GHSA) at or above the threshold.
const seen = new Map() // ghsa -> { title, severity, package }
for (const v of Object.values(vulns)) {
  for (const via of v.via) {
    if (typeof via !== 'object' || !via.url) continue
    const ghsa = via.url.split('/').pop()
    if ((SEVERITY_RANK[via.severity] ?? 0) < THRESHOLD) continue
    if (!seen.has(ghsa)) seen.set(ghsa, { title: via.title, severity: via.severity, package: via.name })
  }
}

const allowed = []
const blocking = []
for (const [ghsa, info] of seen) {
  if (ALLOWLIST[ghsa]) allowed.push([ghsa, info])
  else blocking.push([ghsa, info])
}

if (allowed.length > 0) {
  console.log(`audit-allowlist: ${allowed.length} advisory(ies) suppressed by allowlist:`)
  for (const [ghsa, info] of allowed) {
    console.log(`  - ${ghsa} (${info.severity}) ${info.package} — review by ${ALLOWLIST[ghsa].review}`)
  }
}

if (blocking.length > 0) {
  console.error(`\naudit-allowlist: ${blocking.length} advisory(ies) at or above "${AUDIT_LEVEL}" not allowlisted:`)
  for (const [ghsa, info] of blocking) {
    console.error(`  - ${ghsa} (${info.severity}) ${info.package}: ${info.title}`)
  }
  console.error('\nRun `npm audit` for the full report. Fix them, or add a justified allowlist entry.')
  process.exit(1)
}

console.log(`audit-allowlist: no un-allowlisted advisories at or above "${AUDIT_LEVEL}".`)
