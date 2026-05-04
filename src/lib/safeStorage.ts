// Defensive localStorage wrappers.
//
// Multiple call sites previously repeated the same try/catch + JSON.parse
// pattern with their own ad-hoc validation. This module centralizes that
// pattern so storage I/O failures, quota errors, JSON parse errors, and
// shape mismatches are handled the same way everywhere — and so a swap to
// a different backend (IndexedDB, ESM module storage) only touches one
// file.

import { createLogger } from './logger'

const log = createLogger('safeStorage')

/** Read raw string. Returns null if storage is unavailable, the key is
 *  missing, or any error is thrown. Never throws. */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (err) {
    log.warn('localStorage read failed', { key, err })
    return null
  }
}

/** Write a raw string. Silently no-ops on quota/availability errors. */
export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    log.warn('localStorage write failed', { key, err })
  }
}

/** Remove a key. Never throws. */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (err) {
    log.warn('localStorage remove failed', { key, err })
  }
}

/** Read + JSON.parse + validate. Returns the fallback when the key is
 *  missing, parsing fails, or the validator rejects the parsed shape. */
export function readJSON<T>(
  key: string,
  validate: (value: unknown) => value is T,
  fallback: T | null = null,
): T | null {
  const raw = readString(key)
  if (raw === null) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    return validate(parsed) ? parsed : fallback
  } catch (err) {
    log.warn('localStorage parse failed', { key, err })
    return fallback
  }
}

/** JSON.stringify + write. Silently no-ops on serialization or quota errors. */
export function writeJSON(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value))
  } catch (err) {
    log.warn('localStorage stringify failed', { key, err })
  }
}
