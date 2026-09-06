import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import type { Model } from '@/types/model'

const execAsync = promisify(exec)

function isObject(val: any): val is Record<string, any> {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
}

export function canonicalize(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(canonicalize)
    }
    if (isObject(obj)) {
        const sortedKeys = Object.keys(obj).sort()
        const result: Record<string, any> = {}
        for (const key of sortedKeys) {
            // Strip volatile fields as per o-2
            if (key === 'lastModifiedDate' || key === 'id' || key.endsWith('Date')) {
                continue
            }
            result[key] = canonicalize(obj[key])
        }
        return result
    }
    return obj
}

export async function ValidateDsl(dsl: string): Promise<{ ok: boolean; canonicalJson?: unknown; errors: string[] }> {
    const structurizrPath = process.env.STRUCTURIZR_CLI_PATH

    // 1. Try Java sidecar (preferred)
    if (structurizrPath && fs.existsSync(structurizrPath)) {
        const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.structurizr-'))
        const dslPath = path.join(tmpDir, 'workspace.dsl')
        const jsonPath = path.join(tmpDir, 'workspace.json')
        fs.writeFileSync(dslPath, dsl, 'utf8')
        try {
            await execAsync(`java -jar "${structurizrPath}" export -w "${dslPath}" -f json`)
            if (fs.existsSync(jsonPath)) {
                const rawJson = fs.readFileSync(jsonPath, 'utf8')
                return { ok: true, canonicalJson: canonicalize(JSON.parse(rawJson)), errors: [] }
            }
            return { ok: false, errors: ['Failed to produce workspace.json'] }
        } catch (e: any) {
            const output = (e.stdout || '') + '\n' + (e.stderr || '')
            const errors = output.split('\n').filter((l: string) => l.includes('Exception') || l.includes('Error'))
            return { ok: false, errors: errors.length ? errors : [e.message] }
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    }

    // 2. Docker one-shot fallback w/ named volume (as per o-1 rule)
    const volName = `structurizr-vol-${Date.now()}-${Math.random().toString(36).substring(7)}`
    try {
        await execAsync(`docker volume create ${volName}`)
        
        // Write DSL to volume using alpine
        await new Promise<void>((resolve, reject) => {
            const child = exec(`docker run -i --rm -v ${volName}:/usr/local/structurizr alpine sh -c "cat > /usr/local/structurizr/workspace.dsl && chmod 777 /usr/local/structurizr/workspace.dsl && chmod 777 /usr/local/structurizr"`, (err: any) => {
                if (err) reject(err)
                else resolve()
            })
            child.stdin?.write(dsl)
            child.stdin?.end()
        })

        // Run structurizr export
        try {
            await execAsync(`docker run --rm -v ${volName}:/usr/local/structurizr structurizr/structurizr export -w /usr/local/structurizr/workspace.dsl -f json`)
        } catch (e: any) {
            const output = (e.stdout || '') + '\n' + (e.stderr || '')
            const errors = output.split('\n').filter((l: string) => l.includes('Exception') || l.includes('Error'))
            return { ok: false, errors: errors.length ? errors : [e.message] }
        }

        // Read resulting JSON
        const { stdout } = await execAsync(`docker run --rm -v ${volName}:/usr/local/structurizr alpine cat /usr/local/structurizr/workspace.json`)
        return { ok: true, canonicalJson: canonicalize(JSON.parse(stdout)), errors: [] }
    } catch (e: any) {
        return { ok: false, errors: [e.message] }
    } finally {
        await execAsync(`docker volume rm ${volName}`).catch(() => {})
    }
}

export function diffModels(c4heroModel: Model, oracleCanonical: any): string[] {
    const mismatches: string[] = []
    
    // Minimal diff harness for o-3: compare c4heroModel entities to oracleCanonical model
    const oracleModel = oracleCanonical?.model || {}
    const oracleSystems = oracleModel.softwareSystems || []
    const oracleContainers = oracleSystems.flatMap((s: any) => s.containers || [])
    const oracleCustomElements = oracleModel.customElements || []

    // Ensure all c4heroModel software systems exist in oracle
    for (const sys of c4heroModel.softwareSystems || []) {
        const found = oracleSystems.find((s: any) => s.name === sys.name)
        if (!found) {
            mismatches.push(`Model mismatch: SoftwareSystem "${sys.name}" is missing in oracle canonical DSL output.`)
        } else if (found.description !== sys.description && sys.description) {
            mismatches.push(`Model mismatch: SoftwareSystem "${sys.name}" description mismatch. Expected "${sys.description}", got "${found.description}"`)
        }
    }

    // Do the same for containers if there are any
    for (const sys of c4heroModel.softwareSystems || []) {
        for (const container of sys.containers || []) {
            const found = oracleContainers.find((c: any) => c.name === container.name)
            if (!found) {
                mismatches.push(`Model mismatch: Container "${container.name}" is missing in oracle canonical DSL output.`)
            }
        }
    }

    // Custom elements check (c4hero might store them in customElements)
    const heroCustomElements = (c4heroModel as any).customElements || []
    for (const el of heroCustomElements) {
        const found = oracleCustomElements.find((e: any) => e.name === el.name)
        if (!found) {
            mismatches.push(`Model mismatch: Custom element "${el.name}" is missing in oracle canonical DSL output.`)
        }
    }

    return mismatches
}

export async function assertSaveSafe(dsl: string): Promise<void> {
    const result = await ValidateDsl(dsl)
    if (!result.ok) {
        throw new Error('DSL validation failed: ' + result.errors.join(', '))
    }
}
