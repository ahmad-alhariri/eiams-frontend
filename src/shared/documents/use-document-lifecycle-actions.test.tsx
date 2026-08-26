import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import { Toaster } from '@/shared/ui/toaster'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import {
  createDocumentActionResult,
  createDocumentPolicy,
  createWarehouseDocument,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'
import { createWarehouseDocumentActionHandler } from '@/test/msw/warehouse-document-handlers'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as ScopeCacheKey | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  useCancelDocumentMutation,
  usePostDocumentMutation,
  useRejectDocumentMutation,
  useReverseDocumentMutation,
  useSubmitDocumentMutation,
} from './use-document-lifecycle-actions'
import {
  documentQueryKeys,
  useDocumentDetailQuery,
  useDocumentHistoryQuery,
  useDocumentPolicyQuery,
} from './use-document-queries'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(150)

const SCOPED_DOCUMENT_KEY = documentQueryKeys.document({ kind: 'enterprise' }, DOCUMENT_ID)

/**
 * Query harness: `plainWrapper` mounts only the QueryClientProvider (for the
 * detail/history/policy observers), `toastWrapper` additionally mounts the
 * Toaster surface. The mutation hook must render under exactly one Toaster so
 * toast assertions never collide with duplicate surfaces.
 */
function createHarness() {
  const client = createQueryClient()
  const plainWrapper = function PlainWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  const toastWrapper = function ToastWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <Toaster />
        {children}
      </QueryClientProvider>
    )
  }
  return { client, plainWrapper, toastWrapper }
}

