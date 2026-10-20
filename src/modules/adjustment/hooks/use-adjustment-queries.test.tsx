import { QueryClientProvider } from '@tanstack/react-query'
import { apiJson, okJson, okPageJson } from '@/test/msw/envelope'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  adjustmentQueryKeys,
  useAdjustmentDetailQuery,
  useAdjustmentsListQuery,
  usePostAdjustmentMutation,
  useReverseAdjustmentMutation,
} from './use-adjustment-queries'
import { createQueryClient } from '@/shared/services/query.client'
import type {
  AdjustmentDetail,
  AdjustmentPurpose,
} from '@/modules/adjustment/types/adjustment.types'
import type { AdjustmentStatus } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE = '*/api/v1/adjustments'

function createWrapper() {
  const client = createQueryClient()
  return {
    client,
    Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    },
  }
}

function notFound() {
  return apiJson({ title: 'Not Found', status: 404 }, { status: 404 })
}

function adjustmentFixture(overrides: {
  id?: string
  status?: AdjustmentStatus
  purpose?: AdjustmentPurpose
}): AdjustmentDetail {
  const status = overrides.status ?? 'Draft'
  return {
    id: overrides.id ?? '423e4567-e89b-42d3-a456-426614174004',
    warehouseId: '823e4567-e89b-42d3-a456-426614174008',
    warehouseCode: 'WH-01',
    warehouseName: 'المستودع المركزي',
    countId: null,
    purpose: overrides.purpose ?? 'DirectCorrection',
    status,
    reason: 'تسوية خطأ إدخال',
    systemReferenceNumber: 'ADJ-2026-0001',
    // The wire documentStatus shares the shared document engine's vocabulary.
    documentStatus: status,
    createdAtUtc: '2026-08-26T08:00:00.000Z',
    postedAtUtc: status === 'Draft' ? null : '2026-08-26T09:00:00.000Z',
    rowVersion: 2,
    lines: [],
  }
}

beforeEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

afterEach(() => {
  server.resetHandlers()
})

describe('adjustment query keys (e21-t01)', () => {
  const scope = { kind: 'warehouse' as const, id: '823e4567-e89b-42d3-a456-426614174008' }
  const listQuery = { pageIndex: 0, pageSize: 20 }

  it('builds scope-isolated keys that retain every server filter', () => {
    expect(adjustmentQueryKeys.adjustments(scope, listQuery)).toEqual([
      'scoped',
      'warehouse',
      scope.id,
      'adjustments',
      'adjustments',
      listQuery,
    ])
    expect(adjustmentQueryKeys.adjustment(scope, 'adj-1')).toEqual([
      'scoped',
      'warehouse',
      scope.id,
      'adjustments',
      'adjustment',
      'adj-1',
    ])
  })
})

describe('useAdjustmentsListQuery (e21-t02 seam)', () => {
  it('fetches the paged list for the active scope and propagates filters', async () => {
    const items = [adjustmentFixture({ status: 'Posted', purpose: 'Disposal' })]
    server.use(
      http.get(API_BASE, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('purpose')).toBe('Disposal')
        expect(url.searchParams.get('status')).toBe('Posted')
        return okPageJson(items, { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 })
      }),
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useAdjustmentsListQuery({
          pageIndex: 0,
          pageSize: 20,
          purpose: 'Disposal',
          status: 'Posted',
        }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(1)
    expect(result.current.data?.items[0]?.purpose).toBe('Disposal')
  })

  it('stays idle without an active scope', () => {
    activeScope.key = undefined
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAdjustmentsListQuery({ pageIndex: 0, pageSize: 20 }), {
      wrapper: Wrapper,
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})

describe('useAdjustmentDetailQuery (e21-t07 seam)', () => {
  const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'

  it('fetches one adjustment and surfaces server errors as isError', async () => {
    server.use(
      http.get(`${API_BASE}/:adjustmentId`, ({ params }) => {
        if (params['adjustmentId'] !== ADJUSTMENT_ID) return notFound()
        return okJson(adjustmentFixture({}))
      }),
    )

    const { Wrapper } = createWrapper()
    const ok = renderHook(() => useAdjustmentDetailQuery(ADJUSTMENT_ID), { wrapper: Wrapper })
    await waitFor(() => expect(ok.result.current.isSuccess).toBe(true))
    expect(ok.result.current.data?.systemReferenceNumber).toBe('ADJ-2026-0001')

    const missing = renderHook(() => useAdjustmentDetailQuery('missing-id'), { wrapper: Wrapper })
    // retry: 1 on the shared client delays the terminal error by ~1s.
    await waitFor(() => expect(missing.result.current.isError).toBe(true), { timeout: 4_000 })
  })
})

describe('adjustment mutations (e21-t06 seams)', () => {
  const ADJUSTMENT_ID = '423e4567-e89b-42d3-a456-426614174004'

  it('posts with an Idempotency-Key header and invalidates the scoped caches', async () => {
    let seenIdempotencyKey: string | null = null
    let postCalls = 0
    server.use(
      http.post(`${API_BASE}/:adjustmentId/post`, ({ request }) => {
        postCalls += 1
        seenIdempotencyKey = request.headers.get('Idempotency-Key')
        // Wire body: the shared engine's post projection.
        return okJson({ documentId: '5667e89b-42d3-a456-4266-140000000001', warnings: [] })
      }),
    )

    const { client, Wrapper } = createWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => usePostAdjustmentMutation(ADJUSTMENT_ID), {
      wrapper: Wrapper,
    })

    result.current.mutate(2)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(postCalls).toBe(1)
    expect(typeof seenIdempotencyKey).toBe('string')
    expect(invalidateSpy).toHaveBeenCalled()

    const invalidatedResources = new Set(
      invalidateSpy.mock.calls.flatMap((call) => {
        const key = call[0]?.queryKey
        return Array.isArray(key) && key[0] === 'scoped' ? [key[3]] : []
      }),
    )
    // Posting/reversing moves stock, asset states, and custody — every
    // touched ledger cache must be invalidated, not only the adjustment keys.
    expect([...invalidatedResources].sort()).toEqual([
      'adjustments',
      'asset',
      'custody',
      'inventory',
    ])
  })

  it('sends reason and rowVersion in the reverse body', async () => {
    let reverseBody: unknown = null
    server.use(
      http.post(`${API_BASE}/:adjustmentId/reverse`, async ({ request }) => {
        reverseBody = await request.json()
        // Wire body: 201 `{ id }` of the compensating document.
        return okJson({ id: '5667e89b-42d3-a456-4266-140000000002' })
      }),
    )

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useReverseAdjustmentMutation(ADJUSTMENT_ID), {
      wrapper: Wrapper,
    })

    result.current.mutate({ reason: 'خطأ في الترحيل', rowVersion: 5 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(reverseBody).toMatchObject({ reason: 'خطأ في الترحيل', rowVersion: 5 })
  })
})
