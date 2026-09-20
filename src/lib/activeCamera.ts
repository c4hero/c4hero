// Shared chrome invokes the mounted renderer. No React Flow placeholder camera.
export interface ActiveCamera {
  zoomBy(factor: number): void
  fit(): void
  focus(id: string): void
  pan(dx: number, dy: number): void
  escape(): void
}
let active: ActiveCamera | null = null
export function registerActiveCamera(camera: ActiveCamera) { active = camera; return () => { if (active === camera) active = null } }
export function getActiveCamera() { return active }
