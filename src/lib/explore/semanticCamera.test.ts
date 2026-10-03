import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactFlowInstance } from '@xyflow/react'
import { createBigBankSample } from '@/lib/templates'
import { useWorkspaceStore } from '@/store/workspace'
import { buildLayout } from './layout'
import { SemanticCamera } from './semanticCamera'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

function setup() {
  const workspace = createBigBankSample()
  useWorkspaceStore.getState().loadWorkspace(workspace)
  const host = document.createElement('div')
  document.body.append(host)
  host.getBoundingClientRect = () => new DOMRect(0, 0, 400, 800)
  let viewport = { x: 0, y: 0, zoom: 1 }
  const setViewport = vi.fn((next: typeof viewport) => { viewport = next; return Promise.resolve(true) })
  const rf = { getViewport: () => viewport, getZoom: () => viewport.zoom, setViewport } as unknown as ReactFlowInstance
  const changed = vi.fn()
  const camera = new SemanticCamera(host, rf, buildLayout(workspace), changed)
  return { camera, host, changed, workspace, setViewport }
}

it('keeps a focused child centered after late native measurements refit its layout', () => {
  const { camera, workspace } = setup()
  try {
    camera.focus('apiApp')
    vi.advanceTimersByTime(2500)
    const next = buildLayout(workspace)
    const child = next.byId.get('apiApp')!
    child.x += 100
    child.y += 70
    child.width *= 2
    child.height *= 2
    camera.update(next)
    vi.advanceTimersByTime(2500)
    const viewport = camera.getViewport()
    expect((child.x + child.width / 2) * viewport.zoom + viewport.x).toBeCloseTo(200, 1)
    expect((child.y + child.height / 2) * viewport.zoom + viewport.y).toBeCloseTo(400, 1)
    expect(child.width * viewport.zoom).toBeLessThanOrEqual(281)
  } finally { camera.dispose() }
})

it('disposal cancels pending focus, motion, hints and wheel interception', () => {
  const { camera, host, setViewport, changed } = setup()
  camera.focus('apiApp')
  camera.zoomBy(1.2)
  const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
  host.dispatchEvent(wheel)
  expect(wheel.defaultPrevented).toBe(true)
  camera.dispose()
  setViewport.mockClear(); changed.mockClear()
  vi.advanceTimersByTime(5000)
  expect(setViewport).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()
  expect(host.hasAttribute('data-zoom-active')).toBe(false)
  const after = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
  host.dispatchEvent(after)
  expect(after.defaultPrevented).toBe(false)
})

it('uses gesture timestamps for inertia even when the release callback is delayed', () => {
  const { camera } = setup()
  const eventAt = (type: string, timeStamp: number) => {
    const event = new MouseEvent(type)
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    return event
  }
  try {
    camera.onMove(eventAt('mousemove', 10), { x: 10, y: 0, zoom: 1 })
    camera.onMove(eventAt('mousemove', 26), { x: 30, y: 0, zoom: 1 })
    vi.advanceTimersByTime(200)
    camera.onMoveEnd(eventAt('mouseup', 27))
    vi.advanceTimersByTime(32)
    expect(camera.getViewport().x).toBeGreaterThan(1)
    camera.interrupt()
    const stopped = camera.getViewport().x
    camera.onMove(eventAt('mousemove', 300), { x: 40, y: 0, zoom: 1 })
    camera.onMove(eventAt('mousemove', 316), { x: 60, y: 0, zoom: 1 })
    camera.onMoveEnd(eventAt('mouseup', 500))
    vi.advanceTimersByTime(200)
    expect(camera.getViewport().x).toBe(stopped)
  } finally { camera.dispose() }
})
