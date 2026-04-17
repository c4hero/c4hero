import type { Workspace } from '@/types/model'

/** Monolithic architecture — frontend, backend, and database */
export function createMonolithTemplate(): Workspace {
  return {
    name: 'Monolithic Application',
    description: 'A traditional monolithic web application with frontend, backend, and database.',
    model: {
      people: [
        {
          id: 'admin',
          type: 'person',
          name: 'Administrator',
          description: 'An internal administrator who manages content and users.',
          tags: ['Element', 'Person', 'Staff'],
          properties: {},
          location: 'Internal',
        },
        {
          id: 'endUser',
          type: 'person',
          name: 'End User',
          description: 'A public user who interacts with the application.',
          tags: ['Element', 'Person', 'Customer'],
          properties: {},
          location: 'External',
        },
      ],
      softwareSystems: [
        {
          id: 'monolith',
          type: 'softwareSystem',
          name: 'Monolithic Application',
          description: 'The primary web application serving all business functionality.',
          tags: ['Element', 'Software System'],
          properties: {},
          location: 'Internal',
          containers: [
            {
              id: 'webFrontend',
              type: 'container',
              name: 'Web Frontend',
              description: 'Delivers the user interface to browsers.',
              technology: 'React, TypeScript',
              tags: ['Element', 'Container'],
              properties: {},
              components: [],
            },
            {
              id: 'backendApp',
              type: 'container',
              name: 'Backend Application',
              description: 'Handles business logic, API endpoints, and server-side rendering.',
              technology: 'Python, Django',
              tags: ['Element', 'Container'],
              properties: {},
              components: [],
            },
            {
              id: 'database',
              type: 'container',
              name: 'Database',
              description: 'Stores all application data including users, content, and configuration.',
              technology: 'MySQL 8',
              tags: ['Element', 'Container', 'Database'],
              properties: {},
              components: [],
            },
          ],
        },
        {
          id: 'emailService',
          type: 'softwareSystem',
          name: 'E-mail Service',
          description: 'Third-party transactional email provider.',
          tags: ['Element', 'Software System', 'External System'],
          properties: {},
          location: 'External',
          containers: [],
        },
      ],
      relationships: [
        { id: 'r1', sourceId: 'endUser', destinationId: 'monolith', description: 'Uses the application', tags: ['Relationship'], properties: {} },
        { id: 'r2', sourceId: 'admin', destinationId: 'monolith', description: 'Manages content and users', tags: ['Relationship'], properties: {} },
        { id: 'r3', sourceId: 'monolith', destinationId: 'emailService', description: 'Sends transactional emails via', tags: ['Relationship'], properties: {} },
        { id: 'r4', sourceId: 'emailService', destinationId: 'endUser', description: 'Sends emails to', tags: ['Relationship'], properties: {} },
        { id: 'r5', sourceId: 'endUser', destinationId: 'webFrontend', description: 'Visits and interacts', technology: 'HTTPS', tags: ['Relationship'], properties: {} },
        { id: 'r6', sourceId: 'admin', destinationId: 'webFrontend', description: 'Manages via admin panel', technology: 'HTTPS', tags: ['Relationship'], properties: {} },
        { id: 'r7', sourceId: 'webFrontend', destinationId: 'backendApp', description: 'Makes API calls', technology: 'JSON/HTTPS', tags: ['Relationship'], properties: {} },
        { id: 'r8', sourceId: 'backendApp', destinationId: 'database', description: 'Reads from and writes to', technology: 'SQL', tags: ['Relationship'], properties: {} },
        { id: 'r9', sourceId: 'backendApp', destinationId: 'emailService', description: 'Sends emails via', technology: 'SMTP', tags: ['Relationship'], properties: {} },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'SystemLandscape',
          title: 'System Landscape',
          description: 'Overview of the monolithic application and its users.',
          elements: [
            { id: 'admin' },
            { id: 'endUser' },
            { id: 'monolith' },
            { id: 'emailService' },
          ],
          relationships: [
            { id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' },
          ],
          autoLayout: { direction: 'TB' },
        },
      ],
      systemContextViews: [],
      containerViews: [
        {
          type: 'container',
          key: 'Containers',
          title: 'Containers',
          description: 'The frontend, backend, and database within the monolith.',
          softwareSystemId: 'monolith',
          elements: [
            { id: 'admin' },
            { id: 'endUser' },
            { id: 'webFrontend' },
            { id: 'backendApp' },
            { id: 'database' },
            { id: 'emailService' },
          ],
          relationships: [
            { id: 'r5' }, { id: 'r6' }, { id: 'r7' }, { id: 'r8' }, { id: 'r9' },
          ],
          autoLayout: { direction: 'TB' },
        },
      ],
      componentViews: [],
      configuration: {
        styles: {
          elements: [
            { tag: 'Staff', background: '#1e2832', color: '#94a3b8', stroke: '#475569' },
            { tag: 'External System', background: '#201c28', color: '#c084fc', stroke: '#9333ea' },
            { tag: 'Database', background: '#1e1a40', color: '#c4b5fd', stroke: '#7c3aed', shape: 'Cylinder' },
          ],
          relationships: [],
        },
      },
    },
  }
}
