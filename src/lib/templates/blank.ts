import type { Workspace } from '@/types/model'

/** Empty workspace for starting from scratch.
 *  For softwaresystem scope, seeds a placeholder software system plus a systemContext
 *  view pointing to it, since a systemContext view requires a software system reference.
 *  The user can rename the placeholder system immediately (F2). */
export function createBlankWorkspace(scope?: import('@/types/model').WorkspaceScope): Workspace {
  const isSoftwareSystem = scope === 'softwaresystem'
  const placeholderId = 'sys1'
  return {
    name: 'Untitled Workspace',
    description: '',
    scope,
    model: {
      people: [],
      softwareSystems: isSoftwareSystem
        ? [{
            id: placeholderId,
            type: 'softwareSystem',
            name: 'New System',
            description: '',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
          }]
        : [],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: isSoftwareSystem
        ? []
        : [
            {
              type: 'systemLandscape',
              key: 'default',
              title: 'System Landscape',
              elements: [],
              relationships: [],
              autoLayout: { direction: 'TB' },
            },
          ],
      systemContextViews: isSoftwareSystem
        ? [
            {
              type: 'systemContext',
              key: 'SystemContext',
              title: 'System Context',
              softwareSystemId: placeholderId,
              elements: [{ id: placeholderId }],
              relationships: [],
              autoLayout: { direction: 'TB' },
            },
          ]
        : [],
      containerViews: [],
      componentViews: [],
      configuration: {
        styles: {
          elements: [],
          relationships: [],
        },
      },
    },
  }
}
