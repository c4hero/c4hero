import type { Workspace } from '@/types/model'

/** Shared workspace fixture for AI engine tests. */
export function makeWorkspace(): Workspace {
  return {
    name: 'Shop',
    description: 'An e-commerce platform',
    model: {
      people: [
        { id: 'cust', type: 'person', name: 'Customer', description: 'Buys things', tags: [], properties: {} },
        { id: 'admin', type: 'person', name: 'Admin', tags: [], properties: {} }, // no description
      ],
      softwareSystems: [
        {
          id: 'shop', type: 'softwareSystem', name: 'Shop', description: 'The store', tags: [], properties: {},
          containers: [
            {
              id: 'web', type: 'container', name: 'Web App', description: 'Storefront UI', technology: 'React', tags: [], properties: {},
              components: [
                { id: 'cart', type: 'component', name: 'Cart', tags: [], properties: {} }, // no description
              ],
            },
            { id: 'db', type: 'container', name: 'Database', tags: [], properties: {}, components: [] }, // no description
          ],
        },
      ],
      relationships: [
        { id: 'r1', sourceId: 'cust', destinationId: 'web', description: 'Browses', tags: [], properties: {} },
        { id: 'r2', sourceId: 'web', destinationId: 'db', tags: [], properties: {} }, // no description
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}
