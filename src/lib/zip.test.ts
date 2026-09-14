import { describe, expect, it } from 'vitest'
import { buildZip, crc32, zipBlob } from './zip'

/** A just-enough reader for the archives the writer produces: walks the
 *  central directory and returns each entry's name, CRC and stored bytes. */
function readZip(bytes: Uint8Array): Array<{ name: string; crc: number; data: string; flags: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()

  const endOffset = bytes.length - 22
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50)
  const count = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  expect(centralOffset + centralSize).toBe(endOffset)

  const entries: Array<{ name: string; crc: number; data: string; flags: number }> = []
  let pos = centralOffset
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50)
    const flags = view.getUint16(pos + 8, true)
    const crc = view.getUint32(pos + 16, true)
    const size = view.getUint32(pos + 24, true)
    const nameLen = view.getUint16(pos + 28, true)
    const localOffset = view.getUint32(pos + 42, true)
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen))
    pos += 46 + nameLen

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50)
    expect(view.getUint16(localOffset + 8, true)).toBe(0) // stored, not deflated
    const localNameLen = view.getUint16(localOffset + 26, true)
    const dataStart = localOffset + 30 + localNameLen
    const data = decoder.decode(bytes.subarray(dataStart, dataStart + size))
    entries.push({ name, crc, data, flags })
  }
  return entries
}

describe('crc32', () => {
  it('matches the reference values', () => {
    const enc = new TextEncoder()
    expect(crc32(enc.encode(''))).toBe(0)
    expect(crc32(enc.encode('hello'))).toBe(0x3610a686)
    expect(crc32(enc.encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})

describe('buildZip', () => {
  it('writes readable stored entries with correct CRCs and sizes', () => {
    const bytes = buildZip([
      { path: 'index.md', content: 'hello' },
      { path: 'systems/shop.md', content: '# Shop\n' },
    ])
    const entries = readZip(bytes)
    expect(entries.map((e) => e.name)).toEqual(['index.md', 'systems/shop.md'])
    expect(entries[0].data).toBe('hello')
    expect(entries[0].crc).toBe(0x3610a686)
    expect(entries[1].data).toBe('# Shop\n')
  })

  it('flags names as UTF-8 and round-trips non-ASCII paths and content', () => {
    const entries = readZip(buildZip([{ path: 'systèmes/café.md', content: 'naïve — ok' }]))
    expect(entries[0].flags & 0x0800).toBe(0x0800)
    expect(entries[0].name).toBe('systèmes/café.md')
    expect(entries[0].data).toBe('naïve — ok')
  })

  it('handles an empty archive', () => {
    const bytes = buildZip([])
    expect(bytes.length).toBe(22)
    expect(readZip(bytes)).toEqual([])
  })

  it('is deterministic', () => {
    const files = [{ path: 'a.md', content: 'A' }, { path: 'b/c.md', content: 'C' }]
    expect(buildZip(files)).toEqual(buildZip(files))
  })

  it('refuses more entries than the format can count', () => {
    const many = Array.from({ length: 0x10000 }, (_, i) => ({ path: `f${i}.md`, content: '' }))
    // 65535 is fine; one more would wrap the 16-bit count into a corrupt archive.
    expect(() => buildZip(many.slice(0, 0xffff))).not.toThrow()
    expect(() => buildZip(many)).toThrow(/Too many files/)
  })

  it('wraps the bytes in a zip Blob', () => {
    const blob = zipBlob([{ path: 'a.md', content: 'A' }])
    expect(blob.type).toBe('application/zip')
    expect(blob.size).toBe(buildZip([{ path: 'a.md', content: 'A' }]).length)
  })
})
