import type { Workspace, View, ModelElement } from '@/types/model'

/** Get flat array of all views */
export function allViewsOf(ws: Workspace): View[] {
  return [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
  ]
}

/** Find a view by key inside a workspace */
export function findViewHelper(ws: Workspace, key: string): View | undefined {
  return allViewsOf(ws).find(v => v.key === key)
}

/** Iterate every element in the model tree. Return true from callback to stop early. */
export function forEachElementHelper(ws: Workspace, fn: (el: ModelElement) => boolean | void): void {
  for (const p of ws.model.people) { if (fn(p)) return }
  for (const sys of ws.model.softwareSystems) {
    if (fn(sys)) return
    for (const c of sys.containers) {
      if (fn(c)) return
      for (const comp of c.components) { if (fn(comp)) return }
    }
  }
}

/** Find an element by ID in the model tree */
export function findElementHelper(ws: Workspace, id: string): ModelElement | undefined {
  let found: ModelElement | undefined
  forEachElementHelper(ws, (el) => { if (el.id === id) { found = el; return true } })
  return found
}
