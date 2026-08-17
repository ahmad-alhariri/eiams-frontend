import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'
import { createWarehouseDocument, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as ScopeCacheKey | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useDocumentConflictRecovery } from './use-document-conflict-recovery'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(160)

function createHarness() {
  const client = createQueryClient()
  const wrapper = function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper }
}

function useMutableDocumentHandlers(store: { documents: WarehouseDocument[] }) {
  const counters = { detailRequests: 0, policyRequests: 0 }
  server.use(
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
      counters.detailRequests += 1
      return HttpResponse.json(store.documents[0])
    }),
    http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
      counters.policyRequests += 1
      return HttpResponse.json(store.documents[0]?.policy)
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
    await waitFor(() => expect(counters.policyRequests).toBe(1))
    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })

    act(() => {
      result.current.reportConflict()
    })

    expect(result.current.conflict).toEqual({ active: true, isRefreshing: false })
  })

  it('recover refetches detail and policy and clears the conflict once refreshed', async () => {
    const { wrapper } = createHarness()
    const store = {
      documents: [createWarehouseDocument({ documentId: DOCUMENT_ID, rowVersion: 1 })],
    }
    const counters = useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useDocumentConflictRecovery(DOCUMENT_ID), { wrapper })

    await waitFor(() => expect(counters.detailRequests).toBe(1))
    await waitFor(() => expect(counters.policyRequests).toBe(1))

    act(() => {
      result.current.reportConflict()
    })
    expect(result.current.conflict.active).toBe(true)

    // The server moved on while the user worked: a newer version exists.
    store.documents[0] = createWarehouseDocument({ documentId: DOCUMENT_ID, rowVersion: 2 })

    let recoverPromise: Promise<void> | undefined
    act(() => {
      recoverPromise = result.current.recover()
    })
    expect(result.current.conflict).toEqual({ active: true, isRefreshing: true })
    await act(async () => {
      await recoverPromise
    })

    expect(counters.detailRequests).toBe(2)
    expect(counters.policyRequests).toBe(2)
    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })
  })

  it('dismiss clears the conflict without refetching', async () => {
    const { wrapper } = createHarness()
    const store = { documents: [createWarehouseDocument({ documentId: DOCUMENT_ID })] }
    const counters = useMutableDocumentHandlers(store)

    const { result } = renderHook(() => useDocumentConflictRecovery(DOCUMENT_ID), { wrapper })

    await waitFor(() => expect(counters.detailRequests).toBe(1))
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
    expect(counters.policyRequests).toBe(0)

    act(() => {
      result.current.reportConflict()
      result.current.dismiss()
    })
    expect(result.current.conflict).toEqual({ active: false, isRefreshing: false })
    expect(counters.detailRequests).toBe(0)
    expect(counters.policyRequests).toBe(0)
  })
})
