import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'

async function expectGroupToContainMembers(
  workspace: WorkspaceHelper,
  groupId: string,
  memberIds: string[],
) {
  await workspace.page.locator(`[data-id="group-${groupId}"]`).waitFor({ state: 'visible' })

  const state = await workspace.page.evaluate(
    ({ activeGroupId, ids }) => {
      const groupEl = document.querySelector(`[data-id="group-${activeGroupId}"]`) as HTMLElement | null
      if (!groupEl) return null

      const groupRect = groupEl.getBoundingClientRect()
      return {
        groupRect: {
          left: groupRect.left,
          right: groupRect.right,
          top: groupRect.top,
          bottom: groupRect.bottom,
          width: groupRect.width,
          height: groupRect.height,
        },
        members: ids.map((id) => {
          const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
          if (!el) return { id, found: false as const }
          const rect = el.getBoundingClientRect()
          return {
            id,
            found: true as const,
            rect: {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          }
        }),
      }
    },
    { activeGroupId: groupId, ids: memberIds },
  )

  expect(state, 'group node should stay visible').not.toBeNull()
  if (!state) return

  const tolerance = 48

  for (const member of state.members) {
    expect(member, `group member ${member.id} should stay visible`).toMatchObject({ found: true })
    if (!member.found) continue
    expect(member.rect.left).toBeGreaterThanOrEqual(state.groupRect.left - tolerance)
    expect(member.rect.top).toBeGreaterThanOrEqual(state.groupRect.top - tolerance)
    expect(member.rect.right).toBeLessThanOrEqual(state.groupRect.right + tolerance)
    expect(member.rect.bottom).toBeLessThanOrEqual(state.groupRect.bottom + tolerance)
  }
}

async function expectEdgesToStayAttached(
  workspace: WorkspaceHelper,
  viewKey: string,
  nodeNames: string[],
  expectedEdgeCount?: number,
) {
  const snapshot = await workspace.getWorkspace()
  const activeView = [
    ...snapshot!.views.systemLandscapeViews,
    ...snapshot!.views.systemContextViews,
    ...snapshot!.views.containerViews,
    ...snapshot!.views.componentViews,
  ].find((view) => view.key === viewKey)

  expect(activeView, `view ${viewKey} should exist`).toBeTruthy()
  if (!activeView) return

  const relationshipMap = new Map(snapshot!.model.relationships.map((relationship) => [relationship.id, relationship]))
  const edgeRects = await workspace.page.locator('.react-flow__edge-interaction').evaluateAll((els) =>
    els.map((el) => {
      const rect = (el as SVGGraphicsElement).getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }),
  )

  if (expectedEdgeCount !== undefined) {
    expect(edgeRects.length).toBe(expectedEdgeCount)
  } else {
    expect(edgeRects.length).toBeGreaterThan(0)
  }

  for (const rect of edgeRects) {
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
  }

  const geometry = await workspace.page.evaluate(({ relationships }) => {
    const distanceToRect = (
      point: { x: number; y: number },
      rect: { left: number; right: number; top: number; bottom: number },
    ) => {
      const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
      const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0
      return Math.hypot(dx, dy)
    }

    return relationships.map(({ id, sourceId, destinationId }) => {
      const edge = document.querySelector(`[data-testid="rf__edge-${id}"]`) as SVGGElement | null
      const path = (edge?.querySelector('.react-flow__edge-path') ?? edge?.querySelector('path[d]')) as SVGPathElement | null
      const source = document.querySelector(`[data-id="${sourceId}"]`) as HTMLElement | null
      const target = document.querySelector(`[data-id="${destinationId}"]`) as HTMLElement | null
      const sourceRect = source?.getBoundingClientRect()
      const targetRect = target?.getBoundingClientRect()
      const edgeRect = path?.getBoundingClientRect()
      const totalLength = path?.getTotalLength() ?? 0
      const screenCtm = path?.getScreenCTM()
      const toViewportPoint = (distance: number) => {
        if (!path || totalLength <= 0 || !screenCtm) return null
        const point = path.getPointAtLength(distance)
        const transformed = new DOMPoint(point.x, point.y).matrixTransform(screenCtm)
        return { x: transformed.x, y: transformed.y }
      }
      const start = toViewportPoint(0)
      const end = toViewportPoint(totalLength)

      return {
        id,
        sourceFound: !!sourceRect,
        targetFound: !!targetRect,
        edgeWidth: edgeRect?.width ?? 0,
        edgeHeight: edgeRect?.height ?? 0,
        sourceDistance: start && sourceRect ? distanceToRect(start, sourceRect) : Number.POSITIVE_INFINITY,
        targetDistance: end && targetRect ? distanceToRect(end, targetRect) : Number.POSITIVE_INFINITY,
      }
    })
  }, {
    relationships: activeView.relationships.map(({ id }) => {
      const relationship = relationshipMap.get(id)
      expect(relationship, `relationship ${id} should exist in model`).toBeTruthy()
      return { id, sourceId: relationship!.sourceId, destinationId: relationship!.destinationId }
    }),
  })

  expect(geometry.length).toBe(activeView.relationships.length)
  for (const edge of geometry) {
    expect(edge.sourceFound, `edge ${edge.id} source node should stay visible`).toBe(true)
    expect(edge.targetFound, `edge ${edge.id} target node should stay visible`).toBe(true)
    expect(edge.edgeWidth, `edge ${edge.id} should have non-zero width`).toBeGreaterThan(0)
    expect(edge.edgeHeight, `edge ${edge.id} should have non-zero height`).toBeGreaterThan(0)
    expect(edge.sourceDistance, `edge ${edge.id} should stay attached to its source node`).toBeLessThanOrEqual(28)
    expect(edge.targetDistance, `edge ${edge.id} should stay attached to its target node`).toBeLessThanOrEqual(28)
  }

  for (const name of nodeNames) {
    await expect(workspace.getVisibleNodeByName(name), `${name} should stay visible`).toBeVisible()
  }
}

test.describe('10-pass gauntlet regressions', () => {
  test('edge labels stay readable under long unbroken text and orthogonal routing', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    await workspace.selectNewestRelationship()

    const longDescription = 'SYNCHRONOUS_EVENT_STREAM_WITH_EXTRA_LONG_IDENTIFIER_THAT_SHOULD_WRAP_CLEANLY_ACROSS_THE_EDGE_LABEL'
    const longTech = 'KafkaProtocolBufferEnvelopeWithVersionNegotiation, MutualTLSCertificatePinning'

    await workspace.fillEditableField('Description', longDescription)
    await workspace.fillEditableField('Technology', longTech)
    await workspace.page.getByRole('button', { name: 'Interaction style: Asynchronous' }).click()
    await workspace.page.getByRole('button', { name: 'Line style: Orthogonal' }).click()

    const titledDescription = workspace.page.locator(`span[title="${longDescription}"]`).first()
    await expect(titledDescription).toBeVisible()

    const compactMetrics = await titledDescription.evaluate((el) => {
      const label = el.parentElement as HTMLElement | null
      if (!label) throw new Error('missing label container')
      return {
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
        overflowWrap: getComputedStyle(label).overflowWrap,
      }
    })

    expect(compactMetrics.clientWidth).toBeGreaterThan(0)
    expect(compactMetrics.scrollWidth).toBeLessThanOrEqual(compactMetrics.clientWidth + 2)
    expect(compactMetrics.overflowWrap).toBe('anywhere')
    await expect(workspace.page.locator('span[title="KafkaProtocolBufferEnvelopeWithVersionNegotiation"]').first()).toBeVisible()
  })

  test('crowded orthogonal views compact dense edge labels until hover reveals full text', async ({ workspace }) => {
    await workspace.parseAndLoad(`workspace "Dense Edge Labels" {
  model {
    hub = softwareSystem "Integration Hub" {
      ingest = container "Ingest Gateway" "Accepts partner traffic" "Node.js"
      orchestrator = container "Workflow Orchestrator" "Coordinates jobs" "Temporal"
      billing = container "Billing Adapter" "Writes invoices" "Go"
      analytics = container "Analytics Projector" "Builds read models" "Python"

      ingest -> orchestrator "normalizes_customer_profile_change_events_before_dispatching_to_workflows" "KafkaProtocolBufferEnvelopeWithVersionNegotiation, MutualTLSCertificatePinning" {
        lineStyle Orthogonal
      }
      orchestrator -> billing "reconciles_long_running_invoice_batches_after_partner_callbacks_complete" "gRPCWithPerRequestIdempotencyKeys, MutualTLSCertificatePinning" {
        lineStyle Orthogonal
      }
      orchestrator -> analytics "streams_enriched_audit_records_to_dense_projection_pipelines" "KafkaProtocolBufferEnvelopeWithVersionNegotiation, ColumnarCompressionCodec" {
        lineStyle Orthogonal
      }
      billing -> analytics "publishes_financial_posting_outcomes_for_cross_team_visibility" "EventBridgeSchemaRegistryEnvelope, ColumnarCompressionCodec" {
        lineStyle Orthogonal
      }
    }
  }
  views {
    container hub "Dense Labels" {
      include *
      autoLayout lr
    }
  }
}`)

    const edgeDescriptions = [
      'normalizes_customer_profile_change_events_before_dispatching_to_workflows',
      'reconciles_long_running_invoice_batches_after_partner_callbacks_complete',
      'streams_enriched_audit_records_to_dense_projection_pipelines',
      'publishes_financial_posting_outcomes_for_cross_team_visibility',
    ]
    const denseDescription = 'normalizes_customer_profile_change_events_before_dispatching_to_workflows'
    for (const description of edgeDescriptions) {
      await expect(workspace.page.getByText(description, { exact: true })).toHaveCount(0)
      await expect(workspace.page.locator(`span[title="${description}"]`).first()).toBeVisible()
    }

    const denseCompactDescription = workspace.page.locator(`span[title="${denseDescription}"]`).first()
    await expect(denseCompactDescription).toBeVisible()

    const labelMetrics = await denseCompactDescription.evaluate((el) => {
      const label = el.parentElement as HTMLElement | null
      if (!label) throw new Error('missing label container')
      return {
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
        overflowWrap: getComputedStyle(label).overflowWrap,
      }
    })
    expect(labelMetrics.scrollWidth).toBeLessThanOrEqual(labelMetrics.clientWidth + 2)
    expect(labelMetrics.overflowWrap).toBe('anywhere')
    await expect(workspace.page.locator('span[title="MutualTLSCertificatePinning"]').first()).toBeVisible()
  })

  test('bulk mutation workflows keep groups and relationships coherent across repeated mixed mutations and view switches', async ({ workspace }) => {
    await workspace.loadSample()

    const systemContextView = await workspace.getViewByTitle('System Context')
    const systemLandscapeView = await workspace.getViewByTitle('System Landscape')
    expect(systemContextView).toBeTruthy()
    expect(systemLandscapeView).toBeTruthy()

    await workspace.setView(systemContextView!.key)
    await workspace.fitView()

    let snapshot = await workspace.getWorkspace()
    const groupedSystems = ['Personal Banking Customer', 'Internet Banking System', 'Mainframe Banking System']
    const groupedIds = groupedSystems.map((name) => {
      const id = snapshot?.model.people.find((person) => person.name === name)?.id
        ?? snapshot?.model.softwareSystems.find((system) => system.name === name)?.id
      expect(id, `${name} should exist in the sample workspace`).toBeTruthy()
      return id!
    })

    const relationshipCountBeforeDelete = snapshot?.model.relationships.length ?? 0
    expect(relationshipCountBeforeDelete).toBeGreaterThan(0)

    const groupId = await workspace.addGroup('Core Banking Flow', groupedIds)
    expect(groupId).toBeTruthy()
    await expectGroupToContainMembers(workspace, groupId!, groupedIds)
    await expectEdgesToStayAttached(workspace, systemContextView!.key, groupedSystems)

    await workspace.relayout('LR')
    await expectGroupToContainMembers(workspace, groupId!, groupedIds)
    await expectEdgesToStayAttached(workspace, systemContextView!.key, groupedSystems)

    await workspace.setView(systemLandscapeView!.key)
    await workspace.relayout('BT')
    await expectEdgesToStayAttached(workspace, systemLandscapeView!.key, ['Personal Banking Customer', 'Internet Banking System'])

    await workspace.setView(systemContextView!.key)
    await expectGroupToContainMembers(workspace, groupId!, groupedIds)
    await expectEdgesToStayAttached(workspace, systemContextView!.key, groupedSystems)

    await workspace.deleteElements([groupedIds[2]])
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.relationships.length ?? 0).toBeLessThan(relationshipCountBeforeDelete)
    expect(snapshot?.model.groups[0]?.elementIds).toEqual(groupedIds.slice(0, 2))
    await expectGroupToContainMembers(workspace, groupId!, groupedIds.slice(0, 2))
    await expectEdgesToStayAttached(workspace, systemContextView!.key, groupedSystems.slice(0, 2))

    await workspace.page.keyboard.press('Control+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.relationships.length).toBe(relationshipCountBeforeDelete)
    expect(snapshot?.model.groups[0]?.elementIds).toEqual(groupedIds)

    await workspace.setView(systemContextView!.key)
    await expectGroupToContainMembers(workspace, groupId!, groupedIds)
    await expectEdgesToStayAttached(workspace, systemContextView!.key, groupedSystems)

    await workspace.page.keyboard.press('Control+Shift+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.relationships.length ?? 0).toBeLessThan(relationshipCountBeforeDelete)
    expect(snapshot?.model.groups[0]?.elementIds).toEqual(groupedIds.slice(0, 2))
    await expectGroupToContainMembers(workspace, groupId!, groupedIds.slice(0, 2))

    await workspace.page.keyboard.press('Control+z')
    await workspace.relayout('TB')
    await expectGroupToContainMembers(workspace, groupId!, groupedIds)
    await expectEdgesToStayAttached(workspace, systemContextView!.key, groupedSystems)
  })

  test('messy real-world DSL imports preserve borderline details needed for editing', async ({ workspace }) => {
    await workspace.parseAndLoad(`workspace "Messy Ops" "Roundtrip gauntlet" {
  model {
    admin = person "Admin User" "Owns triage" "Ops, Needs Review"
    billing = softwareSystem "Billing Core" "Charges cards" {
      api = container "Billing API" "Handles retries" "Node.js 22 / Fastify"
      worker = container "Retry Worker" "Processes dead letters" "Temporal + Kafka"
      api -> worker "retries_failed_jobs_after_manual_review" "KafkaProtocolBufferEnvelopeWithVersionNegotiation"
    }

    admin -> api "approves refunds after a long audit trail" "HTTPS"
  }

  views {
    systemContext billing "Billing Context" {
      include *
      autoLayout lr
    }

    container billing "Billing Containers" {
      include *
      autoLayout tb
    }
  }
}`)

    const api = await workspace.getElementByName('Billing API')
    const worker = await workspace.getElementByName('Retry Worker')
    const relationship = await workspace.getRelationshipByDescription('retries_failed_jobs_after_manual_review')
    expect(api?.technology).toBe('Node.js 22 / Fastify')
    expect(worker?.technology).toBe('Temporal + Kafka')
    expect(relationship?.technology).toBe('KafkaProtocolBufferEnvelopeWithVersionNegotiation')

    const views = await workspace.getViews()
    expect(views.map((view) => view.title)).toEqual(expect.arrayContaining(['Billing Context', 'Billing Containers']))
  })

  test('borderline DSL with dense identifiers still loads into an editable workspace', async ({ workspace }) => {
    await workspace.parseAndLoad(`workspace "Borderline Model" {
  model {
    operator = person "Operator"
    telemetry = softwareSystem "Telemetry Hub" {
      ingest = container "Ingest Gateway" "Accepts odd payloads" "HTTP/2 + gRPC + JSON"
      worker = container "Normalizer Worker" "Normalizes envelopes" "Kafka + Protobuf"
      ingest -> worker "normalizes__batch__payloads__after__schema__validation" "KafkaProtocolBufferEnvelopeWithVersionNegotiation"
    }
    operator -> ingest "replays__problem__messages" "HTTPS"
  }
  views {
    container telemetry "Telemetry Containers" {
      include *
      autoLayout lr
    }
  }
}`)

    await expect(workspace.getVisibleNodeByName('Ingest Gateway')).toBeVisible()
    await expect(workspace.getVisibleNodeByName('Normalizer Worker')).toBeVisible()

    const relationship = await workspace.getRelationshipByDescription('normalizes__batch__payloads__after__schema__validation')
    expect(relationship?.technology).toBe('KafkaProtocolBufferEnvelopeWithVersionNegotiation')
    expect(await workspace.getEdgeCount()).toBeGreaterThanOrEqual(2)
  })

  test('deleting an active container tears down its component view cleanly and undo restores it', async ({ workspace }) => {
    await workspace.loadSample()

    const snapshot = await workspace.getWorkspace()
    const apiContainerId = snapshot?.model.softwareSystems
      .flatMap((system) => system.containers)
      .find((container) => container.name === 'API Application')?.id
    expect(apiContainerId).toBeTruthy()

    await workspace.setView('Components')
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).toContainText('Components')

    await workspace.deleteElements([apiContainerId!])

    let views = await workspace.getViews()
    expect(views.some((view) => view.key === 'Components')).toBe(false)
    await expect(workspace.page.getByRole('button', { name: 'Switch view' })).not.toContainText('Components')

    await workspace.page.keyboard.press('Control+z')
    views = await workspace.getViews()
    expect(views.some((view) => view.key === 'Components')).toBe(true)

    await workspace.setView('Components')
    await expect(workspace.getVisibleNodeByName('Sign In Controller')).toBeVisible()
  })
})
