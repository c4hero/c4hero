import { screenBox, visibility } from './motion'
import { groupBoxes, type RenderState, type Palette } from './renderer'
import { textInset } from './text'

const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)

/** Standalone vector geometry and text; no bitmap or live-DOM dependency. */
export function mapSVG(state: RenderState, colors: Palette, width: number, height: number) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker></defs><rect width="100%" height="100%" fill="${xml(colors.background)}"/>`]
  for (const g of groupBoxes(state)) out.push(`<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" fill="none" stroke="${xml(colors.border)}" stroke-dasharray="6 4"/><text x="${g.x + 8}" y="${g.y + 16}" fill="${xml(colors.muted)}" font-size="12">${xml(g.group.name)}</text>`)
  for (const n of state.layout.nodes) {
    const alpha = visibility(n, state.reveal)
    if (alpha < .002) continue
    const b = screenBox(n, state.camera), style = state.styles.get(n.id), scale = Math.min(2, state.camera.zoom * n.scale)
    const external = 'location' in n.element && n.element.location === 'External'
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${n.element.type === 'person' ? b.height / 2 : 12 * scale}" fill="${xml(style?.background ?? colors.surface)}" stroke="${xml(style?.stroke ?? colors.border)}" stroke-width="${(style?.strokeWidth ?? 2) * scale}" opacity="${alpha * (style?.opacity ?? 100) / 100}"${external ? ' stroke-dasharray="6 4"' : ''}/>`)
    if (n.children.length) {
      const amount = state.reveal.get(n.id) ?? 0, inset = Math.min(8 * scale, b.width * .08, b.height * .08)
      out.push(`<rect data-expandable="true" x="${b.x + inset}" y="${b.y + inset}" width="${b.width - inset * 2}" height="${b.height - inset * 2}" rx="${Math.max(3, 7 * scale)}" fill="none" stroke="${xml(style?.color ?? colors.text)}" stroke-width="${Math.max(.75, scale)}" opacity="${alpha * .52 * (1 - amount)}"/>`)
    }
  }
  for (const edge of state.drawnEdges ?? []) out.push(`<path d="${edge.d}" fill="none" stroke="${xml(edge.color)}" stroke-width="${edge.width}" opacity="${edge.alpha}" marker-end="url(#arrow)"${edge.dashed ? ' stroke-dasharray="5 4"' : ''}/>`)
  for (const n of state.layout.nodes) {
    const alpha = visibility(n, state.reveal)
    if (alpha < .002) continue
    const b = screenBox(n, state.camera), style = state.styles.get(n.id), amount = n.children.length ? state.reveal.get(n.id) ?? 0 : 0
    const header = b.height * (1 - amount) + 40 * n.scale * state.camera.zoom * amount
    const scale = state.textLayouts?.get(n.id)?.scale ?? Math.min(n.children.length ? 2 : Infinity, state.camera.zoom * n.scale, header / 56), pad = textInset(n.element.type === 'person', b.height, scale)
    const available = b.width - 2 * pad, nameSize = Math.min((style?.fontSize ?? 14) * scale, available / Math.max(1, n.element.name.length * .58))
    out.push(`<g fill="${xml(style?.color ?? colors.text)}" font-family="Inter,system-ui,sans-serif" opacity="${alpha}"><text x="${b.x + pad}" y="${b.y + 16 * scale + nameSize}" font-size="${nameSize}" font-weight="600">${xml(n.element.name)}</text><text x="${b.x + pad}" y="${b.y + 47 * scale}" font-size="${8 * scale}" font-weight="800">${xml(n.element.type === 'softwareSystem' ? 'SOFTWARE SYSTEM' : n.element.type.toUpperCase())}</text>`)
    if (amount < 1 && n.element.description) {
      const lines = state.textLayouts?.get(n.id)?.lines ?? []
      const ds = state.textLayouts?.get(n.id)?.descriptionScale ?? scale
      const inset = textInset(n.element.type === 'person', b.height, ds)
      for (let i = 0; i < lines.length; i++) {
        const y = b.y + (69 + i * 16.8) * ds
        const fade = Math.max(0, Math.min(1, (b.y + header - 12 * ds - y) / (16 * ds)))
        out.push(`<text x="${b.x + inset}" y="${y}" font-size="${12 * ds}" opacity="${(1 - amount) * fade}">${xml(lines[i])}</text>`)
      }
    }
    out.push('</g>')
  }
  out.push('</svg>'); return out.join('')
}
