import axios from 'axios'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import type { ApiPage } from '@/shared/api/api-contracts'
import { createDocumentService } from '@/shared/documents/document-transport'
import { normalizeApiError } from '@/shared/services/api-error'
import { withIdempotencyKey } from '@/shared/services/mutation-safety'
import type {
  CompleteDraftRequest,
  DocumentLifecycleHistory,
  WarehouseDocumentDetails,
  WarehouseDocumentSummary,
} from '@/shared/documents/types/document-wire.types'
import { createLifecycleEvent, createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
import {
  wireDocumentDetails,
  wireDocumentHistory,
  wireDocumentSummary,
  wirePolicy,
} from '@/test/msw/document-wire-fixtures'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { registerTestTransportHarness } from '@/test/support/test-transport-harness'

/**
 * Transport-level contract for the shared document spine.
 *
 * Every payload here is the WIRE record the live API serves — the flat summary
 * row, the denormalised detail read, the policy with `status`/`warnings`, the
 * history with `action`/`actorDisplayName`. The lifecycle routes are asserted
 * against the routes that actually exist: `return-to-draft` (not `revise`),
 * `reversals` with no body, and `expectedRowVersion` on every action body.
 */

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(60)
const WAREHOUSE_ID = fixtureUuid(30)
const TIMESTAMP = '2026-08-12T09:00:00.000Z'
const REVERSAL_ID = fixtureUuid(61)

function documentFixture() {
  return createWarehouseDocument({
    createdAt: TIMESTAMP,
    documentId: DOCUMENT_ID,
    documentStatus: 'Submitted',
    documentType: 'Receiving',
    lines: [],
    paperDocumentNumber: 'DOC-001',
    paperDocumentYear: 2026,
    rowVersion: 1,
    systemReferenceNumber: 'RCP-2026-0001',
    warehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
  })
}

const detailFixture = (): WarehouseDocumentDetails => wireDocumentDetails(documentFixture())
const summaryFixture = (): WarehouseDocumentSummary => wireDocumentSummary(documentFixture())

/** One submitted event, in the harness's own spelling, projected to the wire. */
function submittedEvent() {
  return createLifecycleEvent({
    documentId: DOCUMENT_ID,
    documentRowVersion: 1,
    eventId: fixtureUuid(61),
    eventType: 'Submitted',
    occurredAt: TIMESTAMP,
    occurredBy: { displayName: 'أمين المستودع', userId: fixtureUuid(10) },
    toStatus: 'Submitted',
  })
}

const historyFixture = (): DocumentLifecycleHistory =>
  wireDocumentHistory([submittedEvent()], {
    documentId: DOCUMENT_ID,
    currentStatus: 'Submitted',
    currentRowVersion: 1,
  })

/**
 * The `ApiPage` the transport produces for a one-item `okPageJson` response.
 *
 * `okPageJson` defaults page=1, pageSize=items.length=1, totalCount=1,
 * totalPages=1 and emits `has_next_page: page < totalPages`, so BOTH navigation
 * flags are false for a single full page. That is deliberate: the transport reads
 * the server's flags rather than deriving them, because pagination semantics are
 * server-owned. An `items.length >= pageSize` derivation would return true here
 * and would be inventing a rule the backend owns.
 */
const EXPECTED_PAGE = <T>(items: readonly T[]): ApiPage<T> => ({
  items,
  page: 1,
  pageSize: 1,
  totalItems: 1,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
})

// A real transport over a real Axios client (9uuf). The fixtures below serve
// the wire envelope via okJson/okPageJson, which is what the transport reads.
const createHarness = registerTestTransportHarness(API_BASE_URL)

function setupService() {
  const { transport } = createHarness()
  return createDocumentService(transport)
}

describe('document transport', () => {
  it('maps document list filters to the contract query parameters without undefined keys', async () => {
    const service = setupService()
    const document = summaryFixture()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.pathname + url.search)
        return okPageJson([document])
      }),
    )

    await expect(
      service.listDocuments({
        documentStatus: 'Submitted',
        documentType: 'Receiving',
        // The wire page is ONE-based (`PaginationQueryParameters.Page`), and so is
        // the query type: there is no zero-based `pageIndex` to convert.
        page: 2,
        pageSize: 25,
        paperDocumentNumber: 'DOC-001',
        siteId: fixtureUuid(50),
        systemReferenceNumber: 'RCP-2026',
        warehouseId: WAREHOUSE_ID,
        fromDateUtc: '2026-07-01',
        toDateUtc: '2026-08-31',
      }),
    ).resolves.toEqual(EXPECTED_PAGE([document]))
    await expect(service.listDocuments({})).resolves.toEqual(EXPECTED_PAGE([document]))

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/warehouse-documents?documentStatus=Submitted&documentType=Receiving&fromDateUtc=2026-07-01&paperDocumentNumber=DOC-001&siteId=${fixtureUuid(50)}&systemReferenceNumber=RCP-2026&toDateUtc=2026-08-31&warehouseId=${WAREHOUSE_ID}&page=2&pageSize=25`,
      `${API_BASE_URL}/warehouse-documents`,
    ])
  })

  it('reads document detail, history, and policy from their contract endpoints', async () => {
    const service = setupService()
    const document = detailFixture()
    const history = historyFixture()
    const policy = wirePolicy({ documentId: DOCUMENT_ID })

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => okJson(document)),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => okJson(history)),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => okJson(policy)),
    )

    await expect(service.getDocument(DOCUMENT_ID)).resolves.toEqual(document)
    await expect(service.getDocumentHistory(DOCUMENT_ID)).resolves.toEqual(history)
    await expect(service.getDocumentPolicy(DOCUMENT_ID)).resolves.toEqual(policy)
  })

  it('creates an empty document on the create route and answers only its id', async () => {
    const service = setupService()
    const createRequest = { documentType: 'Receiving' as const, warehouseId: WAREHOUSE_ID }
    const received: Array<{ body: unknown; idempotencyKey: string | null }> = []

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
        received.push({
          body: await request.json(),
          idempotencyKey: request.headers.get('Idempotency-Key'),
        })
        // `201 { id }` only — the caller must follow with `getDocument`.
        return apiJson({ id: DOCUMENT_ID }, { status: 201 })
      }),
    )

    await expect(service.createDocument(createRequest)).resolves.toEqual(DOCUMENT_ID)
    expect(received).toEqual([{ body: createRequest, idempotencyKey: null }])
  })

  it('saves a draft with its lines through complete-draft, keyed and answering the detail read', async () => {
    const service = setupService()
    const detail = detailFixture()
    // The paper reference is NOT part of the command — it is written afterwards
    // through `paper-reference`, guarded on the version complete-draft issued.
    const draftRequest: CompleteDraftRequest = {
      documentType: 'Receiving',
      lines: [{ assetInputs: [{ serialNumber: null }], materialId: fixtureUuid(24), quantity: 5 }],
      receivingInfo: { supplierInvoiceRef: 'INV-1', supplierPartyId: fixtureUuid(80) },
      warehouseId: WAREHOUSE_ID,
    }
    const received: Array<{ body: unknown; idempotencyKey: string | null }> = []

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async ({ request }) => {
        received.push({
          body: await request.json(),
          idempotencyKey: request.headers.get('Idempotency-Key'),
        })
        return apiJson(detail, { status: 201 })
      }),
    )

    const idempotencyKey = '11111111-1111-4111-8111-000000000020'
    await expect(
      service.completeDraft(draftRequest, withIdempotencyKey(idempotencyKey)),
    ).resolves.toEqual(detail)
    expect(received).toEqual([{ body: draftRequest, idempotencyKey }])
  })

  it('has no update-draft route: a saved draft is amended only through paper-reference', async () => {
    const service = setupService()
    const paperReference = {
      expectedRowVersion: 1,
      paperDocumentNumber: 'DOC-001',
      paperDocumentYear: 2026,
    }
    const received: Array<{ body: unknown; idempotencyKey: string | null }> = []

    server.use(
      http.put(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/paper-reference`,
        async ({ request }) => {
          received.push({
            body: await request.json(),
            idempotencyKey: request.headers.get('Idempotency-Key'),
          })
          // `EmptyResponse`: the caller re-reads rather than trusting a local copy.
          return okJson({})
        },
      ),
    )

    await expect(service.updatePaperReference(DOCUMENT_ID, paperReference)).resolves.toBeUndefined()
    expect(received).toEqual([{ body: paperReference, idempotencyKey: null }])
  })

  it('posts version-only bodies for submit/post/return-to-draft and reasoned bodies for reject/cancel', async () => {
    const service = setupService()
    const postResult = { documentId: DOCUMENT_ID, warnings: [] }
    const versionKey = '11111111-1111-4111-8111-000000000010'
    const reasonedKey = '11111111-1111-4111-8111-000000000011'
    const received: Array<{ path: string; body: unknown; idempotencyKey: string | null }> = []

    const capture =
      (path: string) =>
      async ({ request }: { request: Request }) => {
        received.push({
          path,
          body: await request.json(),
          idempotencyKey: request.headers.get('Idempotency-Key'),
        })
        // Only `post` answers anything; the other five answer `EmptyResponse`.
        return okJson(postResult)
      }

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/submit`, capture('/submit')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/post`, capture('/post')),
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/return-to-draft`,
        capture('/return-to-draft'),
      ),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/reject`, capture('/reject')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/cancel`, capture('/cancel')),
    )

    await Promise.all([
      service.submitDocument(DOCUMENT_ID, 3, withIdempotencyKey(versionKey)),
      service.postDocument(DOCUMENT_ID, 3, withIdempotencyKey(versionKey)),
      service.returnToDraft(DOCUMENT_ID, 3, 'سبب المراجعة', withIdempotencyKey(versionKey)),
      service.rejectDocument(DOCUMENT_ID, 3, 'سبب الرفض', withIdempotencyKey(reasonedKey)),
      service.cancelDocument(DOCUMENT_ID, 3, 'سبب الإلغاء', withIdempotencyKey(reasonedKey)),
    ])

    const byPath = new Map(received.map((entry) => [entry.path, entry]))

    expect(byPath.get('/submit')).toEqual({
      path: '/submit',
      body: { expectedRowVersion: 3 },
      idempotencyKey: versionKey,
    })
    expect(byPath.get('/post')).toEqual({
      path: '/post',
      body: { expectedRowVersion: 3 },
      idempotencyKey: versionKey,
    })
    expect(byPath.get('/return-to-draft')).toEqual({
      path: '/return-to-draft',
      body: { expectedRowVersion: 3, reason: 'سبب المراجعة' },
      idempotencyKey: versionKey,
    })
    expect(byPath.get('/reject')).toEqual({
      path: '/reject',
      body: { expectedRowVersion: 3, reason: 'سبب الرفض' },
      idempotencyKey: reasonedKey,
    })
    expect(byPath.get('/cancel')).toEqual({
      path: '/cancel',
      body: { expectedRowVersion: 3, reason: 'سبب الإلغاء' },
      idempotencyKey: reasonedKey,
    })
  })

  it('resolves post to the PostDocumentResponse the route actually answers', async () => {
    const service = setupService()
    const postResult = {
      documentId: DOCUMENT_ID,
      warnings: [
        {
          code: 'ActiveSoftFreeze',
          message: 'An inventory count covers the scope of this warehouse.',
          countId: null,
          warehouseId: null,
        },
      ],
    }

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/post`, () =>
        okJson(postResult),
      ),
    )

    await expect(
      service.postDocument(
        DOCUMENT_ID,
        3,
        withIdempotencyKey('11111111-1111-4111-8111-000000000030'),
      ),
    ).resolves.toEqual(postResult)
  })

  it('reverses through the bodyless reversals route and answers the NEW document id', async () => {
    const service = setupService()
    const key = '11111111-1111-4111-8111-000000000040'
    const received: Array<{ body: string; idempotencyKey: string | null }> = []

    server.use(
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/reversals`,
        async ({ request }) => {
          received.push({
            body: await request.text(),
            idempotencyKey: request.headers.get('Idempotency-Key'),
          })
          // `201 { id }` for the compensating document, which is NOT the original.
          return apiJson({ id: REVERSAL_ID }, { status: 201 })
        },
      ),
    )

    await expect(service.reverseDocument(DOCUMENT_ID, withIdempotencyKey(key))).resolves.toEqual(
      REVERSAL_ID,
    )
    expect(received).toEqual([{ body: '', idempotencyKey: key }])
  })

  it('url-encodes document identifiers in every path segment', async () => {
    const service = setupService()
    const documentId = 'doc id / ١'
    const history = historyFixture()

    server.use(
      http.get(
        `${API_BASE_URL}/warehouse-documents/${encodeURIComponent(documentId)}/history`,
        ({ request }) => {
          expect(new URL(request.url).pathname).toBe(
            `${API_BASE_URL}/warehouse-documents/${encodeURIComponent(documentId)}/history`,
          )
          return okJson(history)
        },
      ),
    )

    await expect(service.getDocumentHistory(documentId)).resolves.toEqual(history)
  })

  it('leaves lifecycle conflicts for the Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/reject`, () =>
        errJson(409, {
          code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
          message: 'The document row version did not match.',
        }),
      ),
    )

    const error = await service
      .rejectDocument(
        DOCUMENT_ID,
        1,
        'سبب الرفض',
        withIdempotencyKey('11111111-1111-4111-8111-000000000012'),
      )
      .catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      status: 409,
      code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
    })
  })
})
