import { describe, expect, it } from 'vitest'

import { createCrossModuleScenario } from '@/test/msw/cross-module-scenarios'

describe('cross-module scenario data', () => {
  it('creates a deterministic posted document graph with exact signed-copy and lifecycle links', () => {
    const scenario = createCrossModuleScenario()
    const documents = Object.values(scenario.documents)

    expect(createCrossModuleScenario()).toEqual(scenario)
    expect(documents).toHaveLength(7)
    expect(documents.every((document) => document.documentStatus === 'Posted')).toBe(true)
    expect(documents.every((document) => document.policy.signedOriginalSatisfied)).toBe(true)
    expect(
      documents.every(
        (document) =>
          document.attachments.length === 1 &&
          document.attachments[0]?.attachmentType === 'SignedOriginal' &&
          document.attachments[0]?.documentId === document.documentId &&
          document.postedAt !== null &&
          document.postedAt !== undefined &&
          document.attachments[0].uploadedAt < document.postedAt,
      ),
    ).toBe(true)
    for (const document of documents) {
      const events = scenario.ledgers.lifecycleEvents[document.documentId]
      expect(events?.at(-1)).toMatchObject({ eventType: 'Posted', toStatus: 'Posted' })
      expect(events?.map((event) => event.occurredAt)).toEqual(
        [...(events ?? [])].map((event) => event.occurredAt).sort(),
      )
      expect(events?.at(-1)?.occurredAt).toBe(document.postedAt)
    }
    const eventIds = scenario.ledgers.orderedLifecycleEvents.map((event) => event.eventId)
    expect(new Set(eventIds).size).toBe(eventIds.length)
    expect(scenario.ledgers.orderedLifecycleEvents.map((event) => event.occurredAt)).toEqual(
      [...scenario.ledgers.orderedLifecycleEvents].map((event) => event.occurredAt).sort(),
    )
    expect(scenario.documents.adjustment).toMatchObject({
      documentId: scenario.adjustments.countVariance.documentId,
      policy: expect.objectContaining({ policyKind: 'Adjustment' }),
    })
    expect(scenario.documents.disposal).toMatchObject({
      documentId: scenario.adjustments.disposal.documentId,
      policy: expect.objectContaining({ policyKind: 'Disposal' }),
    })
    for (const document of [scenario.documents.adjustment, scenario.documents.disposal]) {
      expect(
        scenario.ledgers.lifecycleEvents[document.documentId]?.map((event) => event.eventType),
      ).toEqual(['Created', 'Posted'])
    }
  })

  it('preserves document-to-line-to-stock ledger provenance and balance totals', () => {
    const scenario = createCrossModuleScenario()
    const sourceId = scenario.warehouses.source.warehouseId
    const assetMaterialId = scenario.catalog.assetMaterial.materialId
    const consumableMaterialId = scenario.catalog.consumableMaterial.materialId
    const sourceAssetDelta = scenario.ledgers.stockMovements
      .filter(
        (movement) =>
          movement.warehouse.id === sourceId && movement.material.id === assetMaterialId,
      )
      .reduce((total, movement) => total + movement.quantityDelta, 0)
    const sourceConsumableDelta = scenario.ledgers.stockMovements
      .filter(
        (movement) =>
          movement.warehouse.id === sourceId && movement.material.id === consumableMaterialId,
      )
      .reduce((total, movement) => total + movement.quantityDelta, 0)

    expect(sourceAssetDelta).toBe(2)
    expect(sourceConsumableDelta).toBe(9)
    expect(scenario.ledgers.balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          warehouse: expect.objectContaining({ id: sourceId }),
          quantity: 2,
        }),
        expect.objectContaining({
          warehouse: expect.objectContaining({ id: sourceId }),
          quantity: 9,
        }),
      ]),
    )
    expect(
      scenario.ledgers.stockMovements.every((movement) => {
        const document = documentsById(scenario).get(movement.documentId)
        return document?.lines.some((line) => line.lineId === movement.documentLineId) ?? false
      }),
    ).toBe(true)
    expect(
      scenario.ledgers.stockMovements.filter(
        (movement) => movement.documentId === scenario.documents.transfer.documentId,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ movementType: 'TransferOut', quantityDelta: -3 }),
        expect.objectContaining({ movementType: 'TransferIn', quantityDelta: 3 }),
      ]),
    )
  })

  it('models returned and disposed assets through immutable event and custody relations', () => {
    const scenario = createCrossModuleScenario()
    const returnedAssetId = scenario.assets.returned.assetId
    const returnedEvents = scenario.ledgers.assetMovements
      .filter((movement) => movement.assetId === returnedAssetId)
      .map((movement) => movement.eventType)

    expect(returnedEvents).toEqual(['Received', 'Issued', 'Returned'])
    expect(scenario.assets.returned.derivedStatus).toBe('InStock')
    expect(scenario.ledgers.custodies[0]).toMatchObject({
      assetId: returnedAssetId,
      issueDocumentId: scenario.documents.issue.documentId,
      returnDocumentId: scenario.documents.return.documentId,
      status: 'Closed',
    })
    expect(scenario.assets.disposed.derivedStatus).toBe('Disposed')
    expect(scenario.assets.pending.derivedStatus).toBe('Issued')
    expect(scenario.ledgers.custodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: scenario.assets.pending.assetId,
          issueDocumentId: scenario.documents.issue.documentId,
          status: 'Active',
          custodyKind: 'Operational',
        }),
      ]),
    )
    expect(scenario.ledgers.assetMovements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: scenario.assets.disposed.assetId,
          documentId: scenario.adjustments.disposal.documentId,
          eventType: 'Disposed',
        }),
      ]),
    )
    expect(scenario.adjustments.disposal).toMatchObject({
      purpose: 'Disposal',
      status: 'Posted',
      lines: [expect.objectContaining({ assetId: scenario.assets.disposed.assetId })],
    })
    expect(
      scenario.ledgers.assetMovements.every((movement) => {
        const document = documentsById(scenario).get(movement.documentId)
        return document?.lines.some((line) => line.lineId === movement.documentLineId) ?? false
      }),
    ).toBe(true)
  })

  it('links a completed count variance to its posted adjustment and immutable audit evidence', () => {
    const scenario = createCrossModuleScenario()

    expect(scenario.adjustments.count).toMatchObject({ status: 'Completed', varianceCount: 1 })
    expect(scenario.adjustments.countLines[0]).toMatchObject({ difference: 2, snapshotQuantity: 7 })
    expect(scenario.adjustments.countVariance).toMatchObject({
      countId: scenario.adjustments.count.countId,
      purpose: 'CountVariance',
      status: 'Posted',
    })
    expect(scenario.ledgers.stockMovements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: scenario.adjustments.countVariance.documentId,
          movementType: 'AdjustmentIn',
          quantityDelta: 2,
        }),
      ]),
    )
    expect(scenario.ledgers.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: scenario.adjustments.countVariance.adjustmentId,
          entityType: 'InventoryAdjustment',
        }),
      ]),
    )
    const redactedEntry = scenario.ledgers.auditLogs
      .flatMap((auditLog) => auditLog.entries)
      .find((entry) => entry.redacted)
    expect(redactedEntry).toMatchObject({
      fieldName: 'signedOriginalChecksum',
      redacted: true,
      redactionReasonAr: expect.any(String),
    })
    expect(redactedEntry).not.toHaveProperty('oldValue')
    expect(redactedEntry).not.toHaveProperty('newValue')
  })
})

function documentsById(scenario: ReturnType<typeof createCrossModuleScenario>) {
  return new Map(
    Object.values(scenario.documents).map((document) => [document.documentId, document]),
  )
}
