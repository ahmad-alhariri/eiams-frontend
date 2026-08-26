import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import type { AdjustmentDraftRequest } from '@/modules/adjustment/types/adjustment.types'
import { createAdjustmentService } from './adjustment.service'

const mockedGet = vi.mocked(apiClient.get)
const mockedPost = vi.mocked(apiClient.post)
const mockedPut = vi.mocked(apiClient.put)

const ADJUSTMENT_ID = '123e4567-e89b-42d3-a456-426614174001'

function pagedResponse(items: readonly unknown[]) {
  return {
    data: {
      items,
      meta: { pageIndex: 0, pageSize: 20, totalItems: items.length, totalPages: 1 },
    },
  } as never
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  mockedPut.mockReset()
})

describe('createAdjustmentService (e21-t01)', () => {
  it('lists adjustments with purpose, status, and warehouse filters as query params', async () => {
    mockedGet.mockReturnValue(pagedResponse([]) as never)
    const service = createAdjustmentService(apiClient)

    await service.listAdjustments({
      pageIndex: 2,
      pageSize: 10,
      purpose: 'CountVariance',
      status: 'Posted',
      warehouseId: 'wh-1',
    })

    expect(mockedGet).toHaveBeenCalledWith('/adjustments', {
      params: {
        pageIndex: 2,
        pageSize: 10,
        purpose: 'CountVariance',
        status: 'Posted',
        warehouseId: 'wh-1',
      },
    })
  })

  it('never leaks undefined filters onto the wire', async () => {
    mockedGet.mockReturnValue(pagedResponse([]) as never)
    const service = createAdjustmentService(apiClient)

    await service.listAdjustments({ pageIndex: 0, pageSize: 20 })

    const [, config] = mockedGet.mock.calls[0] as unknown as [
      string,
      { params: Record<string, unknown> },
    ]
    // Key-set assertion (not just toEqual, which ignores undefined-valued
    // props): catches a regression to unconditional filter spreading.
    expect(Object.keys(config.params).sort()).toEqual(['pageIndex', 'pageSize'])
    expect(config.params).toEqual({ pageIndex: 0, pageSize: 20 })
  })

  it('fetches one adjustment by id', async () => {
    const adjustment = { adjustmentId: ADJUSTMENT_ID, status: 'Draft' }
    mockedGet.mockReturnValue({ data: adjustment } as never)
    const service = createAdjustmentService(apiClient)

    const result = await service.getAdjustment(ADJUSTMENT_ID)

    expect(result).toEqual(adjustment)
    expect(mockedGet).toHaveBeenCalledWith(`/adjustments/${ADJUSTMENT_ID}`)
  })

  it('creates a draft adjustment through POST', async () => {
    const draft = {
      warehouseId: ADJUSTMENT_ID,
      purpose: 'DirectCorrection',
      reason: 'تسوية خطأ إدخال',
      rowVersion: 0,
      lines: [],
    } satisfies AdjustmentDraftRequest
    mockedPost.mockReturnValue({ data: { adjustmentId: ADJUSTMENT_ID, status: 'Draft' } } as never)
    const service = createAdjustmentService(apiClient)

    const result = await service.createAdjustment(draft)

    expect(mockedPost).toHaveBeenCalledWith('/adjustments', draft)
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
    mockedPut.mockReturnValue({ data: { adjustmentId: ADJUSTMENT_ID, rowVersion: 4 } } as never)
    const service = createAdjustmentService(apiClient)

    await service.updateAdjustment(ADJUSTMENT_ID, request)

    expect(mockedPut).toHaveBeenCalledWith(`/adjustments/${ADJUSTMENT_ID}`, request)
  })

  it('posts a draft idempotently with the Idempotency-Key header', async () => {
    mockedPost.mockReturnValue({
      data: { adjustment: { adjustmentId: ADJUSTMENT_ID }, stockMovements: [] },
    } as never)
    const service = createAdjustmentService(apiClient)

    await service.postAdjustment(ADJUSTMENT_ID, 7, 'idem-post-1')

    const [, body, config] = mockedPost.mock.calls[0] as unknown as readonly [
      string,
      unknown,
      { headers: Record<string, string> },
    ]
    expect(mockedPost.mock.calls[0]?.[0]).toBe(`/adjustments/${ADJUSTMENT_ID}/post`)
    expect(body).toEqual({ rowVersion: 7 })
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-post-1')
  })

  it('reverses a posted adjustment with a reason and an Idempotency-Key header', async () => {
    mockedPost.mockReturnValue({
      data: {
        originalAdjustment: { adjustmentId: ADJUSTMENT_ID },
        compensatingAdjustment: { adjustmentId: 'comp-1' },
        lifecycleEvent: { eventId: 'evt-1' },
      },
    } as never)
    const service = createAdjustmentService(apiClient)

    const result = await service.reverseAdjustment(ADJUSTMENT_ID, 8, 'خطأ في الترحيل', 'idem-rev-1')

    const [, body, config] = mockedPost.mock.calls[0] as unknown as readonly [
      string,
      unknown,
      { headers: Record<string, string> },
    ]
    expect(mockedPost.mock.calls[0]?.[0]).toBe(`/adjustments/${ADJUSTMENT_ID}/reverse`)
    expect(body).toEqual({ reason: 'خطأ في الترحيل', rowVersion: 8 })
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-rev-1')
    expect(result.compensatingAdjustment).toBeDefined()
  })

  it('lists disposal-eligible assets with search and warehouse params', async () => {
    mockedGet.mockReturnValue(pagedResponse([]) as never)
    const service = createAdjustmentService(apiClient)

    await service.listDisposalEligibleAssets({
      pageIndex: 0,
      pageSize: 25,
      search: 'AST-',
      warehouseId: 'wh-9',
    })

    expect(mockedGet).toHaveBeenCalledWith('/adjustments/disposal-eligible-assets', {
      params: { pageIndex: 0, pageSize: 25, search: 'AST-', warehouseId: 'wh-9' },
    })
  })
})
