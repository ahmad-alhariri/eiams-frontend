import { describe, expect, it } from 'vitest'

import { apiClient } from '@/shared/services/api.client'
import type {
  DocumentLineInput,
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'
import { createMaterial, createWarehouse, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  applyDraftToDocument,
  buildDraftDocument,
  createWarehouseDocumentCreateHandler,
  createWarehouseDocumentUpdateHandler,
} from '@/test/msw/warehouse-document-handlers'

const DOCUMENTS_PATH = '/warehouse-documents'
const WAREHOUSE_ID = fixtureUuid(300)
const MATERIAL_ID = fixtureUuid(401)
const ASSET_MATERIAL_ID = fixtureUuid(402)

const material = createMaterial({ materialId: MATERIAL_ID })
const assetMaterial = createMaterial({
  materialId: ASSET_MATERIAL_ID,
  materialKind: 'Asset',
  requiresAssetNumber: true,
})
const warehouse = createWarehouse({ warehouseId: WAREHOUSE_ID })

const lookups = {
  materialOf: (materialId: string) => (materialId === MATERIAL_ID ? material : assetMaterial),
  unitOf: (unitId: string | undefined) => (unitId === undefined ? undefined : material.baseUnit),
  warehouseOf: (warehouseId: string) => (warehouseId === WAREHOUSE_ID ? warehouse : undefined),
}

function draftRequest(
  overrides: Partial<WarehouseDocumentDraftRequest> = {},
): WarehouseDocumentDraftRequest {
  return {
    documentType: 'Receiving',
    lines: [],
    paperDocumentNumber: '2024/101',
    paperDocumentYear: 2024,
    receivingInfo: { receivingType: 'Supplier', supplierRef: 'مورد الشام' },
    rowVersion: 0,
    warehouseId: WAREHOUSE_ID,
    ...overrides,
  }
}

describe('buildDraftDocument', () => {
  it('builds a complete Draft spine from a receiving draft request', () => {
    const document = buildDraftDocument(draftRequest(), {
      documentId: fixtureUuid(500),
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document).toMatchObject({
      documentId: fixtureUuid(500),
      documentStatus: 'Draft',
      documentType: 'Receiving',
      paperDocumentNumber: '2024/101',
      paperDocumentYear: 2024,
      receivingInfo: { receivingType: 'Supplier', supplierRef: 'مورد الشام' },
      rowVersion: 1,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      warehouse: { id: WAREHOUSE_ID, displayName: warehouse.nameAr },
      site: warehouse.site,
      attachments: [],
    })
    expect(document.policy).toMatchObject({ documentStatus: 'Draft', rowVersion: 1 })
    expect(document.createdBy.displayName).toBe('مستخدم تجريبي')
  })

  it('maps quantity lines to their material snapshots with Normal line type', () => {
    const input: DocumentLineInput = {
      materialId: MATERIAL_ID,
      quantity: 10,
      unitId: material.baseUnit.id,
      unitPrice: 150,
      batchNumber: 'B-1',
      expiryDate: '2026-12-31',
    }
    const document = buildDraftDocument(draftRequest({ lines: [input] }), {
      documentId: fixtureUuid(500),
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document.lines).toHaveLength(1)
    const line = document.lines[0]!
    expect(line).toMatchObject({
      lineType: 'Normal',
      quantity: 10,
      unitPrice: 150,
      batchNumber: 'B-1',
      expiryDate: '2026-12-31',
      conversionFactor: '1.000000',
      baseQuantity: 10,
      availableBalance: null,
    })
    expect(line.material.materialId).toBe(MATERIAL_ID)
    expect(line.unit).toEqual(material.baseUnit)
  })

  it('maps asset material lines with the Asset line type and passthrough asset inputs', () => {
    const input: DocumentLineInput = {
      assetInputs: [{ serialNumber: 'SR-1' }],
      materialId: ASSET_MATERIAL_ID,
      quantity: 1,
    }
    const document = buildDraftDocument(draftRequest({ lines: [input] }), {
      documentId: fixtureUuid(500),
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document.lines[0]).toMatchObject({
      lineType: 'Asset',
      quantity: 1,
      assetInputs: [{ serialNumber: 'SR-1' }],
    })
  })

  it('resolves unknown materials/warehouses through fallbacks instead of crashing', () => {
    const document = buildDraftDocument(
      draftRequest({
        lines: [{ materialId: fixtureUuid(999), quantity: 1 }],
        warehouseId: fixtureUuid(888),
      }),
      { documentId: fixtureUuid(500), systemReferenceNumber: 'EIAMS-RCV-2024-0004' },
    )
    expect(document.lines[0]?.material.materialId).toBe(fixtureUuid(999))
    expect(document.warehouse.id).toBe(fixtureUuid(888))
  })
})

describe('applyDraftToDocument', () => {
  it('replaces header, lines, and petals and bumps document and policy rowVersion', () => {
    const document = buildDraftDocument(draftRequest(), {
      documentId: fixtureUuid(500),
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })
    const updated = applyDraftToDocument(
      document,
      draftRequest({
        lines: [{ materialId: MATERIAL_ID, quantity: 7 }],
        paperDocumentNumber: '2024/102',
        receivingInfo: { receivingType: 'Return', supplierRef: 'مورد النور' },
        rowVersion: document.rowVersion,
      }),
      lookups,
    )

    expect(updated.rowVersion).toBe(document.rowVersion + 1)
    expect(updated.policy.rowVersion).toBe(document.rowVersion + 1)
    expect(updated.paperDocumentNumber).toBe('2024/102')
    expect(updated.receivingInfo).toEqual({ receivingType: 'Return', supplierRef: 'مورد النور' })
    expect(updated.lines[0]).toMatchObject({
      quantity: 7,
      material: expect.objectContaining({ materialId: MATERIAL_ID }),
    })
    expect(updated.documentStatus).toBe('Draft')
    expect(updated.createdAt).toBe(document.createdAt)
  })
})

describe('draft persistence handlers', () => {
  it('POSTs a draft and persists it into the provided store', async () => {
    const store: WarehouseDocument[] = []
    server.use(
      ...createWarehouseDocumentCreateHandler({
        documentStore: () => store,
        lookups,
        nextSystemReference: (request) => `EIAMS-RCV-${request.paperDocumentYear}-9999`,
      }),
    )

    const { data: created } = await apiClient.post<WarehouseDocument>(
      DOCUMENTS_PATH,
      draftRequest(),
    )
    expect(created.documentStatus).toBe('Draft')
    expect(created.systemReferenceNumber).toBe('EIAMS-RCV-2024-9999')
    expect(store).toHaveLength(1)
    expect(store[0]?.documentId).toBe(created.documentId)
    expect(created.receivingInfo).toEqual({ receivingType: 'Supplier', supplierRef: 'مورد الشام' })
  })

  it('PUTs a draft with a matching rowVersion and answers 409 on a stale one', async () => {
    const initial = buildDraftDocument(draftRequest(), {
      documentId: fixtureUuid(500),
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })
    const store = [initial]
    server.use(
      ...createWarehouseDocumentUpdateHandler({
        initialDocument: initial,
        documentStore: () => store,
        lookups,
      }),
    )

    const { data: updated } = await apiClient.put<WarehouseDocument>(
      `${DOCUMENTS_PATH}/${initial.documentId}`,
      draftRequest({ rowVersion: initial.rowVersion }),
    )
    expect(updated.rowVersion).toBe(initial.rowVersion + 1)
    expect(store[0]?.rowVersion).toBe(initial.rowVersion + 1)

    const stale = await apiClient
      .put(`${DOCUMENTS_PATH}/${initial.documentId}`, draftRequest({ rowVersion: 1 }))
      .catch((error: unknown) => error)
    expect(stale).toHaveProperty('response.status', 409)
    expect(stale).toHaveProperty('response.data.code', 'document.version_conflict')
  })

  it('PUTs to an unknown document answer the Arabic 404 problem', async () => {
    const initial = buildDraftDocument(draftRequest(), {
      documentId: fixtureUuid(500),
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })
    server.use(...createWarehouseDocumentUpdateHandler({ initialDocument: initial, lookups }))

    const missing = await apiClient
      .put(`${DOCUMENTS_PATH}/${fixtureUuid(777)}`, draftRequest())
      .catch((error: unknown) => error)
    expect(missing).toHaveProperty('response.status', 404)
    expect(missing).toHaveProperty('response.data.code', 'record.not_found')
  })
})
