import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
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
  AdjustmentPurpose,
  AdjustmentStatus,
  InventoryAdjustment,
  InventoryAdjustmentPage,
} from '@/shared/types/generated/eiams-v1'
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
  return HttpResponse.json({ title: 'Not Found', status: 404 }, { status: 404 })
}

function adjustmentFixture(overrides: {
  adjustmentId?: string
  status?: AdjustmentStatus
  purpose?: AdjustmentPurpose
}): InventoryAdjustment {
  return {
    adjustmentId: overrides.adjustmentId ?? '423e4567-e89b-42d3-a456-426614174004',
    countReference: null,
    createdAt: '2026-08-26T08:00:00.000Z',
    createdBy: { displayName: 'مدير المستودع', id: '923e4567-e89b-42d3-a456-426614174009' },
    documentId: '523e4567-e89b-42d3-a456-426614174005',
    documentReference: 'ADJ-2026-0001',
    lines: [],
    policy: {
      actions: [
        {
          action: 'Post',
          allowed: true,
          confirmationRequired: true,
          presentation: 'Enabled',
          reasonAr: null,
          reasonCode: null,
          reasonRequired: false,
        },
      ],
      advisories: [],
      blockers: [],
      documentId: '523e4567-e89b-42d3-a456-426614174005',
      documentStatus: 'Draft',
      evaluatedAt: '2026-08-26T08:00:00.000Z',
      policyKind: 'Adjustment',
      rowVersion: 1,
      signedOriginalSatisfied: false,
    },
    postedAt: null,
    purpose: overrides.purpose ?? 'DirectCorrection',
    reason: 'تسوية خطأ إدخال',
    rowVersion: 2,
    status: overrides.status ?? 'Draft',
    warehouse: { displayName: 'المستودع المركزي', id: '823e4567-e89b-42d3-a456-426614174008' },
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
        return HttpResponse.json<InventoryAdjustmentPage>({
          items,
          meta: { pageIndex: 0, pageSize: 20, totalItems: 1, totalPages: 1 },
        })
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
        return HttpResponse.json(adjustmentFixture({}))
      }),
    )

    const { Wrapper } = createWrapper()
    const ok = renderHook(() => useAdjustmentDetailQuery(ADJUSTMENT_ID), { wrapper: Wrapper })
    await waitFor(() => expect(ok.result.current.isSuccess).toBe(true))
    expect(ok.result.current.data?.documentReference).toBe('ADJ-2026-0001')

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
        return HttpResponse.json({
          adjustment: adjustmentFixture({ status: 'Posted' }),
          assetMovements: [],
          lifecycleEvent: { eventId: 'evt-post' },
          stockMovements: [],
        })
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
        return HttpResponse.json({
          compensatingAdjustment: adjustmentFixture({ status: 'Posted' }),
          lifecycleEvent: { eventId: 'evt-reverse' },
          originalAdjustment: adjustmentFixture({ status: 'Reversed' }),
        })
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
