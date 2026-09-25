// Shared chrome invokes the mounted renderer. No React Flow placeholder camera.
import type { Node } from '@xyflow/react'
import type { Workspace } from '@/types/model'
export interface ActiveCamera {
  zoomBy(factor: number): void
  fit(): void
  focus(id: string): void
  pan(dx: number, dy: number): void
  escape(): void
  getNodes?(): Node[]
  getViewport?(): { x: number; y: number; zoom: number }
  getZoom?(): number
  flowToScreenPosition?(point: { x: number; y: number }): { x: number; y: number }
  moveNodes?(positions: { id: string; x: number; y: number }[]): void
  layout?(): NonNullable<Workspace['exploreLayout']>
  exportImage?(theme: 'dark' | 'light' | 'current'): HTMLCanvasElement
  exportSVG?(theme: 'dark' | 'light' | 'current'): string
}
let active: ActiveCamera | null = null
export function registerActiveCamera(camera: ActiveCamera) { active = camera; return () => { if (active === camera) active = null } }
export function getActiveCamera() { return active }
