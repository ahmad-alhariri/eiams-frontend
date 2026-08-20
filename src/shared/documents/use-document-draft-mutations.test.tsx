import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { apiClient } from '@/shared/services/api.client'
import { createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

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
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
} from './use-document-draft-mutations'
import type {
  WarehouseDocument,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(150)

const PAGE = {
  items: [] as WarehouseDocument[],
  meta: { pageIndex: 0, pageSize: 20, totalItems: 0, totalPages: 0 },
}

function draftRequest(
  overrides: Partial<WarehouseDocumentDraftRequest> = {},
): WarehouseDocumentDraftRequest {
  return {
    documentType: 'Receiving',
    lines: [],
    paperDocumentNumber: '2024/101',
    paperDocumentYear: 2024,
    rowVersion: 1,
    warehouseId: fixtureUuid(300),
    ...overrides,
  }
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

describe('useCreateDocumentMutation', () => {
  it('posts the draft and refreshes the scoped document list', async () => {
    const wrapper = createWrapper()
    const created = createWarehouseDocument({ documentId: DOCUMENT_ID, documentStatus: 'Draft' })
    let listRequests = 0
    let postedBody: unknown

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => {
        listRequests += 1
        return HttpResponse.json(PAGE)
      }),
      http.post(`${API_BASE_URL}/warehouse-documents`, async ({ request }) => {
        postedBody = await request.json()
        return HttpResponse.json(created, { status: 201 })
      }),
    )

    renderHook(() => useDocumentListQuery({}), { wrapper })
    await waitFor(() => expect(listRequests).toBe(1))

    const create = renderHook(() => useCreateDocumentMutation(), { wrapper })
    const request = draftRequest()
    act(() => create.result.current.mutate(request))

    await waitFor(() => expect(create.result.current.isSuccess).toBe(true))
    expect(postedBody).toEqual(request)
    await waitFor(() => expect(listRequests).toBe(2))
  })
})

describe('useUpdateDocumentMutation', () => {
  it('PUTs the draft to the document route and refreshes list and detail', async () => {
    const wrapper = createWrapper()
    const updated = createWarehouseDocument({ documentId: DOCUMENT_ID, documentStatus: 'Draft' })
    let listRequests = 0
    let detailRequests = 0
    let putUrl: string | undefined

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => {
        listRequests += 1
        return HttpResponse.json(PAGE)
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        detailRequests += 1
        return HttpResponse.json(updated)
      }),
      http.put(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, ({ request }) => {
        putUrl = new URL(request.url).pathname
        return HttpResponse.json(updated)
      }),
    )

    renderHook(() => useDocumentListQuery({}), { wrapper })
    renderHook(() => useDocumentDetailQuery(DOCUMENT_ID), { wrapper })
    await waitFor(() => expect(listRequests).toBe(1))
    await waitFor(() => expect(detailRequests).toBe(1))

    const update = renderHook(() => useUpdateDocumentMutation(), { wrapper })
    act(() => update.result.current.mutate({ documentId: DOCUMENT_ID, request: draftRequest() }))

    await waitFor(() => expect(update.result.current.isSuccess).toBe(true))
    expect(putUrl).toBe(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`)
    await waitFor(() => expect(listRequests).toBe(2))
    await waitFor(() => expect(detailRequests).toBe(2))
  })

  it('surfaces the contract 409 as an Arabic draft-persistence error', async () => {
    const wrapper = createWrapper()
    server.use(
      http.put(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(
          {
            code: 'document.version_conflict',
            detailAr: null,
            fieldErrors: [],
            status: 409,
            titleAr: 'تعارض في نسخة المستند.',
            traceId: 'trace-1',
          },
          { status: 409 },
        ),
      ),
    )

    const update = renderHook(() => useUpdateDocumentMutation(), { wrapper })
    act(() => update.result.current.mutate({ documentId: DOCUMENT_ID, request: draftRequest() }))

    await waitFor(() => expect(update.result.current.isError).toBe(true))
    expect(documentDraftMutationError(update.result.current.error)).toBe('تعارض في نسخة المستند.')
  })
})
