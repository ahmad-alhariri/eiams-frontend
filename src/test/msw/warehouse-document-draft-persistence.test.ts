import type { ApiSuccessResponse } from '@/shared/api/api-contracts'
import { describe, expect, it } from 'vitest'

import { apiClient } from '@/shared/services/api.client'
import type {
  CompleteDraftLine,
  CompleteDraftRequest,
  WarehouseDocumentDetails,
} from '@/shared/documents/types/document-wire.types'
import type { WarehouseDocument } from '@/test/msw/document-engine.types'
import {
  createMaterial,
  createNamedReference,
  createSite,
  createWarehouse,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import {
  buildCompleteDraftDocument,
  createCompleteDraftHandler,
  createPaperReferenceHandler,
} from '@/test/msw/warehouse-document-handlers'

/**
 * Draft persistence under the LIVE write contract.
 *
 * There is exactly ONE write that creates a document together with its lines —
 * `POST /warehouse-documents/complete-draft`, answering the whole detail read.
 * The bare `POST /warehouse-documents` route creates an EMPTY document and
 * answers `201 { id }`, `PUT /warehouse-documents/{documentId}` DOES NOT EXIST,
 * and the paper pair lives on its own `PUT /{id}/paper-reference` route. So there
 * is no `applyDraftToDocument` to exercise: a saved draft cannot be amended.
 */

const COMPLETE_DRAFT_PATH = '/warehouse-documents/complete-draft'
const PAPER_REFERENCE_PATH = '/warehouse-documents'
const WAREHOUSE_ID = fixtureUuid(300)
const MATERIAL_ID = fixtureUuid(401)
const ASSET_MATERIAL_ID = fixtureUuid(402)
const DOCUMENT_ID = fixtureUuid(500)

const material = createMaterial({ id: MATERIAL_ID })
const assetMaterial = createMaterial({
  id: ASSET_MATERIAL_ID,
  materialKind: 'Asset',
  requiresAssetNumber: true,
})
const warehouse = createWarehouse({ id: WAREHOUSE_ID })
const site = createSite({ id: warehouse.siteId })

const lookups = {
  materialOf: (materialId: string) =>
    materialId === MATERIAL_ID
      ? material
      : materialId === ASSET_MATERIAL_ID
        ? assetMaterial
        : undefined,
  unitOf: (unitId: string | undefined) =>
    unitId === undefined
      ? undefined
      : createNamedReference({ id: material.baseUnitId, displayName: material.baseUnitSymbol }),
  warehouseOf: (warehouseId: string) => (warehouseId === WAREHOUSE_ID ? warehouse : undefined),
  siteOf: (siteId: string) => (siteId === site.id ? site : undefined),
}

function draftRequest(overrides: Partial<CompleteDraftRequest> = {}): CompleteDraftRequest {
  return {
    documentType: 'Receiving',
    lines: [],
    receivingInfo: { supplierRef: 'مورد دمشق' },
    warehouseId: WAREHOUSE_ID,
    ...overrides,
  }
}

describe('buildCompleteDraftDocument', () => {
  it('builds a complete Draft spine from a receiving complete-draft command', () => {
    const document = buildCompleteDraftDocument(draftRequest(), {
      documentId: DOCUMENT_ID,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document).toMatchObject({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      documentType: 'Receiving',
      receivingInfo: { supplierRef: 'مورد دمشق', receivingType: 'Supplier' },
      rowVersion: 1,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      warehouse: { id: WAREHOUSE_ID, displayName: warehouse.name },
      site: { id: site.id, displayName: site.name },
      attachments: [],
    })
    expect(document.policy).toMatchObject({ documentStatus: 'Draft', rowVersion: 1 })
    expect(document.createdBy.displayName).toBe('مستخدم تجريبي')
  })

  it('leaves the paper reference at the harness default: the command has no slot for it', () => {
    // The live command carries no paper number/year; they are written afterwards
    // through `PUT /{id}/paper-reference`, guarded on the issued version.
    const document = buildCompleteDraftDocument(draftRequest(), {
      documentId: DOCUMENT_ID,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document.paperDocumentNumber).toBe('2024/123')
    expect(document.paperDocumentYear).toBe(2024)
  })

  it('maps quantity lines to their material snapshots with Normal line type', () => {
    const input: CompleteDraftLine = {
      batchNumber: 'B-1',
      expiryDate: '2026-12-31',
      materialId: MATERIAL_ID,
      quantity: 10,
      unitId: material.baseUnitId,
      unitPrice: 150,
    }
    const document = buildCompleteDraftDocument(draftRequest({ lines: [input] }), {
      documentId: DOCUMENT_ID,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document.lines).toHaveLength(1)
    const line = document.lines[0]!
    expect(line).toMatchObject({
      baseQuantity: 10,
      availableBalance: null,
      batchNumber: 'B-1',
      conversionFactor: '1.000000',
      expiryDate: '2026-12-31',
      lineType: 'Normal',
      quantity: 10,
      unitPrice: 150,
    })
    expect(line.material.materialId).toBe(MATERIAL_ID)
    expect(line.unit).toEqual(
      createNamedReference({ id: material.baseUnitId, displayName: material.baseUnitSymbol }),
    )
  })

  it('carries existing-asset ids through verbatim for an Asset-kind line', () => {
    const input: CompleteDraftLine = {
      assetIds: [fixtureUuid(910), fixtureUuid(911)],
      materialId: ASSET_MATERIAL_ID,
      quantity: 2,
    }
    const document = buildCompleteDraftDocument(draftRequest({ lines: [input] }), {
      documentId: DOCUMENT_ID,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })

    expect(document.lines[0]).toMatchObject({
      assetIds: [fixtureUuid(910), fixtureUuid(911)],
      lineType: 'Asset',
      quantity: 2,
    })
  })

  it('resolves unknown materials/warehouses through fallbacks instead of crashing', () => {
    const document = buildCompleteDraftDocument(
      draftRequest({
        lines: [{ materialId: fixtureUuid(999), quantity: 1 }],
        warehouseId: fixtureUuid(888),
      }),
      { documentId: DOCUMENT_ID, systemReferenceNumber: 'EIAMS-RCV-2024-0004' },
    )
    expect(document.lines[0]?.material.materialId).toBe(fixtureUuid(999))
    expect(document.warehouse.id).toBe(fixtureUuid(888))
  })
})

describe('draft persistence handlers', () => {
  it('POSTs a complete draft and answers the whole detail read', async () => {
    const store: WarehouseDocument[] = []
    server.use(
      ...createCompleteDraftHandler({
        documentStore: () => store,
        lookups,
        nextSystemReference: () => 'EIAMS-RCV-2024-9999',
      }),
    )

    const {
      data: { data: created },
    } = await apiClient.post<ApiSuccessResponse<WarehouseDocumentDetails>>(
      COMPLETE_DRAFT_PATH,
      draftRequest({ lines: [{ materialId: MATERIAL_ID, quantity: 4 }] }),
    )
    expect(created.documentStatus).toBe('Draft')
    expect(created.systemReferenceNumber).toBe('EIAMS-RCV-2024-9999')
    // The route answers the DETAIL read: the denormalised warehouse header, the
    // creating user and the projected lines all travel in one response.
    expect(created.warehouseId).toBe(WAREHOUSE_ID)
    expect(created.warehouseName).toBe(warehouse.name)
    expect(created.createdAtUtc).toEqual(expect.any(String))
    expect(created.lines[0]).toMatchObject({ materialId: MATERIAL_ID, quantity: 4 })
    expect(store).toHaveLength(1)
    expect(store[0]?.documentId).toBe(created.id)
    expect(created.receivingInfo).toEqual({
      supplierRef: 'مورد دمشق',
      supplierInvoiceRef: null,
      receivingType: 'Supplier',
    })
  })

  it('PUTs the paper reference with a matching version and answers 409 on a stale one', async () => {
    const initial = buildCompleteDraftDocument(draftRequest(), {
      documentId: DOCUMENT_ID,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })
    const store = [initial]
    server.use(
      ...createPaperReferenceHandler({ initialDocument: initial, documentStore: () => store }),
    )

    const {
      data: { data: updated },
    } = await apiClient.put<ApiSuccessResponse<Record<string, never>>>(
      `${PAPER_REFERENCE_PATH}/${initial.documentId}/paper-reference`,
      {
        expectedRowVersion: initial.rowVersion,
        paperDocumentNumber: '2024/102',
        paperDocumentYear: 2024,
      },
    )
    // `EmptyResponse`: the caller re-reads rather than trusting a local copy.
    expect(updated).toEqual({})
    expect(store[0]?.rowVersion).toBe(initial.rowVersion + 1)
    expect(store[0]?.paperDocumentNumber).toBe('2024/102')

    const stale = await apiClient
      .put(`${PAPER_REFERENCE_PATH}/${initial.documentId}/paper-reference`, {
        expectedRowVersion: 1,
        paperDocumentNumber: '2024/103',
        paperDocumentYear: 2024,
      })
      .catch((error: unknown) => error)
    expect(stale).toHaveProperty('response.status', 409)
    expect(stale).toHaveProperty(
      'response.data.error.code',
      'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
    )
  })

  it('answers the Arabic 404 problem for an unknown document', async () => {
    const initial = buildCompleteDraftDocument(draftRequest(), {
      documentId: DOCUMENT_ID,
      systemReferenceNumber: 'EIAMS-RCV-2024-0004',
      lookups,
    })
    server.use(...createPaperReferenceHandler({ initialDocument: initial }))

    const missing = await apiClient
      .put(`${PAPER_REFERENCE_PATH}/${fixtureUuid(777)}/paper-reference`, {
        expectedRowVersion: 1,
        paperDocumentNumber: '2024/102',
        paperDocumentYear: 2024,
      })
      .catch((error: unknown) => error)
    expect(missing).toHaveProperty('response.status', 404)
    expect(missing).toHaveProperty('response.data.error.code', 'WAREHOUSE_DOCUMENTS_NOT_FOUND')
  })
})
