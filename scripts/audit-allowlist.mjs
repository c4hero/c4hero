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
  'GHSA-g3hv-75wg-m249': {
    package: 'minimatch',
    reason:
      'DoS via globParts amplification in the first/second-phase preprocess, ' +
      'reachable only from an attacker-supplied glob pattern with ' +
      'optimizationLevel >= 2. Only a dev/build-time transitive; never bundled ' +
      'or shipped to users. The 3.x (eslint 9, @eslint/*) and 5.x (filelist ' +
      '<- jake <- ejs <- rollup-plugin-off-main-thread <- workbox-build) ' +
      'copies predate that code path entirely. The 10.x copy ' +
      '(@typescript-eslint/typescript-estree) is only called for projectService ' +
      'allowDefaultProject, which we do not enable, and at level 1. glob is ' +
      'the one consumer that sets level 2; it stays on patched 14.x via the ' +
      'workbox-build override (and glob <14.0.2 trips GHSA-3g3m-2fjr-6pw4). ' +
      'The patched 11.x line has no backport, and forcing it eight majors up ' +
      'under eslint 9 was judged riskier than this unreachable path. Re-check ' +
      'when eslint/typescript-eslint or workbox-build drop the old lines.',
    review: '2027-01-31',
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
