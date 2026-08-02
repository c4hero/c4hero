#!/usr/bin/env node
// Structurizr conformance gate.
//
// Validates every *.dsl file in the git-ignored `.conformance-dsl/` corpus
// (produced by `npm run dsl:conformance:emit`) against the REAL Structurizr
// CLI -- not c4hero's own parser, which is exactly the point: c4hero's
// serializer and parser can agree with each other while both disagreeing
// with what Structurizr actually accepts.
//
// No new dependency is added for this -- only Node built-ins, `java`, and
// the pinned CLI archive itself:
//   https://github.com/structurizr/cli/releases/download/v2025.11.09/structurizr-cli.zip
//
// Usage:
//   node scripts/structurizr-conformance.mjs             # validate the corpus
//   node scripts/structurizr-conformance.mjs --self-test  # prove the gate can fail
//
// CLI resolution order:
//   1. STRUCTURIZR_CLI_HOME, if set -- must point at a directory containing
//      structurizr.sh (or a subdirectory that does).
//   2. A cached extraction at .structurizr-cli/v2025.11.09/.
//   3. Download + extract the pinned archive into that cache directory.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'

// Pinned deliberately -- never resolve to "latest". Bumping this is a
// conscious, reviewed change, not an accident of CI picking up a new release.
const CLI_VERSION = 'v2025.11.09'
const CLI_URL = `https://github.com/structurizr/cli/releases/download/${CLI_VERSION}/structurizr-cli.zip`

const REPO_ROOT = process.cwd()
const CACHE_DIR = resolve(REPO_ROOT, '.structurizr-cli', CLI_VERSION)
const CORPUS_DIR = resolve(REPO_ROOT, '.conformance-dsl')

function log(msg) {
    console.log(msg)
}

function fail(msg) {
    console.error(`\nERROR: ${msg}`)
    process.exit(1)
}

/** Find structurizr.sh directly inside `dir`, or one level down (some zip
 *  layouts nest everything under a single top-level folder). */
function findStructurizrSh(dir) {
    if (!existsSync(dir)) return null
    const direct = join(dir, 'structurizr.sh')
    if (existsSync(direct)) return direct
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const nested = join(dir, entry.name, 'structurizr.sh')
            if (existsSync(nested)) return nested
        }
    }
    return null
}

async function downloadArchive(destZip) {
    log(`Downloading Structurizr CLI ${CLI_VERSION} from ${CLI_URL} ...`)
    let response
    try {
        response = await fetch(CLI_URL, { redirect: 'follow' })
    } catch (err) {
        fail(`could not download Structurizr CLI archive (network error): ${err.message}`)
    }
    if (!response.ok) {
        fail(`could not download Structurizr CLI archive: HTTP ${response.status} ${response.statusText}`)
    }
    const buf = Buffer.from(await response.arrayBuffer())
    writeFileSync(destZip, buf)
    log(`Downloaded ${buf.length} bytes to ${destZip}`)
}

/** Try, in order: `unzip -o`, `jar xf`, then a python3 zipfile fallback.
 *  Fails loudly (not silently) if none of the three tools are usable. */
