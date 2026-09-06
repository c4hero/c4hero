import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, test } from 'vitest'
import { parseDSL, serializeDSL } from './index'

describe('Custom elements roundtrip', () => {
  const fixtures = ['01-custom-only', '02-mixed', '03-custom-views']

  for (const fixture of fixtures) {
    it(`parses ${fixture} and matches json`, () => {
      const dsl = readFileSync(join(__dirname, '__fixtures__/custom', `${fixture}.dsl`), 'utf-8')
      const expectedJson = JSON.parse(readFileSync(join(__dirname, '__fixtures__/custom', `${fixture}.json`), 'utf-8'))
      
      // 1. Parse
      const { workspace: parsed1, errors: errors1 } = parseDSL(dsl)
      expect(errors1).toHaveLength(0) // RED: parser currently rejects custom elements
      
      // 4. Assert custom elements exist and match expected
      expect(parsed1.model.customElements).toBeDefined()
      
      // Clean up parsed1 memory model to match expected JSON Structurizr format
      const cleanedCustoms = parsed1.model.customElements?.map(e => {
         const cleaned = { ...e }
         if (cleaned.tags) cleaned.tags = cleaned.tags.join(',')
         if (cleaned.properties && Object.keys(cleaned.properties).length === 0) delete cleaned.properties
         
         if (cleaned.relationships && cleaned.relationships.length === 0) {
            const exp = expectedJson.model.customElements.find(e => e.id === cleaned.id)
            if (exp && !exp.relationships) delete cleaned.relationships
         }
         if (cleaned.relationships) {
            cleaned.relationships = cleaned.relationships.map(r => {
               const rr = { ...r }
               if (rr.id.startsWith('rel-')) rr.id = rr.id.replace('rel-', '')
               if (rr.properties && Object.keys(rr.properties).length === 0) delete rr.properties
               if (rr.tags) delete rr.tags
               if (rr.technology === undefined) delete rr.technology
               if (rr.url === undefined) delete rr.url
               if (rr.linkedRelationshipId === undefined) delete rr.linkedRelationshipId
               return rr
            })
         }
         return cleaned
      })
      
      expect(cleanedCustoms).toEqual(expectedJson.model.customElements)
      
      // 5. Assert custom views exist and match expected (if applicable)
      if (expectedJson.views?.customViews) {
        expect(parsed1.views.customViews).toBeDefined()
        const cleanedViews = parsed1.views.customViews.map(v => {
           const cv = { ...v }
           delete cv.type
           if (cv.autoLayout) {
               cv.autoLayout = { ...cv.autoLayout }
               if (cv.autoLayout.direction === 'LR') cv.autoLayout.direction = 'LeftRight'
               if (cv.autoLayout.direction === 'TB') cv.autoLayout.direction = 'TopBottom'
           }
           if (cv.relationships) {
               cv.relationships = cv.relationships.map(r => ({ ...r, id: r.id.replace(/^rel-/, '') }))
           }
           return cv
        })
        expect(cleanedViews).toEqual(expectedJson.views.customViews)
      }
    })

    it(`roundtrips ${fixture}`, () => {
      const dsl = readFileSync(join(__dirname, '__fixtures__/custom', `${fixture}.dsl`), 'utf-8')
      const expectedJson = JSON.parse(readFileSync(join(__dirname, '__fixtures__/custom', `${fixture}.json`), 'utf-8'))
      
      // 1. Parse
      const { workspace: parsed1, errors: errors1 } = parseDSL(dsl)
      expect(errors1).toHaveLength(0) 
      
      // 2. Serialize
      const serialized = serializeDSL(parsed1)
      
      // 3. Parse again
      const { workspace: parsed2, errors: errors2 } = parseDSL(serialized)
      expect(errors2).toHaveLength(0)
      
      // 4. Assert canonical emission equality
      const serialized2 = serializeDSL(parsed2)
      expect(serialized2).toEqual(serialized)
    })
  }
})
