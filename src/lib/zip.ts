/**
 * A minimal ZIP writer: "store" (no compression) entries only, which is all a
 * bundle of small markdown files needs. Hand-rolled rather than pulled in as a
 * dependency because the format is ~40 lines of headers and the app has no
 * other use for an archive library.
 *
 * Deterministic: entries carry a fixed 1980-01-01 timestamp, so the same
 * input produces byte-identical archives. Names are UTF-8 (general-purpose
 * flag bit 11), so non-ASCII paths unpack correctly everywhere.
 */

export interface ZipEntry {
  /** Path inside the archive, `/`-separated. */
  path: string
  content: string
}

export function buildZip(entries: ReadonlyArray<ZipEntry>): Uint8Array<ArrayBuffer> {
  // The end-of-central-directory record counts entries in 16 bits. Past that
  // the count wraps and the archive is silently unreadable, so refuse rather
  // than hand back something corrupt. (ZIP64 lifts the limit; a bundle of
  // markdown files has no business getting near it.)
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`Too many files for one archive: ${entries.length} (the ZIP format allows ${MAX_ENTRIES})`)
  }
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const data = encoder.encode(entry.content)
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, LOCAL_SIG, true)
    lv.setUint16(4, VERSION_NEEDED, true)
    lv.setUint16(6, FLAG_UTF8, true)
    lv.setUint16(8, METHOD_STORE, true)
    lv.setUint16(10, DOS_TIME, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, CENTRAL_SIG, true)
    cv.setUint16(4, VERSION_MADE_BY, true)
    cv.setUint16(6, VERSION_NEEDED, true)
    cv.setUint16(8, FLAG_UTF8, true)
    cv.setUint16(10, METHOD_STORE, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attributes
    cv.setUint32(38, 0, true) // external attributes
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, END_SIG, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const out = new Uint8Array(offset + centralSize + end.length)
  let pos = 0
  for (const chunk of [...locals, ...centrals, end]) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  return out
}

export function zipBlob(entries: ReadonlyArray<ZipEntry>): Blob {
  return new Blob([buildZip(entries)], { type: 'application/zip' })
}

/** Entries addressable by the 16-bit counts in the end-of-central-directory. */
const MAX_ENTRIES = 0xffff
const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50
const VERSION_NEEDED = 20
const VERSION_MADE_BY = 20
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0
const DOS_TIME = 0
/** 1980-01-01: year 0 since 1980, month 1, day 1. */
const DOS_DATE = (1 << 5) | 1

let crcTable: Uint32Array | null = null

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