function extractArchive(zipPath, destDir) {
    mkdirSync(destDir, { recursive: true })

    const attempts = [
        { cmd: 'unzip', args: ['-o', zipPath, '-d', destDir], cwd: REPO_ROOT },
        // `jar xf` always extracts into the current working directory.
        { cmd: 'jar', args: ['xf', resolve(zipPath)], cwd: destDir },
        {
            cmd: 'python3',
            args: ['-c', 'import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zipPath, destDir],
            cwd: REPO_ROOT,
        },
    ]

    const failures = []
    for (const attempt of attempts) {
        const result = spawnSync(attempt.cmd, attempt.args, { cwd: attempt.cwd, stdio: 'pipe', encoding: 'utf8' })
        if (result.error) {
            failures.push(`${attempt.cmd}: ${result.error.message}`)
            continue
        }
        if (result.status !== 0) {
            failures.push(`${attempt.cmd}: exit ${result.status} -- ${(result.stderr || '').trim()}`)
            continue
        }
        if (findStructurizrSh(destDir)) {
            log(`Extracted Structurizr CLI archive with \`${attempt.cmd}\`.`)
            return
        }
        failures.push(`${attempt.cmd}: ran but structurizr.sh was not found afterwards`)
    }

    fail(
        'could not extract the Structurizr CLI archive with unzip, jar, or python3. Tried:\n' +
            failures.map(f => `  - ${f}`).join('\n')
    )
}

async function resolveCli() {
    const home = process.env.STRUCTURIZR_CLI_HOME
    if (home) {
        const sh = findStructurizrSh(home)
        if (!sh) fail(`STRUCTURIZR_CLI_HOME=${home} does not contain structurizr.sh`)
        log(`Using Structurizr CLI from STRUCTURIZR_CLI_HOME=${home}`)
        return sh
    }

    const cached = findStructurizrSh(CACHE_DIR)
    if (cached) {
        log(`Using cached Structurizr CLI at ${CACHE_DIR}`)
        return cached
    }

    mkdirSync(CACHE_DIR, { recursive: true })
    const zipPath = join(CACHE_DIR, 'structurizr-cli.zip')
    await downloadArchive(zipPath)
    extractArchive(zipPath, CACHE_DIR)
    rmSync(zipPath, { force: true })

    const sh = findStructurizrSh(CACHE_DIR)
    if (!sh) fail(`extracted the archive but could not find structurizr.sh under ${CACHE_DIR}`)
    return sh
}

/** Run `structurizr.sh validate -w <file>`. Returns { ok, output }. */
function validateFile(structurizrSh, file) {
    const result = spawnSync('bash', [structurizrSh, 'validate', '-w', file], { encoding: 'utf8' })
    if (result.error) {
        fail(`could not invoke the Structurizr CLI (is \`java\` on PATH?): ${result.error.message}`)
    }
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    return { ok: result.status === 0, output }
}

async function runSelfTest(structurizrSh) {
    // Deliberately invalid: `location` is not an accepted keyword inside an
    // element block in real Structurizr (only description, tags, url,
    // properties, perspectives, group, container, -> are, per the ground
    // truth encoded in src/lib/dsl/dsl-strings.ts). This proves the gate can
    // actually fail, not just always report PASS.
    const badDsl = `workspace "Self Test" {
    model {
        s = softwareSystem "System" {
            location External
        }
    }
    views {
        systemContext s "ctx" {
            include *
        }
    }
}
`
    const dir = join(tmpdir(), `structurizr-conformance-self-test-${process.pid}`)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'self-test-invalid.dsl')
    writeFileSync(path, badDsl, 'utf8')

    log(`Self-test: validating a deliberately invalid DSL file (bare \`location\` keyword) at ${path}`)
    const { ok, output } = validateFile(structurizrSh, path)
    rmSync(dir, { recursive: true, force: true })

    if (ok) {
        fail('self-test FAILED: the Structurizr CLI accepted a file it should have rejected -- the conformance gate cannot detect real violations')
    }
    log(`Self-test PASSED: the Structurizr CLI correctly rejected the invalid file.\nCLI output:\n${output}`)
    process.exit(0)
}

async function main() {
    const selfTest = process.argv.includes('--self-test')
    const structurizrSh = await resolveCli()

    if (selfTest) {
        await runSelfTest(structurizrSh)
        return
    }

    if (!existsSync(CORPUS_DIR) || !statSync(CORPUS_DIR).isDirectory()) {
        fail(
            `corpus directory ${CORPUS_DIR} does not exist. Run \`npm run dsl:conformance:emit\` first ` +
                '(an empty/missing corpus must never be treated as a passing run).'
        )
    }

    const files = readdirSync(CORPUS_DIR)
        .filter(f => f.endsWith('.dsl'))
        .sort()
        .map(f => join(CORPUS_DIR, f))

    if (files.length === 0) {
        fail(`corpus directory ${CORPUS_DIR} contains no *.dsl files -- an empty corpus must never read as success.`)
    }

    log(`Validating ${files.length} file(s) in ${CORPUS_DIR} with Structurizr CLI ${CLI_VERSION} ...\n`)

    let failures = 0
    for (const file of files) {
        const { ok, output } = validateFile(structurizrSh, file)
        if (ok) {
            log(`PASS  ${basename(file)}`)
        } else {
            failures++
            log(`FAIL  ${basename(file)}`)
            if (output) log(output.split('\n').map(line => `      ${line}`).join('\n'))
        }
    }

    log('')
    if (failures > 0) {
        fail(`${failures} of ${files.length} file(s) failed Structurizr CLI validation.`)
    }
    log(`All ${files.length} file(s) passed Structurizr CLI validation.`)
}

main().catch(err => {
    fail(err.stack || String(err))
})
