import { readJSON, writeJSON } from '@/lib/safeStorage'
import type { Camera } from './motion'
const key = (identity: string) => `c4hero.explore.camera.v2:${identity}`
export function loadExploreCamera(identity: string): Camera | null {
  return readJSON(key(identity), (v): v is Camera => typeof v === 'object' && v !== null &&
    'x' in v && typeof v.x === 'number' && Number.isFinite(v.x) &&
    'y' in v && typeof v.y === 'number' && Number.isFinite(v.y) &&
    'zoom' in v && typeof v.zoom === 'number' && Number.isFinite(v.zoom) && v.zoom >= .003 && v.zoom <= 10000)
}
export function saveExploreCamera(identity: string, camera: Camera) { writeJSON(key(identity), camera) }
