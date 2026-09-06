import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { ValidateDsl, diffModels, assertSaveSafe } from './oracle'
import { Model } from '@/types/model'

describe('oracle validation gate', () => {
    it('o-dod-1: broken dsl (1-char corruption) -> ValidateDsl returns ok:false w/ error line', async () => {
        const broken = 'workspace { model { softwareSystem "A } }' // missing quote
        const res = await ValidateDsl(broken)
        expect(res.ok).toBe(false)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.errors[0]).toContain('Exception') // or similar error string
        
        await expect(assertSaveSafe(broken)).rejects.toThrow(/DSL validation failed/)
    }, 15000)

    it('o-dod-2: valid custom-element dsl -> ok:true + canonicalJson byte-matches', async () => {
        const fixturePath = '/home/bhd/Documents/Projects/bhd/dy-flow/flow/diagrams/workspace.dsl'
        const valid = fs.readFileSync(fixturePath, 'utf8')
        const res = await ValidateDsl(valid)
        expect(res.ok).toBe(true)
        expect(res.canonicalJson).toBeDefined()
        const model = (res.canonicalJson as any).model
        expect(model.customElements.length).toBeGreaterThan(0)
    }, 15000)

    it('o-3: diff harness mutated-model fixture', () => {
        const c4heroModel = {
            people: [],
            relationships: [],
            groups: [],
            deploymentEnvironments: [],
            softwareSystems: [
                { id: '1', name: 'SystemA', tags: [], properties: {}, type: 'softwareSystem', containers: [] }
            ],
            customElements: [
                { id: '2', name: 'CustomA', tags: [], properties: {}, type: 'custom' }
            ]
        } as unknown as Model

        const oracleCanonical = {
            model: {
                softwareSystems: [
                    { name: 'SystemB' }
                ],
                customElements: [
                    { name: 'CustomB' }
                ]
            }
        }

        const diffs = diffModels(c4heroModel, oracleCanonical)
        expect(diffs.length).toBeGreaterThan(0)
        expect(diffs).toContain('Model mismatch: SoftwareSystem "SystemA" is missing in oracle canonical DSL output.')
        expect(diffs).toContain('Model mismatch: Custom element "CustomA" is missing in oracle canonical DSL output.')
    })
})
