import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { ExploreController } from '@/lib/explore/controller'
import { registerActiveCamera } from '@/lib/activeCamera'
import type { Bundle } from '@/lib/explore/layout'
import type { Portal } from '@/lib/explore/renderer'
import type { WorkspaceState } from '@/store/workspace-types'
import { announce } from '@/lib/announce'
import { useCanvasTheme } from '@/hooks/useCanvasTheme'
import { useDocsLoader } from '@/hooks/useDocsLoader'
import CanvasGuide from '@/components/canvas/CanvasGuide'

function filters(s: WorkspaceState) { return { tags: s.activeTagFilter, statuses: s.activeStatusFilter, techs: s.activeTechFilter, teams: s.activeTeamFilter, tagsMode: s.tagFilterMode, statusesMode: s.statusFilterMode, techsMode: s.techFilterMode, teamsMode: s.teamFilterMode } }
export default function ExploreCanvas() {
  useCanvasTheme()
  useDocsLoader()
  const canvas = useRef<HTMLCanvasElement>(null)
  const minimap = useRef<HTMLCanvasElement>(null)
  const guideOpen = useWorkspaceStore(s => s.canvasGuideOpen)
  const controller = useRef<ExploreController | null>(null)
  const workspace = useWorkspaceStore(s => s.workspace)
  const selected = useWorkspaceStore(s => s.selectedElementIds)
  const filename = useWorkspaceStore(s => s.activeWorkspaceFilename)
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [zoom, setZoom] = useState(1)
  const [portal, setPortal] = useState<{ value: Portal; pinned: boolean } | null>(null)
  const [navigator, setNavigator] = useState(false)
  // Route collection + filename disambiguate workspaces with identical names.
  const identity = JSON.stringify([window.location.pathname.split('/').slice(0, 4), filename, workspace?.name])
  useEffect(() => {
    const ws = useWorkspaceStore.getState().workspace
    if (!canvas.current || !ws) return
    const engine = new ExploreController(canvas.current, ws, identity, {
      select(id, additive) { const s = useWorkspaceStore.getState(); if (id) { s.selectElements(additive ? s.selectedElementIds.includes(id) ? s.selectedElementIds.filter(value => value !== id) : [...s.selectedElementIds, id] : [id]); announce(`Selected ${engine.state.layout.byId.get(id)?.element.name ?? id}. Explore detail frozen.`) } else s.clearSelection() },
      portal(value, pinned) { setPortal(value ? { value, pinned } : null) }, zoom: setZoom,
      clearFilters() { useWorkspaceStore.getState().clearAllHighlightFilters(); announce('Highlighter cleared to reveal search target') },
    })
    controller.current = engine
    if (minimap.current) engine.attachMinimap(minimap.current)
    const unregister = registerActiveCamera(engine)
    const update = (s: WorkspaceState) => {
      if (s.workspace) { engine.update(s.workspace, s.selectedElementIds, filters(s)); setBundles(engine.state.bundles) }
      if (s.focusElementId) { const id = s.focusElementId; s.clearFocusElement(); engine.focus(id) }
    }
    update(useWorkspaceStore.getState())
    const unsubscribe = useWorkspaceStore.subscribe((s, prev) => {
      if (s.workspace !== prev.workspace || s.selectedElementIds !== prev.selectedElementIds || s.selectedGroupId !== prev.selectedGroupId || s.selectedRelationshipId !== prev.selectedRelationshipId || s.focusElementId !== prev.focusElementId ||
        s.activeTagFilter !== prev.activeTagFilter || s.activeStatusFilter !== prev.activeStatusFilter || s.activeTechFilter !== prev.activeTechFilter || s.activeTeamFilter !== prev.activeTeamFilter ||
        s.tagFilterMode !== prev.tagFilterMode || s.statusFilterMode !== prev.statusFilterMode || s.techFilterMode !== prev.techFilterMode || s.teamFilterMode !== prev.teamFilterMode) update(s)
    })
    return () => { unsubscribe(); unregister(); engine.dispose(); controller.current = null }
  }, [identity])
  const elements = workspace ? [...workspace.model.people, ...workspace.model.softwareSystems.flatMap(s => [s, ...s.containers.flatMap(c => [c, ...c.components])])] : []
  return <>
    <canvas className="explore-map" ref={canvas} data-testid="explore-canvas" data-explore-canvas="true" tabIndex={0} aria-label="Workspace architecture map. Arrow keys pan, plus and minus zoom, zero fits. Use Browse architecture or Search to select elements." style={{ width: '100%', height: '100%', touchAction: 'none' }} />
    <canvas ref={minimap} width={200} height={140} aria-label="Architecture minimap" tabIndex={0} style={{ position: 'absolute', right: 14, bottom: 60, width: 200, height: 140, border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'crosshair', touchAction: 'none' }} />
    {guideOpen && <CanvasGuide onClose={() => useWorkspaceStore.getState().setCanvasGuideOpen(false)} />}
    <div className="glass-panel" data-canvas-chrome="explore-navigator" data-canvas-fit-chrome={navigator ? 'left' : undefined} style={{ position: 'absolute', bottom: 52, left: 78, maxWidth: 'min(340px, calc(100% - 94px))', padding: '8px 12px', borderRadius: 10, fontSize: 12 }}>
      <strong>Workspace architecture</strong> · {Math.round(zoom * 100)}%<br />
      <span>{selected.length ? 'Detail frozen · clear selection to resume' : 'Zoom inside systems and containers'}</span>
      <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>Faint: cross-system connections<br />Dashed: asynchronous · Circles: connections</div>
      <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={() => setNavigator(v => !v)} aria-expanded={navigator}>Browse architecture</button>
      {selected.length > 0 && <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={() => useWorkspaceStore.getState().clearSelection()}>Clear selection</button>}
      {navigator && <div aria-label="Architecture elements" style={{ maxHeight: 220, overflow: 'auto' }}>
        <p style={{ margin: '6px 0', color: 'var(--color-text-muted)' }}>Drag to arrange. Shift-click to select several. Drag a connection dot to another element. Hold Space to pan.</p>
        {elements.map(e => <button key={e.id} className="btn-ghost" style={{ display: 'block', textAlign: 'left' }} aria-pressed={selected.includes(e.id)} onClick={() => controller.current?.focus(e.id)}>{e.name} · {e.type === 'softwareSystem' ? 'Software system' : e.type}</button>)}
        <details><summary>Cross-system connections</summary>{bundles.map(b => <button key={b.key} className="btn-ghost" style={{ display: 'block' }} onClick={() => controller.current?.togglePortal(b.key + ':' + b.from.id)}>{b.from.element.name} → {b.to.element.name} ({b.connections.length}) · {b.connections[0].relationship.interactionStyle ?? 'Synchronous'}</button>)}</details>
        <details><summary>All model relationships</summary>{workspace?.model.relationships.filter(r => elements.some(e => e.id === r.sourceId) && elements.some(e => e.id === r.destinationId)).map(r => <button key={r.id} className="btn-ghost" style={{ display: 'block', textAlign: 'left', padding: '4px 0' }} onClick={() => useWorkspaceStore.getState().selectRelationship(r.id)}>{elements.find(e => e.id === r.sourceId)?.name ?? r.sourceId} → {elements.find(e => e.id === r.destinationId)?.name ?? r.destinationId}: {r.description || r.id}</button>)}</details>
      </div>}
    </div>
    {!elements.length && <div style={{ position: 'absolute', inset: '40% 20%', textAlign: 'center', pointerEvents: 'none' }}><h2>No architecture yet</h2><p>Use Add element or the DSL pane to add people and systems.</p></div>}
    {portal && <section className="glass-panel" data-canvas-chrome="explore-connections" aria-label="Boundary connections" style={{ position: 'absolute', left: 16, top: 114, maxWidth: 360, maxHeight: '45vh', overflow: 'auto', padding: 12, borderRadius: 10, fontSize: 12 }}>
      <div>Cross-system relationships</div><strong>{portal.value.bundle.from.element.name} → {portal.value.bundle.to.element.name}</strong>
      <button className="btn-ghost" onClick={() => controller.current?.togglePortal(portal.value.key)}>{portal.pinned ? 'Unpin connections' : 'Pin connections'}</button>
      {portal.value.bundle.connections.map(({ relationship: r, from, to }) => <button key={r.id} className="btn-ghost" style={{ display: 'block', textAlign: 'left' }} onClick={() => useWorkspaceStore.getState().selectRelationship(r.id)}>{from.element.name} → {to.element.name}: {r.description || 'Relationship'} · {r.technology || 'No technology'} · {r.interactionStyle ?? 'Synchronous'} · {r.id}</button>)}
    </section>}
  </>
}
