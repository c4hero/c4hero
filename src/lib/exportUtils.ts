import type { Workspace } from '@/types/model'
import { sanitizeFilename } from '@/lib/filenames'

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
  a.download = sanitizeFilename(filename)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Export the canvas viewport as PNG */
export type ExportTheme = 'dark' | 'light' | 'current'

/** Light theme background / override vars */
const LIGHT_STYLE: Record<string, string> = {
  '--color-bg-primary': '#f8fafc',
  '--color-surface-1': '#ffffff',
  '--color-surface-2': '#f1f5f9',
  '--color-surface-3': '#e2e8f0',
  '--color-border': '#cbd5e1',
  '--color-text-primary': '#0f172a',
  '--color-text-secondary': '#334155',
  '--color-text-muted': '#64748b',
}

/** Read the current canvas background from the live DOM, falling back to dark. */
function readCurrentCanvasBg(): string {
  const renderer = document.querySelector('.react-flow__renderer') as HTMLElement | null
  if (!renderer) return '#0a0f14'
  const styles = getComputedStyle(renderer)
  const override = styles.getPropertyValue('--canvas-bg').trim()
  if (override) return override
  const fallback = styles.getPropertyValue('--color-bg-primary').trim()
  return fallback || '#0a0f14'
}

function bgForTheme(theme: ExportTheme): string {
  if (theme === 'light') return '#f8fafc'
  if (theme === 'current') return readCurrentCanvasBg()
  return '#0a0f14'
}

export async function exportCanvasAsPNG(theme: ExportTheme = 'dark'): Promise<Blob | null> {
  const renderer = document.querySelector('.react-flow__renderer') as HTMLElement | null
  if (!renderer) return null

  try {
    const { toPng } = await import('html-to-image')
    const bg = bgForTheme(theme)
    const dataUrl = await toPng(renderer, {
      pixelRatio: 2,
      backgroundColor: bg,
      style: {
        borderRadius: '0',
        ...(theme === 'light' ? LIGHT_STYLE : {}),
      },
    })
    const res = await fetch(dataUrl)
    return await res.blob()
  } catch {
    return null
  }
}

/** Export the canvas viewport as SVG string */
export function exportCanvasAsSVG(theme: ExportTheme = 'dark'): string | null {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewport) return null

  const cloned = viewport.cloneNode(true) as HTMLElement
  sanitizeExportTree(cloned)
  inlineStyles(viewport, cloned)
  sanitizeExportTree(cloned)

  // For light theme, override CSS custom property values on the cloned root
  if (theme === 'light') {
    Object.entries(LIGHT_STYLE).forEach(([k, v]) => {
      ;(cloned as HTMLElement).style.setProperty(k, v)
    })
  }

  const rect = viewport.getBoundingClientRect()
  const bg = bgForTheme(theme)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}" style="background:${bg}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml">${new XMLSerializer().serializeToString(cloned)}</div>
  </foreignObject>
</svg>`
}

/** Copy PNG to clipboard */
export async function copyCanvasAsPNG(theme: ExportTheme = 'dark'): Promise<boolean> {
  try {
    const blob = await exportCanvasAsPNG(theme)
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

/** Copy DSL text to clipboard */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
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

const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction'])

function sanitizeExportTree(root: Element): void {
  for (const script of root.querySelectorAll('script')) script.remove()
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    sanitizeElement(el)
  }
}

function sanitizeElement(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const attrName = attr.name.toLowerCase()
    if (attrName.startsWith('on') || attrName === 'srcdoc') {
      el.removeAttribute(attr.name)
      continue
    }
    if (URL_ATTRS.has(attrName) && !isSafeEmbeddedUrl(attr.value)) {
      el.removeAttribute(attr.name)
      continue
    }
    if (containsUnsafeCssUrl(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }

  const style = (el as HTMLElement).style
  if (!style) return
  for (const prop of Array.from(style)) {
    if (containsUnsafeCssUrl(style.getPropertyValue(prop))) {
      style.removeProperty(prop)
    }
  }
}

function isSafeEmbeddedUrl(value: string): boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
  return normalized.startsWith('#') || normalized.startsWith('data:image/')
}

function containsUnsafeCssUrl(value: string): boolean {
  const urls = value.matchAll(/url\(([^)]*)\)/gi)
  for (const match of urls) {
    if (!isSafeEmbeddedUrl(match[1])) return true
  }
  return false
}
