import type { Node, ReactFlowInstance } from '@xyflow/react'

const CHROME_CLEARANCE = 14
// The top pill is now left-aligned and narrow, so it no longer dominates
// the top strip — content can sit closer to the pill's bottom edge.
const TOP_CHROME_CLEARANCE = 4
const DEFAULT_PADDING = 0.05
const DEFAULT_DURATION = 300
const DEFAULT_MIN_ZOOM = 0.1
const DEFAULT_MAX_ZOOM = 2
const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 100

type ChromeSide = 'top' | 'right' | 'bottom' | 'left'

interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface FitInsets {
  top: number
  right: number
  bottom: number
  left: number
}

interface FitOptions {
  duration?: number
  padding?: number
  minZoom?: number
  maxZoom?: number
}

export const CANVAS_FIT_CHROME_ATTRIBUTE = 'data-canvas-fit-chrome'

export function isContentFitNode(node: Pick<Node, 'id'>): boolean {
  return !node.id.startsWith('__scope_boundary__') && !node.id.startsWith('group-')
}

export function fitContentNodesToViewport(
  reactFlow: ReactFlowInstance | null | undefined,
  options: FitOptions = {},
): boolean {
  if (!reactFlow) return false
  // Fit content PLUS group/scope boundaries so no outline or boundary label gets
  // clipped behind the chrome — but drop overlay (boundary/group) nodes that
  // aren't measured yet. Those carry no intrinsic size, so getNodeBounds would
  // fall back to a 200×100 box at their (often stale/origin) position and skew or
  // off-center the fit. Content nodes always count: they keep layout dimensions
  // even before React Flow remeasures, so the diagram still frames correctly.
  // (This differs intentionally from the canvas's on-view-change auto-fit, which
  // frames content tightly; "Fit to screen" deliberately also shows boundaries.)
  const all = reactFlow.getNodes()
  const nodes = all.filter(
    (n) => isContentFitNode(n) || (n.measured?.width != null && n.measured?.height != null),
  )
  // If filtering left nothing (e.g. an empty scoped view whose only node is a
  // not-yet-measured boundary), fall back to all nodes so the fit still runs
  // rather than silently no-op'ing.
  return fitNodesToViewport(reactFlow, nodes.length ? nodes : all, options)
}

export function fitNodesToViewport(
  reactFlow: ReactFlowInstance,
  nodes: Node[],
  options: FitOptions = {},
): boolean {
  const canvas = getReactFlowCanvasRect()
  if (!canvas || canvas.width < 1 || canvas.height < 1) return false

  const bounds = getNodeBounds(nodes)
  if (!bounds) return false

  const padding = options.padding ?? DEFAULT_PADDING
  const insets = getCanvasFitInsets(canvas)
  // Mirror horizontal insets so single-sided chrome (e.g. tool rail on the
  // left, no panel on the right) doesn't push the fitted diagram off-center.
  const horizontal = Math.max(insets.left, insets.right)
  insets.left = insets.right = horizontal
  // Fixed bottom margin — vertical asymmetry is intentional: the top pill
  // reserves what it needs, the bottom only reserves a minimum gutter.
  insets.bottom = Math.max(insets.bottom, 16)
  const usableWidth = Math.max(1, canvas.width - insets.left - insets.right)
  const usableHeight = Math.max(1, canvas.height - insets.top - insets.bottom)
  const paddedWidth = Math.max(1, usableWidth * (1 - padding * 2))
  const paddedHeight = Math.max(1, usableHeight * (1 - padding * 2))
  const minZoom = options.minZoom ?? DEFAULT_MIN_ZOOM
  const maxZoom = options.maxZoom ?? DEFAULT_MAX_ZOOM
  const zoom = Math.max(minZoom, Math.min(paddedWidth / bounds.width, paddedHeight / bounds.height, maxZoom))

  const usableCenterX = insets.left + usableWidth / 2
  const usableCenterY = insets.top + usableHeight / 2

  reactFlow.setViewport(
    {
      x: usableCenterX - bounds.centerX * zoom,
      y: usableCenterY - bounds.centerY * zoom,
      zoom,
    },
    { duration: options.duration ?? DEFAULT_DURATION },
  )
  return true
}

export function getCanvasFitInsets(canvas: RectLike): FitInsets {
  const insets: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof document === 'undefined') return insets

  const chromeElements = document.querySelectorAll<HTMLElement>(`[${CANVAS_FIT_CHROME_ATTRIBUTE}]`)
  for (const element of chromeElements) {
    const side = element.getAttribute(CANVAS_FIT_CHROME_ATTRIBUTE) as ChromeSide | null
    if (!side) continue

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || !rectsOverlap(canvas, rect)) continue

    if (side === 'top') {
      insets.top = Math.max(insets.top, Math.max(0, rect.bottom - canvas.top + TOP_CHROME_CLEARANCE))
    } else if (side === 'right') {
      insets.right = Math.max(insets.right, Math.max(0, canvas.right - rect.left + CHROME_CLEARANCE))
    } else if (side === 'bottom') {
      insets.bottom = Math.max(insets.bottom, Math.max(0, canvas.bottom - rect.top + CHROME_CLEARANCE))
    } else if (side === 'left') {
      insets.left = Math.max(insets.left, Math.max(0, rect.right - canvas.left + CHROME_CLEARANCE))
    }
  }

  return insets
}

function getReactFlowCanvasRect(): DOMRect | null {
  if (typeof document === 'undefined') return null
  const element = document.querySelector('.react-flow') as HTMLElement | null
  return element?.getBoundingClientRect() ?? null
}

function getNodeBounds(nodes: Node[]): { centerX: number; centerY: number; width: number; height: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH
    const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  }

  if (!isFinite(minX)) return null

  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  return {
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    width,
    height,
  }
}

function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}
