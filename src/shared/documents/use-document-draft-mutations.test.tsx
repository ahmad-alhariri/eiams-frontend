import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { apiClient } from '@/shared/services/api.client'
import { createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
import { wireDocumentDetails } from '@/test/msw/document-wire-fixtures'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import type { CompleteDraftRequest } from '@/shared/documents/types/document-wire.types'

apiClient.defaults.adapter = 'xhr'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useDocumentDetailQuery, useDocumentListQuery } from './use-document-queries'
import {
  documentDraftMutationError,
  useCompleteDraftMutation,
} from './use-document-draft-mutations'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(150)
const WAREHOUSE_ID = fixtureUuid(300)
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'

/** The empty list page the transport reads back out of the wire envelope. */
function emptyPage() {
  return okPageJson([])
}

/**
 * `complete-draft` is the ONE write that creates a document together with its
 * lines, and it answers the whole detail read. The paper pair is not part of the
 * command: it is written afterwards through `PUT /{id}/paper-reference`, guarded
 * on the version the create just issued.
 */
function draftRequest(overrides: Partial<CompleteDraftRequest> = {}): CompleteDraftRequest {
  return {
    documentType: 'Receiving',
    lines: [{ materialId: fixtureUuid(24), quantity: 5 }],
    warehouseId: WAREHOUSE_ID,
    ...overrides,
  }
}

function createdDetail() {
  return wireDocumentDetails(
    createWarehouseDocument({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      warehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
    }),
  )
}

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('useCompleteDraftMutation', () => {
  it('POSTs the draft with its lines and refreshes the scoped document list', async () => {
    const wrapper = createWrapper()
    const created = createdDetail()
    let listRequests = 0
    let postedBody: unknown
    let postedIdempotencyKey: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => {
        listRequests += 1
        return emptyPage()
      }),
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async ({ request }) => {
        postedBody = await request.json()
        postedIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)
        return apiJson(created, { status: 201 })
      }),
    )

    renderHook(() => useDocumentListQuery({}), { wrapper })
    await waitFor(() => expect(listRequests).toBe(1))

    const complete = renderHook(() => useCompleteDraftMutation(), { wrapper })
    const request = draftRequest()
    act(() => complete.result.current.mutate({ request }))

    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true))
    expect(postedBody).toEqual(request)
    // One key per user-approved save, and it travels on the header.
    expect(postedIdempotencyKey).not.toBeNull()
    expect(complete.result.current.data).toEqual(created)
    await waitFor(() => expect(listRequests).toBe(2))
  })

  it('writes the paper reference through its own route, guarded on the issued version', async () => {
    const wrapper = createWrapper()
    const created = createdDetail()
    let paperReferenceBody: unknown
    let paperReferenceIdempotencyKey: string | null = null

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, () =>
        apiJson(created, { status: 201 }),
      ),
      http.put(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/paper-reference`,
        async ({ request }) => {
          paperReferenceBody = await request.json()
          paperReferenceIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)
          return okJson({})
        },
      ),
    )

    const complete = renderHook(() => useCompleteDraftMutation(), { wrapper })
    act(() =>
      complete.result.current.mutate({
        request: draftRequest(),
        paperReference: { paperDocumentNumber: '2024/101', paperDocumentYear: 2024 },
      }),
    )

    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true))
    expect(paperReferenceBody).toEqual({
      expectedRowVersion: created.rowVersion,
      paperDocumentNumber: '2024/101',
      paperDocumentYear: 2024,
    })
    // The paper-reference route is a plain guarded write, not an idempotent one.
    expect(paperReferenceIdempotencyKey).toBeNull()
  })

  it('surfaces a failed paper-reference write instead of reporting a saved draft', async () => {
    const wrapper = createWrapper()
    const created = createdDetail()

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, () =>
        apiJson(created, { status: 201 }),
      ),
      http.put(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/paper-reference`, () =>
        errJson(409, {
          code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
          message: 'The document row version did not match.',
        }),
      ),
    )

    const complete = renderHook(() => useCompleteDraftMutation(), { wrapper })
    act(() =>
      complete.result.current.mutate({
        request: draftRequest(),
        paperReference: { paperDocumentNumber: '2024/101', paperDocumentYear: 2024 },
      }),
    )

    await waitFor(() => expect(complete.result.current.isError).toBe(true))
    expect(complete.result.current.data).toBeUndefined()
    expect(documentDraftMutationError(complete.result.current.error)).toBe(
      'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    )
  })

  it('invalidates the created document detail branch so its next read is fresh', async () => {
    const wrapper = createWrapper()
    const created = createdDetail()
    let detailRequests = 0

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, () =>
        apiJson(created, { status: 201 }),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return okJson(created)
      }),
    )

    renderHook(() => useDocumentDetailQuery(DOCUMENT_ID), { wrapper })
    await waitFor(() => expect(detailRequests).toBe(1))

    const complete = renderHook(() => useCompleteDraftMutation(), { wrapper })
    act(() => complete.result.current.mutate({ request: draftRequest() }))

    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(detailRequests).toBe(2))
  })

  it('reuses the same idempotency key across a retry and clears it after success', async () => {
    const wrapper = createWrapper()
    const created = createdDetail()
    const keys: string[] = []
    let attempt = 0

    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/complete-draft`, async ({ request }) => {
        keys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? '')
        attempt += 1
        // Fail once so the retry is a genuine retry, then succeed.
        return attempt === 1
          ? errJson(409, {
              code: 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH',
              message: 'The document row version did not match.',
            })
          : apiJson(created, { status: 201 })
      }),
    )

    const complete = renderHook(() => useCompleteDraftMutation(), { wrapper })
    const variables = { request: draftRequest() }

    act(() => complete.result.current.mutate(variables))
    await waitFor(() => expect(complete.result.current.isError).toBe(true))
    act(() => complete.result.current.mutate(variables))
    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true))

    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])

    // A later, genuinely different draft from the same mounted form gets its own key.
    act(() => complete.result.current.mutate({ request: draftRequest() }))
    await waitFor(() => expect(complete.result.current.isSuccess).toBe(true))
    expect(keys[2]).not.toBe(keys[1])
  })
})
