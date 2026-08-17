import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createDocumentService } from '@/shared/documents/document-transport'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import { normalizeApiError } from '@/shared/services/api-error'
import { withIdempotencyKey } from '@/shared/services/mutation-safety'
import type {
  DocumentActionResult,
  DocumentLifecycleEvent,
  DocumentLifecycleHistory,
  DocumentPolicy,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import { createNamedReference, createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(60)
const WAREHOUSE_ID = fixtureUuid(30)
const TIMESTAMP = '2026-08-12T09:00:00.000Z'

function createPolicyFixture(documentId: string = DOCUMENT_ID): DocumentPolicy {
  return {
    actions: [],
    advisories: [],
    blockers: [],
    documentId,
    documentStatus: 'Draft',
    evaluatedAt: TIMESTAMP,
    policyKind: 'Generic',
    rowVersion: 1,
    signedOriginalSatisfied: false,
  }
}

function createDocumentFixture(): WarehouseDocument {
  return {
    attachments: [],
    createdAt: TIMESTAMP,
    createdBy: createNamedReference({ id: fixtureUuid(10), displayName: 'أمين المستودع' }),
    documentId: DOCUMENT_ID,
    documentStatus: 'Submitted',
    documentType: 'Receiving',
    lines: [],
    paperDocumentNumber: 'DOC-001',
    paperDocumentYear: 2026,
    policy: createPolicyFixture(),
    rowVersion: 1,
    site: createNamedReference({ id: fixtureUuid(31), displayName: 'المقر الرئيسي' }),
    systemReferenceNumber: 'RCP-2026-0001',
    warehouse: createNamedReference({ id: WAREHOUSE_ID, displayName: 'المستودع المركزي' }),
  }
}

function createLifecycleEventFixture(): DocumentLifecycleEvent {
  return {
    documentId: DOCUMENT_ID,
    documentRowVersion: 1,
    eventId: fixtureUuid(61),
    eventType: 'Submitted',
    occurredAt: TIMESTAMP,
    occurredBy: { displayName: 'أمين المستودع', userId: fixtureUuid(10) },
    toStatus: 'Submitted',
  }
}

function createActionResultFixture(): DocumentActionResult {
  return { document: createDocumentFixture(), lifecycleEvent: createLifecycleEventFixture() }
}

function createHistoryFixture(): DocumentLifecycleHistory {
  return {
    currentRowVersion: 1,
    currentStatus: 'Submitted',
    documentId: DOCUMENT_ID,
    events: [createLifecycleEventFixture()],
  }
}

const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createDocumentService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) bundle.dispose()
})

