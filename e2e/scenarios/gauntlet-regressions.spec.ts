import { test, expect } from '../fixtures/workspace'

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

    const description = workspace.page.getByText(longDescription, { exact: true }).first()
    await expect(description).toBeVisible()

    const metrics = await description.evaluate((el) => {
      const label = el.parentElement as HTMLElement | null
      if (!label) throw new Error('missing label container')
      const rect = label.getBoundingClientRect()
      const style = getComputedStyle(label)
      return {
        width: rect.width,
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
        overflowWrap: style.overflowWrap,
      }
    })

    expect(metrics.clientWidth).toBeGreaterThan(0)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2)
    expect(metrics.overflowWrap).toBe('anywhere')
    await expect(workspace.page.getByText('KafkaProtocolBufferEnvelopeWithVersionNegotiation').first()).toBeVisible()
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
    for (const description of edgeDescriptions) {
      await expect(workspace.page.getByText(description, { exact: true }).first()).toBeVisible()
    }

    const labelMetrics = await workspace.page.getByText(edgeDescriptions[0], { exact: true }).first().evaluate((el) => {
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

    await workspace.page.getByText(edgeDescriptions[0], { exact: true }).first().hover()
    await expect(workspace.page.getByText('normalizes_customer_profile_change_events_before_dispatching_to_workflows', { exact: true })).toBeVisible()
    await expect(workspace.page.getByText('MutualTLSCertificatePinning', { exact: true }).first()).toBeVisible()
  })

  test('bulk mutation workflows keep groups and relationships coherent across delete, undo, and redo', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(250)
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    await workspace.connectNodes('New System 2', 'New System 3')

    let snapshot = await workspace.getWorkspace()
    const ids = snapshot?.model.softwareSystems.map((system) => system.id) ?? []
    expect(ids).toHaveLength(3)

    await workspace.addGroup('Bulk Ops', ids)
    await workspace.deleteElements([ids[1], ids[2]])

    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(1)
    expect(snapshot?.model.relationships).toHaveLength(0)
    expect(snapshot?.model.groups[0]?.elementIds).toEqual([ids[0]])

    await workspace.page.keyboard.press('Control+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(3)
    expect(snapshot?.model.relationships).toHaveLength(2)
    expect(snapshot?.model.groups[0]?.elementIds).toHaveLength(3)

    await workspace.page.keyboard.press('Control+Shift+z')
    snapshot = await workspace.getWorkspace()
    expect(snapshot?.model.softwareSystems).toHaveLength(1)
    expect(snapshot?.model.relationships).toHaveLength(0)
    expect(snapshot?.model.groups[0]?.elementIds).toEqual([ids[0]])
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
