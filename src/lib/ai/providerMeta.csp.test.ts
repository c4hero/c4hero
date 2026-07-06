import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AI_PROVIDER_META, AI_PROVIDER_IDS } from './providerMeta'

// The browser only reaches a provider if its host is allow-listed in the
// connect-src of BOTH static CSP copies — the dev/preview meta tag in
// index.html and the production header in vercel.json. Those strings can't
// read AI_PROVIDER_META at runtime, so this test is the link: add a provider
// (or change an endpointHost) without updating the CSPs and it fails here
// instead of as a silent connection error in the app.

const CSP_FILES = ['index.html', 'vercel.json']

function connectSrc(text: string, name: string): string {
  const m = text.match(/connect-src ([^;"]+)/)
  if (!m) throw new Error(`no connect-src directive found in ${name}`)
  return m[1]
}

describe('static CSPs allow every AI provider host', () => {
  for (const name of CSP_FILES) {
    it(`${name} connect-src lists every endpointHost`, () => {
      const src = connectSrc(readFileSync(resolve(process.cwd(), name), 'utf8'), name)
      for (const id of AI_PROVIDER_IDS) {
        const host = AI_PROVIDER_META[id].endpointHost
        expect(src, `${host} (${id}) missing from ${name} connect-src`).toContain(`https://${host}`)
      }
    })
  }
})