describe('document transport', () => {
  it('maps document list filters to the contract query parameters without undefined keys', async () => {
    const service = setupService()
    const document = createDocumentFixture()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(url.pathname + url.search)
        return HttpResponse.json(createPage([document]))
      }),
    )

    await expect(
      service.listDocuments({
        dateFrom: '2026-07-01',
        dateTo: '2026-08-31',
        documentStatus: 'Submitted',
        documentType: 'Receiving',
        pageIndex: 2,
        pageSize: 25,
        search: 'حاسوب',
        warehouseId: WAREHOUSE_ID,
      }),
    ).resolves.toEqual(createPage([document]))
    await expect(service.listDocuments({})).resolves.toEqual(createPage([document]))

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/warehouse-documents?dateFrom=2026-07-01&dateTo=2026-08-31&documentStatus=Submitted&documentType=Receiving&pageIndex=2&pageSize=25&search=%D8%AD%D8%A7%D8%B3%D9%88%D8%A8&warehouseId=${WAREHOUSE_ID}`,
      `${API_BASE_URL}/warehouse-documents`,
    ])
  })

  it('reads document detail, history, and policy from their contract endpoints', async () => {
    const service = setupService()
    const document = createDocumentFixture()
    const history = createHistoryFixture()
    const policy = createPolicyFixture()

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(document),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json(history),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(policy),
      ),
    )

    await expect(service.getDocument(DOCUMENT_ID)).resolves.toEqual(document)
    await expect(service.getDocumentHistory(DOCUMENT_ID)).resolves.toEqual(history)
    await expect(service.getDocumentPolicy(DOCUMENT_ID)).resolves.toEqual(policy)
  })

  it('forwards draft requests to create and update without action headers', async () => {
    const service = setupService()
    const document = createDocumentFixture()
    const draftRequest = {
      documentType: 'Receiving' as const,
      lines: [],
      paperDocumentNumber: 'DOC-001',
      paperDocumentYear: 2026,
      rowVersion: 1,
      warehouseId: WAREHOUSE_ID,
    }
    const received: Array<{ body: unknown; idempotencyKey: string | null }> = []

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
        received.push({
          body: await request.json(),
          idempotencyKey: request.headers.get('Idempotency-Key'),
        })
        return HttpResponse.json(document, { status: 201 })
      }),
      http.put(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, async ({ request }) => {
        received.push({
          body: await request.json(),
          idempotencyKey: request.headers.get('Idempotency-Key'),
        })
        return HttpResponse.json(document)
      }),
    )

    await expect(service.createDocument(draftRequest)).resolves.toEqual(document)
    await expect(service.updateDocument(DOCUMENT_ID, draftRequest)).resolves.toEqual(document)

    expect(received).toEqual([
      { body: draftRequest, idempotencyKey: null },
      { body: draftRequest, idempotencyKey: null },
    ])
  })

  it('posts version-only bodies for submit/post/revise and reasoned bodies for reject/cancel/reverse', async () => {
    const service = setupService()
    const result = createActionResultFixture()
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
        return HttpResponse.json(result)
      }

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/submit`, capture('/submit')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/post`, capture('/post')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/revise`, capture('/revise')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/reject`, capture('/reject')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/cancel`, capture('/cancel')),
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/reverse`, capture('/reverse')),
    )

    await Promise.all([
      service.submitDocument(DOCUMENT_ID, 3, withIdempotencyKey(versionKey)),
      service.postDocument(DOCUMENT_ID, 3, withIdempotencyKey(versionKey)),
      service.reviseDocument(DOCUMENT_ID, 3, withIdempotencyKey(versionKey)),
      service.rejectDocument(DOCUMENT_ID, 3, 'سبب الرفض', withIdempotencyKey(reasonedKey)),
      service.cancelDocument(DOCUMENT_ID, 3, 'سبب الإلغاء', withIdempotencyKey(reasonedKey)),
      service.reverseDocument(DOCUMENT_ID, 3, 'سبب العكس', withIdempotencyKey(reasonedKey)),
    ])

    const byPath = new Map(received.map((entry) => [entry.path, entry]))

    expect(byPath.get('/submit')).toEqual({
      path: '/submit',
      body: { rowVersion: 3 },
      idempotencyKey: versionKey,
    })
    expect(byPath.get('/post')).toEqual({
      path: '/post',
      body: { rowVersion: 3 },
      idempotencyKey: versionKey,
    })
    expect(byPath.get('/revise')).toEqual({
      path: '/revise',
      body: { rowVersion: 3 },
      idempotencyKey: versionKey,
    })
    expect(byPath.get('/reject')).toEqual({
      path: '/reject',
      body: { rowVersion: 3, reason: 'سبب الرفض' },
      idempotencyKey: reasonedKey,
    })
    expect(byPath.get('/cancel')).toEqual({
      path: '/cancel',
      body: { rowVersion: 3, reason: 'سبب الإلغاء' },
      idempotencyKey: reasonedKey,
    })
    expect(byPath.get('/reverse')).toEqual({
      path: '/reverse',
      body: { rowVersion: 3, reason: 'سبب العكس' },
      idempotencyKey: reasonedKey,
    })
  })

  it('url-encodes document identifiers in every path segment', async () => {
    const service = setupService()
    const documentId = 'doc id / ١'
    const history = createHistoryFixture()

    server.use(
      http.get(
        `${API_BASE_URL}/warehouse-documents/${encodeURIComponent(documentId)}/history`,
        ({ request }) => {
          expect(new URL(request.url).pathname).toBe(
            `${API_BASE_URL}/warehouse-documents/${encodeURIComponent(documentId)}/history`,
          )
          return HttpResponse.json(history)
        },
      ),
    )

    await expect(service.getDocumentHistory(documentId)).resolves.toEqual(history)
  })

  it('leaves lifecycle conflicts for the Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/reject`, () =>
        HttpResponse.json(
          {
            code: 'document.stale',
            status: 409,
            titleAr: 'تم تعديل المستند من مستخدم آخر.',
            traceId: 'fixture-trace-id',
          },
          { status: 409 },
        ),
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
    expect(normalizeApiError(error)).toMatchObject({ status: 409, code: 'document.stale' })
  })
})
