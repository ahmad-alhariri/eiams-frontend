// The asset registry rows follow the LIVE wire contracts: flat rows with `id`
// and `currentStatus`, a typed `holderType`/`holderId` pair on the custody
// row, and no nested material/warehouse reference — the API sends none.
import type {
  Asset,
  AssetCustodyTimelineRow,
  AssetMovement,
} from '@/modules/asset/types/asset.types'
import type {
  DocumentLifecycleEvent,
  NamedReference,
  WarehouseDocument,
} from '@/test/msw/document-engine.types'
import type {
  InventoryCount,
  InventoryCountLine,
} from '@/modules/inventory-count/types/inventory-count.types'
import type { AdjustmentDetail } from '@/modules/adjustment/types/adjustment.types'
// `Warehouse` is typed against the handwritten contract, NOT the frozen generated
// snapshot: the wire record serves `id` + `name` and a FLAT `siteId`, so the
// generated `Warehouse` (whose `warehouseId`/`nameAr`/nested `site` fields this
// file used) describes nothing the backend ever returned.
import type { Warehouse } from '@/modules/warehouse/types/warehouse.api-types'
// Same argument for `Material`. The generated type nests `baseUnit`/`category`/
// `domain`/`family` and names the identity `materialId`; the wire serves a flat
// `id`, `baseUnitId`/`baseUnitSymbol` and `materialDomainId`/`materialDomainName`,
// so only the handwritten contract describes a real material.
import type { Material } from '@/modules/catalog/types/catalog.api-types'
// StockMovement and InventoryBalance: handwritten wire shapes — flat
// warehouse/material columns, `postedBy: Uuid`, `id` (not `movementId` /
// `balanceId`). Mirrored in factories.ts.
import type { InventoryBalance, StockMovement } from '@/modules/inventory/types/inventory.api-types'
// The audit ledger follows the same rule: the LIVE wire is
// `Application.AuditLogs.AuditLogListItemResponse` (headers only — no entries)
// for the list and `AuditLogDetailsResponse` (the header plus the field diff)
// for the detail. `id`, not `auditLogId`; `createdAtUtc`, not `occurredAt`.
import type {
  AuditLogDetail,
  AuditLogEntry,
  AuditLogHeader,
} from '@/modules/audit/types/audit.api-types'
import {
  createAsset,
  createAssetCustody,
  createAuditLogDetail,
  createAuditLogEntry,
  createDocumentAttachment,
  createLifecycleEvent,
  createDocumentPolicy,
  createInventoryBalance,
  createMaterial,
  createNamedReference,
  createSite,
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
    countVariance: AdjustmentDetail
    disposal: AdjustmentDetail
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
    custodies: readonly AssetCustodyTimelineRow[]
    auditLogs: readonly AuditLogHeader[]
    auditLogDetails: readonly AuditLogDetail[]
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
    id: fixtureUuid(900),
    code: 'WH-DAM-CENTRAL',
    name: 'المستودع المركزي في دمشق',
  })
  const destination = createWarehouse({
    id: fixtureUuid(901),
    code: 'WH-HMS-BRANCH',
    name: 'مستودع فرع حمص',
  })
  const sourceRef = reference(source.id, source.name, source.code)
  // Both warehouses inherit `siteId` from `createWarehouse` (`fixtureUuid(50)`,
  // the id `createSite` uses), so the documents' site reference is resolved from
  // that same seeded site rather than from a second, unrelated site id — the old
  // fictional graph pointed documents and warehouses at different sites.
  const scenarioSite = createSite()
  const siteRef = reference(scenarioSite.id, scenarioSite.name, scenarioSite.code)
  const keeperRef = reference(fixtureUuid(903), 'أمين المستودع: سامر محمود')
  const managerRef = reference(fixtureUuid(904), 'مدير المستودع: هناء علي')
  const recipientId = fixtureUuid(905)

  const assetMaterial = createMaterial({
    id: fixtureUuid(906),
    code: 'IT-AST-LPT-001',
    nameAr: 'حاسوب محمول إداري',
    materialKind: 'Asset',
    requiresAssetNumber: true,
    trackingType: 'Serial',
  })
  const consumableMaterial = createMaterial({
    id: fixtureUuid(907),
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
      destinationWarehouseId: destination.id,
      destinationWarehouseName: destination.name,
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
    id: fixtureUuid(930),
    assetNumber: 'AST-2026-1001',
    currentStatus: 'InStock',
    materialId: assetMaterial.id,
    materialCode: assetMaterial.code,
    materialNameAr: assetMaterial.nameAr,
    serialNumber: 'SN-LPT-1001',
    warehouseId: source.id,
    warehouseCode: source.code,
    warehouseName: source.name,
  })
  const disposed = createAsset({
    id: fixtureUuid(931),
    assetNumber: 'AST-2026-1002',
    currentStatus: 'Disposed',
    materialId: assetMaterial.id,
    materialCode: assetMaterial.code,
    materialNameAr: assetMaterial.nameAr,
    serialNumber: 'SN-LPT-1002',
    warehouseId: source.id,
    warehouseCode: source.code,
    warehouseName: source.name,
  })
  const available = createAsset({
    id: fixtureUuid(932),
    assetNumber: 'AST-2026-1003',
    currentStatus: 'InStock',
    materialId: assetMaterial.id,
    materialCode: assetMaterial.code,
    materialNameAr: assetMaterial.nameAr,
    serialNumber: 'SN-LPT-1003',
    warehouseId: source.id,
    warehouseCode: source.code,
    warehouseName: source.name,
  })
  const pending = createAsset({
    id: fixtureUuid(934),
    assetNumber: 'AST-2026-1004',
    currentStatus: 'Issued',
    materialId: assetMaterial.id,
    materialCode: assetMaterial.code,
    materialNameAr: assetMaterial.nameAr,
    serialNumber: 'SN-LPT-1004',
    warehouseId: source.id,
    warehouseCode: source.code,
    warehouseName: source.name,
  })
  const returnedCustody = createAssetCustody({
    assetId: returned.id,
    custodyId: fixtureUuid(933),
    fromUtc: '2026-08-21T10:00:00.000Z',
    holderType: 'OrganizationalUnit',
    holderId: recipientId,
    issueDocumentId: issueId,
    returnDocumentId: returnId,
    status: 'Closed',
    toUtc: '2026-08-23T10:00:00.000Z',
  })
  const pendingCustody = createAssetCustody({
    assetId: pending.id,
    custodyId: fixtureUuid(935),
    fromUtc: issue.postedAt ?? SCENARIO_TIMESTAMP,
    holderType: 'OrganizationalUnit',
    holderId: recipientId,
    issueDocumentId: issueId,
    status: 'Active',
  })

  // Engine-side countVariance line data: the wire delta the posted stock
  // movement carries; the module-owned adjustment line below mirrors it.
  const countAdjustmentDelta = 2
  const count: InventoryCount = {
    id: countId,
    warehouseId: sourceRef.id,
    countType: 'Cycle',
    scopeType: 'EntireWarehouse',
    freezePolicy: 'SoftFreeze',
    status: 'Completed',
    rowVersion: 3,
    plannedAtUtc: '2026-08-24T08:00:00.000Z',
    startedAtUtc: '2026-08-24T09:00:00.000Z',
    completedAtUtc: '2026-08-24T11:00:00.000Z',
    closedAtUtc: null,
    abortedAtUtc: null,
    materialDomainId: null,
    summary: { totalLines: 1, countedLines: 1, varianceLines: 1, totalAbsoluteDifference: 2 },
    settlement: { status: 'Pending', adjustmentId: null, adjustmentStatus: null },
  }
  const countLines: readonly InventoryCountLine[] = [
    {
      id: countLineId,
      materialId: consumableMaterial.id,
      assetId: null,
      actualQuantity: 9,
      difference: 2,
      varianceReason: 'إدخال سابق لم يثبت في السجل الورقي',
      snapshotQuantity: 7,
    },
  ]
  /**
   * The module's OWN adjustment reads (D-INT-02): flat camelCase rows with no
   * embedded policy/attachments. `id` is simultaneously the shared document
   * engine's documentId, which is how policy and attachments stay reachable.
   */
  const countVariance: AdjustmentDetail = {
    id: adjustmentDocumentId,
    warehouseId: sourceRef.id,
    warehouseCode: 'WH-01',
    warehouseName: sourceRef.displayName,
    countId,
    purpose: 'CountVariance',
    status: 'Posted',
    reason: 'تسوية فرق الجرد رقم EIAMS-CNT-2026-0004',
    systemReferenceNumber: adjustmentDocument.systemReferenceNumber,
    documentStatus: 'Posted',
    createdAtUtc: '2026-08-24T11:30:00.000Z',
    postedAtUtc: adjustmentDocument.postedAt ?? SCENARIO_TIMESTAMP,
    rowVersion: 2,
    lines: [
      {
        lineId: adjustmentLineId,
        materialId: consumableMaterial.id,
        materialCode: consumableMaterial.code,
        materialNameAr: consumableMaterial.nameAr,
        quantity: countAdjustmentDelta,
        difference: countAdjustmentDelta,
        reason: 'زيادة مؤكدة بعد الجرد الفعلي',
        assets: [],
      },
    ],
  }
  const disposal: AdjustmentDetail = {
    id: disposalDocumentId,
    warehouseId: sourceRef.id,
    warehouseCode: 'WH-01',
    warehouseName: sourceRef.displayName,
    countId: null,
    purpose: 'Disposal',
    status: 'Posted',
    reason: 'إعدام الحاسوب المحمول التالف AST-2026-1002.',
    systemReferenceNumber: disposalDocument.systemReferenceNumber,
    documentStatus: 'Posted',
    createdAtUtc: '2026-08-25T09:30:00.000Z',
    postedAtUtc: disposalDocument.postedAt ?? SCENARIO_TIMESTAMP,
    rowVersion: 2,
    lines: [
      {
        lineId: disposalLineId,
        materialId: assetMaterial.id,
        materialCode: assetMaterial.code,
        materialNameAr: assetMaterial.nameAr,
        quantity: -1,
        difference: -1,
        reason: 'إعدام أصل تالف بموجب محضر اللجنة.',
        assets: [
          {
            id: disposed.id,
            assetNumber: disposed.assetNumber,
            serialNumber: disposed.serialNumber ?? null,
          },
        ],
      },
    ],
  }

  const stockMovements: readonly StockMovement[] = [
    createStockMovement({
      documentId: receivingId,
      lineId: receivingLineId,
      documentReferenceNumber: receiving.systemReferenceNumber,
      materialId: assetMaterial.id,
      materialCode: assetMaterial.code,
      materialNameAr: assetMaterial.nameAr,
      id: fixtureUuid(940),
      movementType: 'Receipt',
      postedAtUtc: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: 4,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createStockMovement({
      documentId: openingId,
      lineId: openingLineId,
      documentReferenceNumber: opening.systemReferenceNumber,
      materialId: consumableMaterial.id,
      materialCode: consumableMaterial.code,
      materialNameAr: consumableMaterial.nameAr,
      id: fixtureUuid(941),
      movementType: 'Opening',
      postedAtUtc: opening.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: 10,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createStockMovement({
      documentId: issueId,
      lineId: issueLineId,
      documentReferenceNumber: issue.systemReferenceNumber,
      materialId: assetMaterial.id,
      materialCode: assetMaterial.code,
      materialNameAr: assetMaterial.nameAr,
      id: fixtureUuid(942),
      movementType: 'Issue',
      postedAtUtc: issue.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: -2,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createStockMovement({
      documentId: transferId,
      lineId: transferLineId,
      documentReferenceNumber: transfer.systemReferenceNumber,
      materialId: consumableMaterial.id,
      materialCode: consumableMaterial.code,
      materialNameAr: consumableMaterial.nameAr,
      id: fixtureUuid(943),
      movementType: 'TransferOut',
      postedAtUtc: transfer.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: -3,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createStockMovement({
      documentId: transferId,
      lineId: transferLineId,
      documentReferenceNumber: transfer.systemReferenceNumber,
      materialId: consumableMaterial.id,
      materialCode: consumableMaterial.code,
      materialNameAr: consumableMaterial.nameAr,
      id: fixtureUuid(944),
      movementType: 'TransferIn',
      postedAtUtc: transfer.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: 3,
      warehouseId: destination.id,
      warehouseCode: destination.code,
      warehouseName: destination.name,
    }),
    createStockMovement({
      documentId: returnId,
      lineId: returnLineId,
      documentReferenceNumber: returnDocument.systemReferenceNumber,
      materialId: assetMaterial.id,
      materialCode: assetMaterial.code,
      materialNameAr: assetMaterial.nameAr,
      id: fixtureUuid(945),
      movementType: 'Receipt',
      postedAtUtc: returnDocument.postedAt ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: 1,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createStockMovement({
      documentId: adjustmentDocumentId,
      lineId: adjustmentDocumentLineId,
      documentReferenceNumber: countVariance.systemReferenceNumber,
      materialId: consumableMaterial.id,
      materialCode: consumableMaterial.code,
      materialNameAr: consumableMaterial.nameAr,
      id: fixtureUuid(946),
      movementType: 'AdjustmentIn',
      postedAtUtc: countVariance.postedAtUtc ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: countAdjustmentDelta,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createStockMovement({
      documentId: disposalDocumentId,
      lineId: disposalDocumentLineId,
      documentReferenceNumber: disposal.systemReferenceNumber,
      materialId: assetMaterial.id,
      materialCode: assetMaterial.code,
      materialNameAr: assetMaterial.nameAr,
      id: fixtureUuid(948),
      movementType: 'AdjustmentOut',
      postedAtUtc: disposal.postedAtUtc ?? SCENARIO_TIMESTAMP,
      postedBy: managerRef.id,
      quantityDelta: -1,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
  ]
  const balances: readonly InventoryBalance[] = [
    createInventoryBalance({
      id: fixtureUuid(950),
      lastUpdatedUtc: '2026-08-25T10:00:00.000Z',
      lowStock: { state: 1, thresholdQuantity: 1 },
      materialId: assetMaterial.id,
      materialCode: assetMaterial.code,
      materialNameAr: assetMaterial.nameAr,
      quantity: 2,
      rowVersion: 4,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createInventoryBalance({
      id: fixtureUuid(951),
      lastUpdatedUtc: countVariance.postedAtUtc ?? SCENARIO_TIMESTAMP,
      lowStock: { state: 1, thresholdQuantity: 5 },
      materialId: consumableMaterial.id,
      materialCode: consumableMaterial.code,
      materialNameAr: consumableMaterial.nameAr,
      quantity: 9,
      rowVersion: 3,
      warehouseId: source.id,
      warehouseCode: source.code,
      warehouseName: source.name,
    }),
    createInventoryBalance({
      id: fixtureUuid(952),
      lastUpdatedUtc: transfer.postedAt ?? SCENARIO_TIMESTAMP,
      lowStock: { state: 2, thresholdQuantity: null },
      materialId: consumableMaterial.id,
      materialCode: consumableMaterial.code,
      materialNameAr: consumableMaterial.nameAr,
      quantity: 3,
      rowVersion: 1,
      warehouseId: destination.id,
      warehouseCode: destination.code,
      warehouseName: destination.name,
    }),
  ]
  const assetMovements: readonly AssetMovement[] = [
    {
      id: fixtureUuid(960),
      assetId: returned.id,
      documentId: receivingId,
      documentReferenceNumber: receiving.systemReferenceNumber,
      documentType: 'Receiving',
      movementType: 'Received',
      movedAtUtc: receiving.postedAt ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(961),
      assetId: returned.id,
      documentId: issueId,
      documentReferenceNumber: issue.systemReferenceNumber,
      documentType: 'Issue',
      movementType: 'Issued',
      movedAtUtc: issue.postedAt ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(962),
      assetId: returned.id,
      documentId: returnId,
      documentReferenceNumber: returnDocument.systemReferenceNumber,
      documentType: 'Return',
      movementType: 'Returned',
      movedAtUtc: returnDocument.postedAt ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(963),
      assetId: disposed.id,
      documentId: receivingId,
      documentReferenceNumber: receiving.systemReferenceNumber,
      documentType: 'Receiving',
      movementType: 'Received',
      movedAtUtc: receiving.postedAt ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(964),
      assetId: disposed.id,
      documentId: disposalDocumentId,
      documentReferenceNumber: disposal.systemReferenceNumber,
      documentType: 'Adjustment',
      movementType: 'Disposed',
      movedAtUtc: disposal.postedAtUtc ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(965),
      assetId: available.id,
      documentId: receivingId,
      documentReferenceNumber: receiving.systemReferenceNumber,
      documentType: 'Receiving',
      movementType: 'Received',
      movedAtUtc: receiving.postedAt ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(966),
      assetId: pending.id,
      documentId: receivingId,
      documentReferenceNumber: receiving.systemReferenceNumber,
      documentType: 'Receiving',
      movementType: 'Received',
      movedAtUtc: receiving.postedAt ?? SCENARIO_TIMESTAMP,
    },
    {
      id: fixtureUuid(967),
      assetId: pending.id,
      documentId: issueId,
      documentReferenceNumber: issue.systemReferenceNumber,
      documentType: 'Issue',
      movementType: 'Issued',
      movedAtUtc: issue.postedAt ?? SCENARIO_TIMESTAMP,
    },
  ]
  // A redacted entry carries NO value: the server nulls `oldValue`/`newValue`
  // and names the reason with a CODE (`AuditSensitiveDataPolicy.GetReason`),
  // not with an Arabic sentence — the display layer owns the sentence.
  const redactedAuditEntry: AuditLogEntry = {
    id: fixtureUuid(976),
    fieldName: 'signedOriginalChecksum',
    oldValue: null,
    newValue: null,
    isRedacted: true,
    redactionReason: 'CONFIDENTIAL_CREDENTIAL',
    fieldDisplayAr: null,
    fieldDisplayEn: null,
  }
  const auditLogDetails: readonly AuditLogDetail[] = [
    createAuditLogDetail({
      id: fixtureUuid(970),
      action: 'Post',
      entityId: receiving.documentId,
      entityType: 'WarehouseDocument',
      entries: [
        createAuditLogEntry({
          id: fixtureUuid(971),
          fieldName: 'documentStatus',
          newValue: 'Posted',
          oldValue: 'Submitted',
        }),
      ],
      createdAtUtc: receiving.postedAt ?? SCENARIO_TIMESTAMP,
      summary: 'تم ترحيل سند الاستلام مع حركاته المرتبطة.',
      userId: managerRef.id,
    }),
    createAuditLogDetail({
      id: fixtureUuid(972),
      action: 'Post',
      entityId: countVariance.id,
      entityType: 'InventoryAdjustment',
      entries: [
        createAuditLogEntry({
          id: fixtureUuid(973),
          fieldName: 'status',
          newValue: 'Posted',
          oldValue: 'Draft',
        }),
      ],
      createdAtUtc: countVariance.postedAtUtc ?? SCENARIO_TIMESTAMP,
      summary: 'تم ترحيل تسوية فرق الجرد.',
      userId: managerRef.id,
    }),
    createAuditLogDetail({
      id: fixtureUuid(974),
      action: 'Post',
      entityId: disposal.id,
      entityType: 'InventoryAdjustment',
      entries: [
        createAuditLogEntry({
          id: fixtureUuid(975),
          fieldName: 'status',
          newValue: 'Posted',
          oldValue: 'Draft',
        }),
        redactedAuditEntry,
      ],
      createdAtUtc: disposal.postedAtUtc ?? SCENARIO_TIMESTAMP,
      summary: 'تم ترحيل سند إعدام الأصل.',
      userId: managerRef.id,
    }),
  ]
  /**
   * The LIST projection of the same operations.
   *
   * `AuditLogListItemResponse` carries no field values and no entries, so the
   * list row is the header alone: the detail-only members (the summary, the IP
   * address, the redaction flags and the field diff) are simply absent.
   */
  const auditLogs: readonly AuditLogHeader[] = auditLogDetails.map((detail) => ({
    action: detail.action,
    actionDisplayAr: detail.actionDisplayAr,
    actionDisplayEn: detail.actionDisplayEn,
    aggregateId: detail.aggregateId,
    aggregateType: detail.aggregateType,
    commandName: detail.commandName,
    createdAtUtc: detail.createdAtUtc,
    entityId: detail.entityId,
    entityType: detail.entityType,
    entityTypeDisplayAr: detail.entityTypeDisplayAr,
    entityTypeDisplayEn: detail.entityTypeDisplayEn,
    id: detail.id,
    operationId: detail.operationId,
    requestId: detail.requestId,
    userId: detail.userId,
  }))
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
      auditLogDetails,
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
