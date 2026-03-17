import type { Workspace } from '@/types/model'

/** Export workspace as Structurizr JSON */
export function exportAsJSON(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2)
}

/** Trigger a file download from a string */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  downloadBlob(blob, filename)
}

/** Trigger a file download from a Blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Export the canvas viewport as PNG */
export async function exportCanvasAsPNG(): Promise<Blob | null> {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewport) return null

  try {
    const cloned = viewport.cloneNode(true) as HTMLElement
    // Inline all computed styles
    inlineStyles(viewport, cloned)

    const rect = viewport.getBoundingClientRect()
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">${new XMLSerializer().serializeToString(cloned)}</div>
      </foreignObject>
    </svg>`

    const canvas = document.createElement('canvas')
    const scale = 2
    canvas.width = rect.width * scale
    canvas.height = rect.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const img = new Image()
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    return new Promise((resolve) => {
      img.onload = () => {
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        canvas.toBlob(b => resolve(b), 'image/png')
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      img.src = url
    })
  } catch {
    return null
  }
}

/** Export the canvas viewport as SVG string */
export function exportCanvasAsSVG(): string | null {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewport) return null

  const cloned = viewport.cloneNode(true) as HTMLElement
  inlineStyles(viewport, cloned)
  const rect = viewport.getBoundingClientRect()

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml">${new XMLSerializer().serializeToString(cloned)}</div>
  </foreignObject>
</svg>`
}

/** Recursively inline computed styles onto cloned elements */
function inlineStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source)
  const targetEl = target as HTMLElement
  if (targetEl.style) {
    targetEl.style.cssText = computed.cssText
  }
  for (let i = 0; i < source.children.length; i++) {
    if (target.children[i]) {
      inlineStyles(source.children[i], target.children[i])
    }
  }
}
