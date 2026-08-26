import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type { DocumentLifecycleHistory, WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import { createLifecycleEvent, createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as ScopeCacheKey | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useDocumentConflictRecovery } from './use-document-conflict-recovery'
import { documentQueryKeys } from './use-document-queries'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(160)

function createHarness() {
  const client = createQueryClient()
  const wrapper = function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper }
}

function useMutableDocumentHandlers(store: {
  documents: WarehouseDocument[]
  historyEvents?: DocumentLifecycleHistory['events']
}) {
  const counters = { detailRequests: 0, historyRequests: 0, policyRequests: 0 }
  server.use(
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
      counters.detailRequests += 1
      return HttpResponse.json(store.documents[0])
    }),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
      counters.policyRequests += 1
      return HttpResponse.json(store.documents[0]?.policy)
    }),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
      counters.historyRequests += 1
      const document = store.documents[0]
      return HttpResponse.json({
        currentRowVersion: document?.rowVersion ?? 0,
        currentStatus: document?.documentStatus ?? 'Draft',
        documentId: DOCUMENT_ID,
        events: store.historyEvents ?? [],
      } satisfies DocumentLifecycleHistory)
    }),
  )
  return counters
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('useDocumentConflictRecovery', () => {
  it('stays idle until reportConflict starts the recovery flow', async () => {
    const { wrapper } = createHarness()
    const store = { documents: [createWarehouseDocument({ documentId: DOCUMENT_ID })] }
    const counters = useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useDocumentConflictRecovery(DOCUMENT_ID), { wrapper })

    await waitFor(() => expect(counters.detailRequests).toBe(1))
    await waitFor(() => expect(counters.historyRequests).toBe(1))
    await waitFor(() => expect(counters.policyRequests).toBe(1))
    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })

    act(() => {
      result.current.reportConflict()
    })

    expect(result.current.conflict).toEqual({ active: true, isRefreshing: false })
  })

  it('recover refetches detail, lifecycle history, and policy and clears the conflict once refreshed', async () => {
    const { client, wrapper } = createHarness()
    const store = {
      documents: [createWarehouseDocument({ documentId: DOCUMENT_ID, rowVersion: 1 })],
      historyEvents: [] as DocumentLifecycleHistory['events'],
    }
    const counters = useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useDocumentConflictRecovery(DOCUMENT_ID), { wrapper })

    await waitFor(() => expect(counters.detailRequests).toBe(1))
    await waitFor(() => expect(counters.historyRequests).toBe(1))
    await waitFor(() => expect(counters.policyRequests).toBe(1))

    act(() => {
      result.current.reportConflict()
    })
    expect(result.current.conflict.active).toBe(true)

    // The server moved on while the user worked: a newer version exists.
    store.documents[0] = createWarehouseDocument({ documentId: DOCUMENT_ID, rowVersion: 2 })
    store.historyEvents = [
      createLifecycleEvent({
        documentId: DOCUMENT_ID,
        documentRowVersion: 2,
        eventId: fixtureUuid(161),
        eventType: 'Posted',
        fromStatus: 'Submitted',
        reason: 'حدث دورة حياة أحدث من الخادم',
        toStatus: 'Posted',
      }),
    ]

    let recoverPromise: Promise<void> | undefined
    act(() => {
      recoverPromise = result.current.recover()
    })
    expect(result.current.conflict).toEqual({ active: true, isRefreshing: true })
    await act(async () => {
      await recoverPromise
    })

    expect(counters.detailRequests).toBe(2)
    expect(counters.historyRequests).toBe(2)
    expect(counters.policyRequests).toBe(2)
    const freshHistory = client.getQueryData<DocumentLifecycleHistory>(
      documentQueryKeys.history({ kind: 'enterprise' }, DOCUMENT_ID),
    )
    expect(freshHistory?.currentRowVersion).toBe(2)
    expect(freshHistory?.events[0]?.reason).toBe('حدث دورة حياة أحدث من الخادم')
    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })
  })

  it('dismiss clears the conflict without refetching', async () => {
    const { wrapper } = createHarness()
    const store = { documents: [createWarehouseDocument({ documentId: DOCUMENT_ID })] }
    const counters = useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useDocumentConflictRecovery(DOCUMENT_ID), { wrapper })

    await waitFor(() => expect(counters.detailRequests).toBe(1))
    await waitFor(() => expect(counters.historyRequests).toBe(1))
    await waitFor(() => expect(counters.policyRequests).toBe(1))

    act(() => {
      result.current.reportConflict()
    })
    expect(result.current.conflict.active).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })
    // No refetch: the stale view stays exactly as it was.
    expect(counters.detailRequests).toBe(1)
    expect(counters.historyRequests).toBe(1)
    expect(counters.policyRequests).toBe(1)
  })

  it('is a zero-network hook when the documentId is null', async () => {
    const { wrapper } = createHarness()
    const store = { documents: [createWarehouseDocument({ documentId: DOCUMENT_ID })] }
    const counters = useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useDocumentConflictRecovery(null), { wrapper })

    await waitFor(() =>
      expect(result.current.conflict).toEqual({ active: false, isRefreshing: false }),
    )
    expect(counters.detailRequests).toBe(0)
    expect(counters.historyRequests).toBe(0)
    expect(counters.policyRequests).toBe(0)

    act(() => {
      result.current.reportConflict()
      result.current.dismiss()
    })
    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })
    expect(counters.detailRequests).toBe(0)
    expect(counters.historyRequests).toBe(0)
    expect(counters.policyRequests).toBe(0)
  })
})
