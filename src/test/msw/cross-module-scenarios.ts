import type {
  AdjustmentLine,
  Asset,
  AssetCustody,
  AssetMovement,
  AuditLog,
  AuditLogEntry,
  DocumentLifecycleEvent,
  InventoryAdjustment,
  InventoryBalance,
  InventoryCount,
  InventoryCountLine,
  Material,
  NamedReference,
  StockMovement,
  Warehouse,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import {
  createAsset,
  createAssetCustody,
  createAuditLog,
  createAuditLogEntry,
  createDocumentAttachment,
  createLifecycleEvent,
  createDocumentPolicy,
  createInventoryBalance,
  createMaterial,
  createNamedReference,
  createStockMovement,
  createWarehouse,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'

/**
 * Contract-backed seed graph for cross-module verification journeys.
 *
 * This is deliberately data, not a transaction simulator: the backend remains
 * responsible for posting, balance calculation, custody transitions, and
 * ledger writes. Consumers can install these read models in their own focused
 * MSW handlers without copying IDs or inventing a per-feature fixture graph.
 */
export type CrossModuleScenario = Readonly<{
  catalog: Readonly<{
    assetMaterial: Material
    consumableMaterial: Material
  }>
  warehouses: Readonly<{
    source: Warehouse
    destination: Warehouse
  }>
  documents: Readonly<{
    receiving: WarehouseDocument
    opening: WarehouseDocument
    issue: WarehouseDocument
    transfer: WarehouseDocument
    return: WarehouseDocument
    adjustment: WarehouseDocument
    disposal: WarehouseDocument
  }>
  adjustments: Readonly<{
    count: InventoryCount
    countLines: readonly InventoryCountLine[]
    countVariance: InventoryAdjustment
    disposal: InventoryAdjustment
  }>
  assets: Readonly<{
    returned: Asset
    disposed: Asset
    available: Asset
    pending: Asset
  }>
  ledgers: Readonly<{
    balances: readonly InventoryBalance[]
    stockMovements: readonly StockMovement[]
    assetMovements: readonly AssetMovement[]
    custodies: readonly AssetCustody[]
    auditLogs: readonly AuditLog[]
    lifecycleEvents: Readonly<Record<string, readonly DocumentLifecycleEvent[]>>
    orderedLifecycleEvents: readonly DocumentLifecycleEvent[]
  }>
}>

const SCENARIO_TIMESTAMP = '2026-08-27T08:00:00.000Z'
const LIFECYCLE_EVENT_SEQUENCE_START = 1000

function reference(id: string, displayName: string, code?: string): NamedReference {
  return createNamedReference({ id, displayName, ...(code === undefined ? {} : { code }) })
}

function postedPolicy(documentId: string) {
  return createDocumentPolicy({
    documentId,
    documentStatus: 'Posted',
    rowVersion: 3,
    signedOriginalSatisfied: true,
  })
}

function signedOriginal(
  documentId: string,
  filename: string,
  uploadedBy: NamedReference,
  uploadedAt: string,
) {
  return createDocumentAttachment({
    attachmentId: fixtureUuid(Number.parseInt(documentId.slice(-2), 16) + 200),
    documentId,
    originalFilename: filename,
    uploadedAt,
    uploadedBy,
  })
}

/** Rebind fixture event IDs/timestamps so this multi-document graph is globally valid. */
function createScenarioLifecycleEvents(
  document: WarehouseDocument,
  eventSequenceStart: number,
): readonly DocumentLifecycleEvent[] {
  if (document.policy.policyKind === 'Adjustment' || document.policy.policyKind === 'Disposal') {
    const postedBy = document.postedBy ?? document.createdBy
    return [
      createLifecycleEvent({
        documentId: document.documentId,
        documentRowVersion: 1,
        eventId: fixtureUuid(eventSequenceStart),
        eventType: 'Created',
        occurredAt: document.createdAt,
        occurredBy: {
          displayName: document.createdBy.displayName,
          roleNameAr: null,
          userId: document.createdBy.id,
        },
        toStatus: 'Draft',
      }),
      createLifecycleEvent({
        documentId: document.documentId,
        documentRowVersion: document.rowVersion,
        eventId: fixtureUuid(eventSequenceStart + 1),
        eventType: 'Posted',
        fromStatus: 'Draft',
        occurredAt: document.postedAt ?? document.createdAt,
        occurredBy: {
          displayName: postedBy.displayName,
          roleNameAr: null,
          userId: postedBy.id,
        },
        toStatus: 'Posted',
      }),
    ]
  }
  return deriveLifecycleEvents(document).map((event, index) => ({
    ...event,
    eventId: fixtureUuid(eventSequenceStart + index),
    occurredAt:
      event.eventType === 'Posted' && document.postedAt !== null && document.postedAt !== undefined
        ? document.postedAt
        : new Date(Date.parse(document.createdAt) + index * 60_000).toISOString(),
  }))
}

/**
 * Builds a deterministic, internally linked v1 read-model graph covering the
 * receiving/opening, issue/return, transfer, count/adjustment, asset/custody,
 * balance, stock-ledger, lifecycle, and audit seams.
 */
export function createCrossModuleScenario(): CrossModuleScenario {
  const source = createWarehouse({
    warehouseId: fixtureUuid(900),
    code: 'WH-DAM-CENTRAL',
    nameAr: 'المستودع المركزي في دمشق',
  })
  const destination = createWarehouse({
    warehouseId: fixtureUuid(901),
    code: 'WH-HMS-BRANCH',
    nameAr: 'مستودع فرع حمص',
  })
  const sourceRef = reference(source.warehouseId, source.nameAr, source.code)
  const destinationRef = reference(destination.warehouseId, destination.nameAr, destination.code)
  const siteRef = reference(fixtureUuid(902), 'المقر الرئيسي', 'DAM-HQ')
  const keeperRef = reference(fixtureUuid(903), 'أمين المستودع: سامر محمود')
  const managerRef = reference(fixtureUuid(904), 'مدير المستودع: هناء علي')
  const recipientId = fixtureUuid(905)

  const assetMaterial = createMaterial({
    materialId: fixtureUuid(906),
    code: 'IT-AST-LPT-001',
    nameAr: 'حاسوب محمول إداري',
    materialKind: 'Asset',
    requiresAssetNumber: true,
    trackingType: 'Serial',
  })
  const consumableMaterial = createMaterial({
    materialId: fixtureUuid(907),
    code: 'ST-CNS-PPR-001',
    nameAr: 'ورق تصوير A4',
    materialKind: 'Consumable',
    requiresAssetNumber: false,
    trackingType: 'Quantity',
  })

  const receivingId = fixtureUuid(910)
  const receivingLineId = fixtureUuid(911)
  const openingId = fixtureUuid(912)
  const openingLineId = fixtureUuid(913)
  const issueId = fixtureUuid(914)
  const issueLineId = fixtureUuid(915)
  const transferId = fixtureUuid(916)
  const transferLineId = fixtureUuid(917)
  const returnId = fixtureUuid(918)
  const returnLineId = fixtureUuid(919)
  const adjustmentDocumentId = fixtureUuid(920)
  const adjustmentLineId = fixtureUuid(921)
  const countId = fixtureUuid(922)
  const countLineId = fixtureUuid(923)
  const disposalAdjustmentId = fixtureUuid(924)
  const disposalDocumentId = fixtureUuid(925)
  const disposalLineId = fixtureUuid(926)
  const adjustmentDocumentLineId = fixtureUuid(928)
  const disposalDocumentLineId = fixtureUuid(929)

  const receiving = createWarehouseDocument({
    attachments: [
      signedOriginal(receivingId, 'سند-استلام-موقّع.pdf', managerRef, '2026-08-20T09:00:00.000Z'),
    ],
    createdAt: '2026-08-20T08:00:00.000Z',
    createdBy: keeperRef,
    documentId: receivingId,
    documentStatus: 'Posted',
    documentType: 'Receiving',
    lines: [
      createWarehouseDocumentLine({
        assetInputs: [
          { assetNumber: 'AST-2026-1001', serialNumber: 'SN-LPT-1001' },
          { assetNumber: 'AST-2026-1002', serialNumber: 'SN-LPT-1002' },
          { assetNumber: 'AST-2026-1003', serialNumber: 'SN-LPT-1003' },
          { assetNumber: 'AST-2026-1004', serialNumber: 'SN-LPT-1004' },
        ],
        baseQuantity: 4,
        lineId: receivingLineId,
        lineType: 'Asset',
        material: assetMaterial,
        quantity: 4,
      }),
    ],
    paperDocumentNumber: 'استلام/٢٠٢٦/١٠١',
    paperDocumentYear: 2026,
    policy: postedPolicy(receivingId),
    postedAt: '2026-08-20T10:00:00.000Z',
    postedBy: managerRef,
    rowVersion: 3,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-RCV-2026-0101',
    warehouse: sourceRef,
  })
  const opening = createWarehouseDocument({
    attachments: [
      signedOriginal(openingId, 'سند-افتتاح-موقّع.pdf', managerRef, '2026-08-18T09:00:00.000Z'),
    ],
    createdAt: '2026-08-18T08:00:00.000Z',
    createdBy: keeperRef,
    documentId: openingId,
    documentStatus: 'Posted',
    documentType: 'Opening',
    lines: [
      createWarehouseDocumentLine({
        baseQuantity: 10,
        lineId: openingLineId,
        material: consumableMaterial,
        openingType: 'Initial',
        quantity: 10,
      }),
    ],
    paperDocumentNumber: 'افتتاح/٢٠٢٦/٠٠١',
    paperDocumentYear: 2026,
    policy: postedPolicy(openingId),
    postedAt: '2026-08-18T10:00:00.000Z',
    postedBy: managerRef,
    receivingInfo: undefined,
    rowVersion: 3,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-OPN-2026-0001',
    warehouse: sourceRef,
  })
  const issue = createWarehouseDocument({
    attachments: [
      signedOriginal(issueId, 'سند-صرف-موقّع.pdf', managerRef, '2026-08-21T09:00:00.000Z'),
    ],
    createdAt: '2026-08-21T08:00:00.000Z',
    createdBy: keeperRef,
    documentId: issueId,
    documentStatus: 'Posted',
    documentType: 'Issue',
    issueTo: {
      issueReason: 'تسليم حاسوب للعمل الميداني',
      recipientDisplayName: 'مديرية المعلوماتية',
      recipientId,
      recipientType: 'OrganizationalUnit',
    },
    lines: [
      createWarehouseDocumentLine({
        availableBalance: 4,
        baseQuantity: 2,
        issuedAssetIds: [fixtureUuid(930), fixtureUuid(934)],
        lineId: issueLineId,
        lineType: 'Asset',
        material: assetMaterial,
        quantity: 2,
      }),
    ],
    paperDocumentNumber: 'صرف/٢٠٢٦/٠٠٧',
    paperDocumentYear: 2026,
    policy: postedPolicy(issueId),
    postedAt: '2026-08-21T10:00:00.000Z',
    postedBy: managerRef,
    receivingInfo: undefined,
    rowVersion: 3,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-ISS-2026-0007',
    warehouse: sourceRef,
  })
  const transfer = createWarehouseDocument({
    attachments: [
      signedOriginal(transferId, 'سند-نقل-موقّع.pdf', managerRef, '2026-08-22T09:00:00.000Z'),
    ],
    createdAt: '2026-08-22T08:00:00.000Z',
    createdBy: keeperRef,
    documentId: transferId,
    documentStatus: 'Posted',
    documentType: 'Transfer',
    lines: [
      createWarehouseDocumentLine({
        availableBalance: 10,
        baseQuantity: 3,
        lineId: transferLineId,
        material: consumableMaterial,
        quantity: 3,
      }),
    ],
    paperDocumentNumber: 'نقل/٢٠٢٦/٠٠٣',
    paperDocumentYear: 2026,
    policy: postedPolicy(transferId),
    postedAt: '2026-08-22T10:00:00.000Z',
    postedBy: managerRef,
    receivingInfo: undefined,
    rowVersion: 3,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-TRF-2026-0003',
    transferInfo: {
      destinationWarehouseId: destination.warehouseId,
      destinationWarehouseName: destination.nameAr,
      transferReason: 'تغذية فرع حمص بالورق',
    },
    warehouse: sourceRef,
  })
  const returnDocument = createWarehouseDocument({
    attachments: [
      signedOriginal(returnId, 'سند-إرجاع-موقّع.pdf', managerRef, '2026-08-23T09:00:00.000Z'),
    ],
    createdAt: '2026-08-23T08:00:00.000Z',
    createdBy: keeperRef,
    documentId: returnId,
    documentStatus: 'Posted',
    documentType: 'Return',
    lines: [
      createWarehouseDocumentLine({
        baseQuantity: 1,
        issuedAssetIds: [fixtureUuid(930)],
        lineId: returnLineId,
        lineType: 'Asset',
        material: assetMaterial,
        quantity: 1,
      }),
    ],
    paperDocumentNumber: 'إرجاع/٢٠٢٦/٠٠٢',
    paperDocumentYear: 2026,
    policy: postedPolicy(returnId),
    postedAt: '2026-08-23T10:00:00.000Z',
    postedBy: managerRef,
    receivingInfo: undefined,
    returnInfo: {
      assetIds: [fixtureUuid(930)],
      originalIssueDocumentId: issueId,
      originalIssueReference: issue.systemReferenceNumber,
      returnReason: 'إعادة الأصل بعد انتهاء المهمة',
    },
    rowVersion: 3,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-RET-2026-0002',
    warehouse: sourceRef,
  })
  const adjustmentDocument = createWarehouseDocument({
    attachments: [
      signedOriginal(
        adjustmentDocumentId,
        'سند-تسوية-جرد-موقّع.pdf',
        managerRef,
        '2026-08-24T11:45:00.000Z',
      ),
    ],
    createdAt: '2026-08-24T11:30:00.000Z',
    createdBy: managerRef,
    documentId: adjustmentDocumentId,
    documentStatus: 'Posted',
    documentType: 'Adjustment',
    lines: [
      createWarehouseDocumentLine({
        baseQuantity: 2,
        lineId: adjustmentDocumentLineId,
        material: consumableMaterial,
        quantity: 2,
      }),
    ],
    paperDocumentNumber: 'تسوية/٢٠٢٦/٠٠٤',
    paperDocumentYear: 2026,
    policy: createDocumentPolicy({
      documentId: adjustmentDocumentId,
      documentStatus: 'Posted',
      policyKind: 'Adjustment',
      rowVersion: 2,
      signedOriginalSatisfied: true,
    }),
    postedAt: '2026-08-24T12:00:00.000Z',
    postedBy: managerRef,
    receivingInfo: undefined,
    rowVersion: 2,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-ADJ-2026-0004',
    warehouse: sourceRef,
  })
  const disposalDocument = createWarehouseDocument({
    attachments: [
      signedOriginal(
        disposalDocumentId,
        'سند-إعدام-موقّع.pdf',
        managerRef,
        '2026-08-25T09:45:00.000Z',
      ),
    ],
    createdAt: '2026-08-25T09:30:00.000Z',
    createdBy: managerRef,
    documentId: disposalDocumentId,
    documentStatus: 'Posted',
    documentType: 'Adjustment',
    lines: [
      createWarehouseDocumentLine({
        baseQuantity: 1,
        lineId: disposalDocumentLineId,
        lineType: 'Asset',
        material: assetMaterial,
        quantity: 1,
      }),
    ],
    paperDocumentNumber: 'إعدام/٢٠٢٦/٠٠١',
    paperDocumentYear: 2026,
    policy: createDocumentPolicy({
      documentId: disposalDocumentId,
      documentStatus: 'Posted',
      policyKind: 'Disposal',
      rowVersion: 2,
      signedOriginalSatisfied: true,
    }),
    postedAt: '2026-08-25T10:00:00.000Z',
    postedBy: managerRef,
    receivingInfo: undefined,
    rowVersion: 2,
    site: siteRef,
    systemReferenceNumber: 'EIAMS-DSP-2026-0001',
    warehouse: sourceRef,
  })

  const returned = createAsset({
    assetId: fixtureUuid(930),
    assetNumber: 'AST-2026-1001',
    currentWarehouse: sourceRef,
    derivedStatus: 'InStock',
    material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
    receiptLineId: receivingLineId,
    serialNumber: 'SN-LPT-1001',
  })
  const disposed = createAsset({
    assetId: fixtureUuid(931),
    assetNumber: 'AST-2026-1002',
    currentWarehouse: undefined,
    derivedStatus: 'Disposed',
    material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
    receiptLineId: receivingLineId,
    serialNumber: 'SN-LPT-1002',
  })
  const available = createAsset({
    assetId: fixtureUuid(932),
    assetNumber: 'AST-2026-1003',
    currentWarehouse: sourceRef,
    derivedStatus: 'InStock',
    material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
    receiptLineId: receivingLineId,
    serialNumber: 'SN-LPT-1003',
  })
  const pending = createAsset({
    assetId: fixtureUuid(934),
    assetNumber: 'AST-2026-1004',
    currentWarehouse: undefined,
    derivedStatus: 'Issued',
    material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
    receiptLineId: receivingLineId,
    serialNumber: 'SN-LPT-1004',
  })
  const returnedCustody = createAssetCustody({
    assetId: returned.assetId,
    assetNumber: returned.assetNumber,
    custodyId: fixtureUuid(933),
    fromTs: '2026-08-21T10:00:00.000Z',
    holder: {
      displayName: 'مديرية المعلوماتية',
      id: recipientId,
      secondaryLabelAr: null,
      status: 'Active',
      type: 'OrganizationalUnit',
    },
    issueDocumentId: issueId,
    returnDocumentId: returnId,
    status: 'Closed',
    toTs: '2026-08-23T10:00:00.000Z',
  })
  const pendingCustody = createAssetCustody({
    assetId: pending.assetId,
    assetNumber: pending.assetNumber,
    custodyId: fixtureUuid(935),
    fromTs: issue.postedAt ?? SCENARIO_TIMESTAMP,
    holder: {
      displayName: 'مديرية المعلوماتية',
      id: recipientId,
      secondaryLabelAr: null,
      status: 'Active',
      type: 'OrganizationalUnit',
    },
    issueDocumentId: issueId,
    status: 'Active',
  })

  const adjustmentLine: AdjustmentLine = {
    adjustmentLineId,
    material: reference(
      consumableMaterial.materialId,
      consumableMaterial.nameAr,
      consumableMaterial.code,
    ),
    quantityDelta: 2,
    reason: 'زيادة مؤكدة بعد الجرد الفعلي',
  }
  const count: InventoryCount = {
    completedAt: '2026-08-24T11:00:00.000Z',
    countId,
    countType: 'Full',
    createdAt: '2026-08-24T08:00:00.000Z',
    createdBy: keeperRef,
    freezePolicy: 'SoftFreeze',
    lineCount: 1,
    notes: 'جرد دوري للمستودع المركزي',
    referenceNumber: 'EIAMS-CNT-2026-0004',
    rowVersion: 3,
    scope: { scopeIds: [], scopeType: 'AllMaterials', summaryAr: 'كل مواد المستودع المركزي' },
    startedAt: '2026-08-24T09:00:00.000Z',
    status: 'Completed',
    varianceCount: 1,
    warehouse: sourceRef,
  }
  const countLines: readonly InventoryCountLine[] = [
    {
      actualQuantity: 9,
      countLineId,
      difference: 2,
      material: reference(consumableMaterial.materialId, consumableMaterial.nameAr),
      reason: 'إدخال سابق لم يثبت في السجل الورقي',
      rowVersion: 1,
      snapshotQuantity: 7,
    },
  ]
  const countVariance: InventoryAdjustment = {
    adjustmentId: fixtureUuid(927),
    countId,
    countReference: count.referenceNumber,
    createdAt: '2026-08-24T11:30:00.000Z',
    createdBy: managerRef,
    documentId: adjustmentDocumentId,
    documentReference: adjustmentDocument.systemReferenceNumber,
    lines: [adjustmentLine],
    policy: adjustmentDocument.policy,
    postedAt: adjustmentDocument.postedAt ?? SCENARIO_TIMESTAMP,
    purpose: 'CountVariance',
    reason: 'تسوية فرق الجرد رقم EIAMS-CNT-2026-0004',
    rowVersion: 2,
    status: 'Posted',
    warehouse: sourceRef,
  }
  const disposal: InventoryAdjustment = {
    adjustmentId: disposalAdjustmentId,
    createdAt: '2026-08-25T09:30:00.000Z',
    createdBy: managerRef,
    documentId: disposalDocumentId,
    documentReference: disposalDocument.systemReferenceNumber,
    lines: [
      {
        adjustmentLineId: disposalLineId,
        assetId: disposed.assetId,
        assetNumber: disposed.assetNumber,
        material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
        quantityDelta: -1,
        reason: 'إعدام أصل تالف بموجب محضر اللجنة.',
      },
    ],
    policy: disposalDocument.policy,
    postedAt: disposalDocument.postedAt ?? SCENARIO_TIMESTAMP,
    purpose: 'Disposal',
    reason: 'إعدام الحاسوب المحمول التالف AST-2026-1002.',
    rowVersion: 2,
    status: 'Posted',
    warehouse: sourceRef,
  }

  const stockMovements: readonly StockMovement[] = [
    createStockMovement({
      documentId: receivingId,
      documentLineId: receivingLineId,
      documentReference: receiving.systemReferenceNumber,
      material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
      movementId: fixtureUuid(940),
      movementType: 'Receipt',
      postedAt: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: 4,
      warehouse: sourceRef,
    }),
    createStockMovement({
      documentId: openingId,
      documentLineId: openingLineId,
      documentReference: opening.systemReferenceNumber,
      material: reference(
        consumableMaterial.materialId,
        consumableMaterial.nameAr,
        consumableMaterial.code,
      ),
      movementId: fixtureUuid(941),
      movementType: 'Opening',
      postedAt: opening.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: 10,
      warehouse: sourceRef,
    }),
    createStockMovement({
      documentId: issueId,
      documentLineId: issueLineId,
      documentReference: issue.systemReferenceNumber,
      material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
      movementId: fixtureUuid(942),
      movementType: 'Issue',
      postedAt: issue.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: -2,
      warehouse: sourceRef,
    }),
    createStockMovement({
      documentId: transferId,
      documentLineId: transferLineId,
      documentReference: transfer.systemReferenceNumber,
      material: reference(
        consumableMaterial.materialId,
        consumableMaterial.nameAr,
        consumableMaterial.code,
      ),
      movementId: fixtureUuid(943),
      movementType: 'TransferOut',
      postedAt: transfer.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: -3,
      warehouse: sourceRef,
    }),
    createStockMovement({
      documentId: transferId,
      documentLineId: transferLineId,
      documentReference: transfer.systemReferenceNumber,
      material: reference(
        consumableMaterial.materialId,
        consumableMaterial.nameAr,
        consumableMaterial.code,
      ),
      movementId: fixtureUuid(944),
      movementType: 'TransferIn',
      postedAt: transfer.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: 3,
      warehouse: destinationRef,
    }),
    createStockMovement({
      documentId: returnId,
      documentLineId: returnLineId,
      documentReference: returnDocument.systemReferenceNumber,
      material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
      movementId: fixtureUuid(945),
      movementType: 'Receipt',
      postedAt: returnDocument.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: 1,
      warehouse: sourceRef,
    }),
    createStockMovement({
      documentId: adjustmentDocumentId,
      documentLineId: adjustmentDocumentLineId,
      documentReference: countVariance.documentReference,
      material: reference(
        consumableMaterial.materialId,
        consumableMaterial.nameAr,
        consumableMaterial.code,
      ),
      movementId: fixtureUuid(946),
      movementType: 'AdjustmentIn',
      postedAt: countVariance.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: adjustmentLine.quantityDelta,
      warehouse: sourceRef,
    }),
    createStockMovement({
      documentId: disposalDocumentId,
      documentLineId: disposalDocumentLineId,
      documentReference: disposal.documentReference,
      material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
      movementId: fixtureUuid(948),
      movementType: 'AdjustmentOut',
      postedAt: disposal.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef,
      quantityDelta: -1,
      warehouse: sourceRef,
    }),
  ]
  const balances: readonly InventoryBalance[] = [
    createInventoryBalance({
      balanceId: fixtureUuid(950),
      lastUpdated: '2026-08-25T10:00:00.000Z',
      lowStock: { state: 'Sufficient', thresholdQuantity: 1 },
      material: reference(assetMaterial.materialId, assetMaterial.nameAr, assetMaterial.code),
      quantity: 2,
      rowVersion: 4,
      warehouse: sourceRef,
    }),
    createInventoryBalance({
      balanceId: fixtureUuid(951),
      lastUpdated: countVariance.postedAt ?? SCENARIO_TIMESTAMP,
      lowStock: { state: 'Sufficient', thresholdQuantity: 5 },
      material: reference(
        consumableMaterial.materialId,
        consumableMaterial.nameAr,
        consumableMaterial.code,
      ),
      quantity: 9,
      rowVersion: 3,
      warehouse: sourceRef,
    }),
    createInventoryBalance({
      balanceId: fixtureUuid(952),
      lastUpdated: transfer.postedAt ?? SCENARIO_TIMESTAMP,
      lowStock: { state: 'NotConfigured', thresholdQuantity: null },
      material: reference(
        consumableMaterial.materialId,
        consumableMaterial.nameAr,
        consumableMaterial.code,
      ),
      quantity: 3,
      rowVersion: 1,
      warehouse: destinationRef,
    }),
  ]
  const assetMovements: readonly AssetMovement[] = [
    {
      assetId: returned.assetId,
      documentId: receivingId,
      documentLineId: receivingLineId,
      documentReference: receiving.systemReferenceNumber,
      eventType: 'Received',
      movementId: fixtureUuid(960),
      occurredAt: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      toWarehouse: sourceRef,
    },
    {
      assetId: returned.assetId,
      custodyId: returnedCustody.custodyId,
      documentId: issueId,
      documentLineId: issueLineId,
      documentReference: issue.systemReferenceNumber,
      eventType: 'Issued',
      fromWarehouse: sourceRef,
      movementId: fixtureUuid(961),
      occurredAt: issue.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
    },
    {
      assetId: returned.assetId,
      custodyId: returnedCustody.custodyId,
      documentId: returnId,
      documentLineId: returnLineId,
      documentReference: returnDocument.systemReferenceNumber,
      eventType: 'Returned',
      movementId: fixtureUuid(962),
      occurredAt: returnDocument.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      toWarehouse: sourceRef,
    },
    {
      assetId: disposed.assetId,
      documentId: receivingId,
      documentLineId: receivingLineId,
      documentReference: receiving.systemReferenceNumber,
      eventType: 'Received',
      movementId: fixtureUuid(963),
      occurredAt: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      toWarehouse: sourceRef,
    },
    {
      assetId: disposed.assetId,
      documentId: disposalDocumentId,
      documentLineId: disposalDocumentLineId,
      documentReference: disposal.documentReference,
      eventType: 'Disposed',
      fromWarehouse: sourceRef,
      movementId: fixtureUuid(964),
      occurredAt: disposal.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
    },
    {
      assetId: available.assetId,
      documentId: receivingId,
      documentLineId: receivingLineId,
      documentReference: receiving.systemReferenceNumber,
      eventType: 'Received',
      movementId: fixtureUuid(965),
      occurredAt: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      toWarehouse: sourceRef,
    },
    {
      assetId: pending.assetId,
      documentId: receivingId,
      documentLineId: receivingLineId,
      documentReference: receiving.systemReferenceNumber,
      eventType: 'Received',
      movementId: fixtureUuid(966),
      occurredAt: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      toWarehouse: sourceRef,
    },
    {
      assetId: pending.assetId,
      custodyId: pendingCustody.custodyId,
      documentId: issueId,
      documentLineId: issueLineId,
      documentReference: issue.systemReferenceNumber,
      eventType: 'Issued',
      fromWarehouse: sourceRef,
      movementId: fixtureUuid(967),
      occurredAt: issue.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
    },
  ]
  const redactedAuditEntry: AuditLogEntry = {
    entryId: fixtureUuid(976),
    fieldName: 'signedOriginalChecksum',
    redacted: true,
    redactionReasonAr: 'قيمة تحقق حساسة لا تُعرض في سجل التدقيق.',
  }
  const auditLogs: readonly AuditLog[] = [
    createAuditLog({
      action: 'Post',
      auditLogId: fixtureUuid(970),
      entityDisplay: receiving.systemReferenceNumber,
      entityId: receiving.documentId,
      entityType: 'WarehouseDocument',
      entries: [
        createAuditLogEntry({
          entryId: fixtureUuid(971),
          fieldName: 'documentStatus',
          newValue: 'Posted',
          oldValue: 'Submitted',
        }),
      ],
      occurredAt: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      summaryAr: 'تم ترحيل سند الاستلام مع حركاته المرتبطة.',
    }),
    createAuditLog({
      action: 'Post',
      auditLogId: fixtureUuid(972),
      entityDisplay: countVariance.documentReference,
      entityId: countVariance.adjustmentId,
      entityType: 'InventoryAdjustment',
      entries: [
        createAuditLogEntry({
          entryId: fixtureUuid(973),
          fieldName: 'status',
          newValue: 'Posted',
          oldValue: 'Draft',
        }),
      ],
      occurredAt: countVariance.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      summaryAr: 'تم ترحيل تسوية فرق الجرد.',
    }),
    createAuditLog({
      action: 'Post',
      auditLogId: fixtureUuid(974),
      entityDisplay: disposal.documentReference,
      entityId: disposal.adjustmentId,
      entityType: 'InventoryAdjustment',
      entries: [
        createAuditLogEntry({
          entryId: fixtureUuid(975),
          fieldName: 'status',
          newValue: 'Posted',
          oldValue: 'Draft',
        }),
        redactedAuditEntry,
      ],
      occurredAt: disposal.postedAt ?? SCENARIO_TIMESTAMP,
      occurredBy: managerRef,
      summaryAr: 'تم ترحيل سند إعدام الأصل.',
    }),
  ]
  const documents = {
    opening,
    receiving,
    issue,
    transfer,
    return: returnDocument,
    adjustment: adjustmentDocument,
    disposal: disposalDocument,
  }
  const lifecycleEvents = Object.fromEntries(
    Object.values(documents).map((document, index) => [
      document.documentId,
      createScenarioLifecycleEvents(document, LIFECYCLE_EVENT_SEQUENCE_START + index * 10),
    ]),
  )
  const orderedLifecycleEvents = Object.values(lifecycleEvents).flat()

  return {
    adjustments: { count, countLines, countVariance, disposal },
    assets: { returned, disposed, available, pending },
    catalog: { assetMaterial, consumableMaterial },
    documents,
    ledgers: {
      assetMovements,
      auditLogs,
      balances,
      custodies: [returnedCustody, pendingCustody],
      lifecycleEvents,
      orderedLifecycleEvents,
      stockMovements,
    },
    warehouses: { destination, source },
  }
}