function useMutableDocumentHandlers(store: { documents: WarehouseDocument[] }) {
  const counters = { detailRequests: 0, historyRequests: 0, policyRequests: 0 }
  server.use(
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
      counters.detailRequests += 1
      return HttpResponse.json(store.documents[0])
    }),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
      counters.historyRequests += 1
      return HttpResponse.json({
        documentId: DOCUMENT_ID,
        currentStatus: store.documents[0]?.documentStatus ?? 'Draft',
        currentRowVersion: store.documents[0]?.rowVersion ?? 0,
        events: deriveLifecycleEvents(store.documents[0] ?? createWarehouseDocument()),
      })
    }),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
      counters.policyRequests += 1
      return HttpResponse.json(store.documents[0]?.policy)
    }),
    ...createWarehouseDocumentActionHandler({
      initialDocument: store.documents[0]!,
      documentStore: () => store.documents,
    }),
  )
  return counters
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('useDocumentLifecycleAction family', () => {
  it('submits a Draft document: cache updated from the server result, detail branches invalidated, Arabic success toast', async () => {
    const { client, plainWrapper, toastWrapper } = createHarness()
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Draft',
          rowVersion: 1,
        }),
      ],
    }
    const requestCounters = useMutableDocumentHandlers(store)

    renderHook(() => useDocumentDetailQuery(DOCUMENT_ID), { wrapper: plainWrapper })
    renderHook(() => useDocumentHistoryQuery(DOCUMENT_ID), { wrapper: plainWrapper })
    renderHook(() => useDocumentPolicyQuery(DOCUMENT_ID), { wrapper: plainWrapper })
    const { result } = renderHook(() => useSubmitDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    await waitFor(() => expect(requestCounters.detailRequests).toBe(1))
    await waitFor(() => expect(requestCounters.historyRequests).toBe(1))
    await waitFor(() => expect(requestCounters.policyRequests).toBe(1))

    act(() => {
      result.current.mutate({ rowVersion: 1, idempotencyKey: 'submit-key-1' })
    })

    await waitFor(() =>
      expect(screen.getByText('تم إرسال السند للترحيل بنجاح')).toBeInTheDocument(),
    )
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.isConflict).toBe(false)

    const cached = client.getQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY)
    expect(cached?.documentStatus).toBe('Submitted')
    expect(cached?.rowVersion).toBe(2)

    await waitFor(() => expect(requestCounters.historyRequests).toBe(2))
    await waitFor(() => expect(requestCounters.policyRequests).toBe(2))
    expect(requestCounters.detailRequests).toBeGreaterThanOrEqual(2)
  })

  it('rejects a Submitted document with a reason and surfaces the Arabic success toast', async () => {
    const { client, toastWrapper } = createHarness()
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Submitted',
          rowVersion: 1,
        }),
      ],
    }
    useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useRejectDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({ rowVersion: 1, reason: 'مستند مكرر', idempotencyKey: 'reject-key-1' })
    })

    await waitFor(() => expect(screen.getByText('تم رفض السند')).toBeInTheDocument())
    expect(result.current.error).toBeNull()

    const cached = client.getQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY)
    expect(cached?.documentStatus).toBe('Rejected')
    expect(cached?.rowVersion).toBe(2)
  })

  it('surfaces an Arabic 422 error when a reason-required action omits the reason', async () => {
    const { client, toastWrapper } = createHarness()
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Submitted',
          rowVersion: 1,
        }),
      ],
    }
    useMutableDocumentHandlers(store)
    client.setQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY, store.documents[0])

    const { result } = renderHook(() => useRejectDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({ rowVersion: 1, idempotencyKey: 'reject-key-2' })
    })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.isConflict).toBe(false)
    // Error toasts render twice: the visible root plus the live region.
    await waitFor(() =>
      expect(screen.getAllByText('يرجى إدخال سبب الإجراء.').length).toBeGreaterThan(0),
    )

    const cached = client.getQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY)
    expect(cached?.documentStatus).toBe('Submitted')
    expect(cached?.rowVersion).toBe(1)
  })

  it('surfaces a 409 conflict with Arabic guidance and never overwrites the cache on a stale rowVersion', async () => {
    const { client, toastWrapper } = createHarness()
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Submitted',
          rowVersion: 3,
        }),
      ],
    }
    useMutableDocumentHandlers(store)
    client.setQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY, store.documents[0])

    const { result } = renderHook(() => useCancelDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({
        rowVersion: 1,
        reason: 'سبب الإلغاء',
        idempotencyKey: 'cancel-key-1',
      })
    })

    await waitFor(() => expect(result.current.isConflict).toBe(true))
    expect(result.current.error).not.toBeNull()
    // Error toasts render twice: the visible root plus the live region.
    await waitFor(() => expect(screen.getAllByText('تعذر إتمام الطلب').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getAllByText(/أعد تحميل البيانات/).length).toBeGreaterThan(0))

    const cached = client.getQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY)
    expect(cached?.documentStatus).toBe('Submitted')
    expect(cached?.rowVersion).toBe(3)
  })

  it('sends the caller idempotency key in the Idempotency-Key header', async () => {
    const { toastWrapper } = createHarness()
    let capturedKey: string | null = null
    server.use(
      http.post(
        `${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/submit`,
        async ({ request }) => {
          capturedKey = request.headers.get('Idempotency-Key')
          const updated = createWarehouseDocument({
            documentId: DOCUMENT_ID,
            documentStatus: 'Submitted',
            rowVersion: 2,
          })
          return HttpResponse.json(
            createDocumentActionResult('Submit', {
              document: updated,
            }),
          )
        },
      ),
    )

    const { result } = renderHook(() => useSubmitDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({ rowVersion: 1, idempotencyKey: 'retry-safe-key-42' })
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(capturedKey).toBe('retry-safe-key-42')
    expect(result.current.error).toBeNull()
  })

  it('posts a Submitted document: cache updated and Arabic success toast', async () => {
    const { client, toastWrapper } = createHarness()
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Submitted',
          rowVersion: 1,
          policy: createDocumentPolicy({
            documentId: DOCUMENT_ID,
            documentStatus: 'Submitted',
            rowVersion: 1,
            signedOriginalSatisfied: true,
          }),
        }),
      ],
    }
    useMutableDocumentHandlers(store)

    const { result } = renderHook(() => usePostDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({ rowVersion: 1, idempotencyKey: 'post-key-1' })
    })

    await waitFor(() => expect(screen.getByText('تم ترحيل السند بنجاح')).toBeInTheDocument())
    expect(result.current.error).toBeNull()

    const cached = client.getQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY)
    expect(cached?.documentStatus).toBe('Posted')
    expect(cached?.rowVersion).toBe(2)
  })

  it('reverses a Posted document with a reason: cache updated and Arabic success toast', async () => {
    const { client, toastWrapper } = createHarness()
    const store = {
      documents: [
        createWarehouseDocument({
          documentId: DOCUMENT_ID,
          documentStatus: 'Posted',
          rowVersion: 2,
        }),
      ],
    }
    useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useReverseDocumentMutation(DOCUMENT_ID), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({
        rowVersion: 2,
        reason: 'خطأ في الترحيل',
        idempotencyKey: 'reverse-key-1',
      })
    })

    await waitFor(() => expect(screen.getByText('تم عكس السند')).toBeInTheDocument())
    expect(result.current.error).toBeNull()

    const cached = client.getQueryData<WarehouseDocument>(SCOPED_DOCUMENT_KEY)
    expect(cached?.documentStatus).toBe('Reversed')
    expect(cached?.rowVersion).toBe(3)
  })

  it('is a zero-network mutation when the documentId is null', async () => {
    const { toastWrapper } = createHarness()
    let submitCalls = 0
    server.use(
      http.post(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/submit`, () => {
        submitCalls += 1
        return HttpResponse.json(createDocumentActionResult('Submit'))
      }),
    )

    const { result } = renderHook(() => useSubmitDocumentMutation(null), {
      wrapper: toastWrapper,
    })

    act(() => {
      result.current.mutate({ rowVersion: 1, idempotencyKey: 'noop-key' })
    })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(submitCalls).toBe(0)
    expect(result.current.isConflict).toBe(false)
  })
})
