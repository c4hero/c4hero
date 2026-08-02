// Hostile fixture for the Structurizr conformance gate.
//
// Deliberately packs every value class the real Structurizr CLI has opinions
// about into one workspace: embedded double quotes, embedded newlines/tabs,
// a trailing backslash (unrepresentable -- must be stripped, not doubled),
// a mid-string Windows path (single backslashes are literal and must NOT be
// escaped/doubled), tag lists with a comma and a quote, External people and
// software systems, owner/status on an element, and lineStyle/
// interactionStyle/url/tags/properties on a relationship. See
// src/lib/dsl/dsl-strings.ts for the escaping ground truth this exercises.
import type { Workspace } from '@/types/model'

export function createHostileWorkspace(): Workspace {
    return {
        name: 'Hostile Strings "Conformance" Fixture',
        description: 'Exercises quotes, backslashes, tabs\tand\nnewlines end to end.',
        model: {
            people: [
                {
                    id: 'extCustomer',
                    type: 'person',
                    name: 'External "VIP" Customer',
                    description: 'Contains a\nnewline and\ta tab, plus a "quoted" phrase.',
                    tags: ['Element', 'Person', 'Tag,With Comma', 'Tag"WithQuote'],
                    properties: {},
                    location: 'External',
                },
            ],
            softwareSystems: [
                {
                    // Trailing backslash: unrepresentable inside a quoted DSL string
                    // (it would escape the closing quote), so the serializer must
                    // strip it rather than double it.
                    id: 'sharedFolder',
                    type: 'softwareSystem',
                    // Raw value ends in a single backslash: "Shared Folder X:\"
                    name: 'Shared Folder X:\\',
                    // Raw value: HOST-01 'U:\' -- ends in an apostrophe, not a
                    // backslash, so it stays representable as-is; the mid-string
                    // backslash before it must remain a single literal backslash.
                    description: "HOST-01 'U:\\'",
                    tags: ['Element', 'Software System'],
                    properties: {},
                    location: 'External',
                    owner: 'Ops "Infra" Team',
                    status: 'Live',
                    containers: [
                        {
                            id: 'winShare',
                            type: 'container',
                            name: 'Windows Share',
                            // Single backslashes mid-string are literal in Structurizr
                            // DSL and must never be doubled by the serializer.
                            description: 'Serves C:\\Users\\svc over SMB',
                            technology: 'SMB/CIFS',
                            tags: ['Element', 'Container'],
                            properties: {},
                            components: [],
                        },
                    ],
                },
            ],
            relationships: [
                {
                    id: 'r1',
                    sourceId: 'extCustomer',
                    destinationId: 'sharedFolder',
                    description: 'Reads\tfiles from',
                    technology: 'SMB/CIFS',
                    interactionStyle: 'Asynchronous',
                    lineStyle: 'Straight',
                    url: 'https://example.com/docs?q="quoted"',
                    tags: ['Tag,WithComma', 'Tag"WithQuote'],
                    properties: { note: 'Contains "quotes" and\ttabs' },
                },
            ],
            groups: [],
        },
        views: {
            systemLandscapeViews: [
                {
                    type: 'systemLandscape',
                    // View keys are the only positional identifier without a quote
                    // escaping story of their own in Structurizr -- it rejects keys
                    // containing spaces outright, so this must stay [A-Za-z0-9_-].
                    key: 'hostile-landscape',
                    title: 'Hostile "Landscape" View',
                    // Explicit element list, not `include *`: the parser expands a
                    // wildcard include into explicit element ids on read, so a
                    // workspace built with `id: '*'` would not serialize back
                    // identically after a parse -- see wildcard-expansion.test.ts.
                    elements: [{ id: 'extCustomer' }, { id: 'sharedFolder' }],
                    relationships: [],
                    autoLayout: { direction: 'LR', rankSeparation: 300, nodeSeparation: 100 },
                },
            ],
            systemContextViews: [],
            containerViews: [
                {
                    type: 'container',
                    key: 'hostile-containers',
                    softwareSystemId: 'sharedFolder',
                    elements: [{ id: 'winShare' }],
                    relationships: [],
                    autoLayout: { direction: 'TB' },
                },
            ],
            componentViews: [],
            configuration: { styles: { elements: [], relationships: [] } },
        },
    }
}
