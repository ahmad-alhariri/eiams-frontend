import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { request: vi.fn() },
}))

import { createAdjustmentService } from './adjustment.service'
import type { AdjustmentDraftRequest } from '@/modules/adjustment/types/adjustment.types'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { apiClient } from '@/shared/services/api.client'

// The transport closes over apiClient and calls request at call time, so one
// instance is enough across tests despite the per-test mockReset.
// instance is enough across tests despite the per-test mockReset.
const testTransport = createAxiosTransport(apiClient)

const mockedRequest = vi.mocked(apiClient.request)

const ADJUSTMENT_ID = '123e4567-e89b-42d3-a456-426614174001'

/**
 * The service now runs through the shared `ApiTransport`, so the assertions
 * below inspect the single Axios config the transport builds instead of the
 * per-verb `client.get/post/put` arguments. Same intent — path, method, query,
 * body, and the Idempotency-Key header — read at the new seam.
 */
type SentConfig = {
  url?: string
  method?: string
  params?: Record<string, unknown>
  data?: unknown
  headers?: Record<string, string>
}

function sentConfig(call = 0): SentConfig {
  return (mockedRequest.mock.calls[call]?.[0] ?? {}) as SentConfig
}

/** A wire success envelope, which is what `transport.request` reads. */
function envelope(data: unknown) {
  return {
    data: { success: true, data, pagination: null, meta: { request_id: 'r', timestamp: 't' } },
  } as never
}

/** A wire paged envelope, which is what `transport.requestPage` reads. */
function pagedEnvelope(items: readonly unknown[]) {
  return {
    data: {
      success: true,
      data: items,
      pagination: {
        page: 1,
        page_size: 20,
        total_items: items.length,
        total_pages: 1,
        has_previous_page: false,
        has_next_page: false,
      },
      meta: { request_id: 'r', timestamp: 't' },
    },
  } as never
}

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('createAdjustmentService (e21-t01)', () => {
  it('lists adjustments with purpose, status, and warehouse filters as query params', async () => {
    mockedRequest.mockReturnValue(pagedEnvelope([]))
    const service = createAdjustmentService(testTransport)

    await service.listAdjustments({
      pageIndex: 2,
      pageSize: 10,
      purpose: 'CountVariance',
      status: 'Posted',
      warehouseId: 'wh-1',
    })

    expect(sentConfig()).toMatchObject({
      url: '/adjustments',
      method: 'GET',
      params: {
        // Zero-based `pageIndex: 2` travels one-based as `page: 3`.
        page: 3,
        pageSize: 10,
        purpose: 'CountVariance',
        status: 'Posted',
        warehouseId: 'wh-1',
      },
    })
  })

  it('never leaks undefined filters onto the wire', async () => {
    mockedRequest.mockReturnValue(pagedEnvelope([]))
    const service = createAdjustmentService(testTransport)

    await service.listAdjustments({ pageIndex: 0, pageSize: 20 })

    const params = sentConfig().params ?? {}
    // Key-set assertion (not just toEqual, which ignores undefined-valued
    // props): catches a regression to unconditional filter spreading.
    expect(Object.keys(params).sort()).toEqual(['page', 'pageSize'])
    expect(params).toEqual({ page: 1, pageSize: 20 })
  })

  it('fetches one adjustment by id', async () => {
    const adjustment = { adjustmentId: ADJUSTMENT_ID, status: 'Draft' }
    mockedRequest.mockReturnValue(envelope(adjustment))
    const service = createAdjustmentService(testTransport)

    const result = await service.getAdjustment(ADJUSTMENT_ID)

    expect(result).toEqual(adjustment)
    expect(sentConfig()).toMatchObject({ url: `/adjustments/${ADJUSTMENT_ID}`, method: 'GET' })
  })

  it('creates a draft adjustment through POST', async () => {
    const draft = {
      warehouseId: ADJUSTMENT_ID,
      purpose: 'DirectCorrection',
      reason: 'تسوية خطأ إدخال',
      rowVersion: 0,
      lines: [],
    } satisfies AdjustmentDraftRequest
    mockedRequest.mockReturnValue(envelope({ adjustmentId: ADJUSTMENT_ID, status: 'Draft' }))
    const service = createAdjustmentService(testTransport)

    const result = await service.createAdjustment(draft)

    expect(sentConfig()).toMatchObject({
      url: '/adjustments',
      method: 'POST',
      data: draft,
    })
    expect(result.status).toBe('Draft')
  })

  it('updates a mutable draft through PUT', async () => {
    const request = {
      warehouseId: ADJUSTMENT_ID,
      purpose: 'DirectCorrection' as const,
      reason: 'سبب معدّل',
      rowVersion: 3,
      lines: [],
    }
    mockedRequest.mockReturnValue(envelope({ adjustmentId: ADJUSTMENT_ID, rowVersion: 4 }))
    const service = createAdjustmentService(testTransport)

    await service.updateAdjustment(ADJUSTMENT_ID, request)

    expect(sentConfig()).toMatchObject({
      url: `/adjustments/${ADJUSTMENT_ID}`,
      method: 'PUT',
      data: request,
    })
  })

  it('posts a draft idempotently with the Idempotency-Key header', async () => {
    mockedRequest.mockReturnValue(
      envelope({ adjustment: { adjustmentId: ADJUSTMENT_ID }, stockMovements: [] }),
    )
    const service = createAdjustmentService(testTransport)

    await service.postAdjustment(ADJUSTMENT_ID, 7, 'idem-post-1')

    expect(sentConfig()).toMatchObject({
      url: `/adjustments/${ADJUSTMENT_ID}/post`,
      method: 'POST',
      data: { rowVersion: 7 },
      headers: { 'Idempotency-Key': 'idem-post-1' },
    })
  })

  it('reverses a posted adjustment with a reason and an Idempotency-Key header', async () => {
    mockedRequest.mockReturnValue(
      envelope({
        originalAdjustment: { adjustmentId: ADJUSTMENT_ID },
        compensatingAdjustment: { adjustmentId: 'comp-1' },
        lifecycleEvent: { eventId: 'evt-1' },
      }),
    )
    const service = createAdjustmentService(testTransport)

    const result = await service.reverseAdjustment(ADJUSTMENT_ID, 8, 'خطأ في الترحيل', 'idem-rev-1')

    expect(sentConfig()).toMatchObject({
      url: `/adjustments/${ADJUSTMENT_ID}/reverse`,
      method: 'POST',
      data: { reason: 'خطأ في الترحيل', rowVersion: 8 },
      headers: { 'Idempotency-Key': 'idem-rev-1' },
    })
    expect(result.compensatingAdjustment).toBeDefined()
  })

  it('lists disposal-eligible assets with search and warehouse params', async () => {
    mockedRequest.mockReturnValue(pagedEnvelope([]))
    const service = createAdjustmentService(testTransport)

    await service.listDisposalEligibleAssets({
      pageIndex: 0,
      pageSize: 25,
      search: 'AST-',
      warehouseId: 'wh-9',
    })

    expect(sentConfig()).toMatchObject({
      url: '/adjustments/disposal-eligible-assets',
      method: 'GET',
      params: { page: 1, pageSize: 25, search: 'AST-', warehouseId: 'wh-9' },
    })
  })
})
