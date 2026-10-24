import { createAxiosTransport } from '@/shared/api/axios-transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { request: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import { createCountService } from './count.service'

// The transport closes over apiClient and calls request at call time, so one
// instance is enough across tests despite the per-test mockReset.
const testTransport = createAxiosTransport(apiClient)

const mockedRequest = vi.mocked(apiClient.request)

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

/** A wire success envelope, which is what transport.request reads. */
function envelope(data: unknown) {
  return {
    data: { success: true, data, pagination: null, meta: { request_id: 'r', timestamp: 't' } },
  } as never
}

/** A wire paged envelope (snake_case pagination, as the live API sends it). */
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

const COUNT_ID = '123e4567-e89b-42d3-a456-426614174001'
const LINE_ID = '123e4567-e89b-42d3-a456-426614174002'
const WAREHOUSE_ID = '123e4567-e89b-42d3-a456-426614174009'

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('createCountService (IC-FE-1 live wire)', () => {
  it('lists counts paged 1-based with optional status/warehouse filters', async () => {
    mockedRequest.mockReturnValue(pagedEnvelope([{}]) as never)
    const service = createCountService(testTransport)

    const page = await service.listCounts({
      warehouseId: WAREHOUSE_ID,
      status: 'InProgress',
      page: 1,
      pageSize: 20,
    })

    expect(sentConfig()).toMatchObject({
      url: '/inventory-counts',
      params: { warehouseId: WAREHOUSE_ID, status: 'InProgress', page: 1, pageSize: 20 },
    })
    // Normalized pagination (snake_case → camelCase), never a fabricated meta.
    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(20)
    expect(page.totalItems).toBe(1)
  })

  it('reads the count detail', async () => {
    mockedRequest.mockReturnValue(envelope({ id: COUNT_ID }) as never)
    const service = createCountService(testTransport)

    await service.getCount(COUNT_ID)

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}`,
      method: 'GET',
    })
  })

  it('plans a count with the closed 201 body and an Idempotency-Key, answering { id }', async () => {
    mockedRequest.mockReturnValue(envelope({ id: COUNT_ID }) as never)
    const service = createCountService(testTransport)

    const request = {
      warehouseId: WAREHOUSE_ID,
      countType: 'Scheduled' as const,
      scopeType: 'MaterialDomain' as const,
      materialDomainId: WAREHOUSE_ID,
      materialIds: [] as const,
      freezePolicy: 'HardFreeze' as const,
      freezePolicyReason: 'جرد سنوي',
    }
    const created = await service.planCount(request, 'idem-key-1')

    expect(created).toEqual({ id: COUNT_ID })
    expect(sentConfig()).toMatchObject({
      url: '/inventory-counts',
      method: 'POST',
      data: request,
    })
    expect(sentConfig().headers?.['Idempotency-Key']).toBe('idem-key-1')
  })

  it('starts a count with the live `{ expectedRowVersion }` body', async () => {
    mockedRequest.mockReturnValue(envelope({}) as never)
    const service = createCountService(testTransport)

    await service.startCount(COUNT_ID, 3)

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/start`,
      method: 'POST',
      data: { expectedRowVersion: 3 },
    })
  })

  it('completes a count idempotently and closes with the live bodies', async () => {
    mockedRequest.mockReturnValue(envelope({}) as never)
    const service = createCountService(testTransport)

    await service.completeCount(COUNT_ID, 5, 'idem-complete')
    expect(sentConfig(0).data).toEqual({ expectedRowVersion: 5 })
    expect(sentConfig(0).headers?.['Idempotency-Key']).toBe('idem-complete')

    await service.closeCount(COUNT_ID, 6)
    expect(sentConfig(1)).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/close`,
      data: { expectedRowVersion: 6 },
    })
  })

  it('aborts with the mandatory reason (POST /cancel)', async () => {
    mockedRequest.mockReturnValue(envelope({}) as never)
    const service = createCountService(testTransport)

    await service.cancelCount(COUNT_ID, { expectedRowVersion: 3, reason: 'سبب الإلغاء' })

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/cancel`,
      method: 'POST',
      data: { expectedRowVersion: 3, reason: 'سبب الإلغاء' },
    })
  })

  it('sets target status and freeze policy (PUT) with the live bodies', async () => {
    mockedRequest.mockReturnValue(envelope({}) as never)
    const service = createCountService(testTransport)

    await service.setCountStatus(COUNT_ID, { targetStatus: 'InProgress', expectedRowVersion: 3 })
    expect(sentConfig(0)).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/status`,
      method: 'PUT',
      data: { targetStatus: 'InProgress', expectedRowVersion: 3 },
    })

    await service.setFreezePolicy(COUNT_ID, {
      freezePolicy: 'SoftFreeze',
      expectedRowVersion: 3,
    })
    expect(sentConfig(1)).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/freeze-policy`,
      method: 'PUT',
      data: { freezePolicy: 'SoftFreeze', expectedRowVersion: 3 },
    })
  })

  it('batches line actuals through PUT /actuals with the live wire shape', async () => {
    // RESOLUTION-025: PUT /inventory-counts/{countId}/actuals carries ONLY
    // `{ actuals: [{ lineId, actualQuantity }], expectedRowVersion }` — the
    // aggregate count row version, no per-line rowVersion.
    mockedRequest.mockReturnValue(envelope({}) as never)
    const service = createCountService(testTransport)

    const request = {
      actuals: [{ lineId: LINE_ID, actualQuantity: 5 }],
      expectedRowVersion: 4,
    }
    await service.updateLines(COUNT_ID, request)

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/actuals`,
      method: 'PUT',
      data: {
        actuals: [{ lineId: LINE_ID, actualQuantity: 5 }],
        expectedRowVersion: 4,
      },
    })
  })

  it('saves one line actual and one variance reason (PUT per-line routes)', async () => {
    mockedRequest.mockReturnValue(envelope({}) as never)
    const service = createCountService(testTransport)

    await service.updateLineActual(COUNT_ID, LINE_ID, { actualQuantity: 23, expectedRowVersion: 3 })
    expect(sentConfig(0)).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/lines/${LINE_ID}/actual`,
      method: 'PUT',
      data: { actualQuantity: 23, expectedRowVersion: 3 },
    })

    await service.setLineVarianceReason(COUNT_ID, LINE_ID, {
      reason: 'فرق فعلي',
      expectedRowVersion: 4,
    })
    expect(sentConfig(1)).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/lines/${LINE_ID}/variance-reason`,
      method: 'PUT',
      data: { reason: 'فرق فعلي', expectedRowVersion: 4 },
    })
  })

  it('creates the adjustment draft with NO body (POST /adjustment → { id })', async () => {
    mockedRequest.mockReturnValue(envelope({ id: COUNT_ID }) as never)
    const service = createCountService(testTransport)

    const created = await service.createAdjustment(COUNT_ID, 'idem-3')

    expect(created).toEqual({ id: COUNT_ID })
    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/adjustment`,
      method: 'POST',
    })
    expect(sentConfig().headers?.['Idempotency-Key']).toBe('idem-3')
    expect(sentConfig().data).toBeUndefined()
  })

  it('reads lists of lines paged with the normalization on the lines route', async () => {
    mockedRequest.mockReturnValue(
      pagedEnvelope([
        {
          id: LINE_ID,
          materialId: 'm',
          assetId: null,
          snapshotQuantity: 1,
          actualQuantity: null,
          difference: null,
          varianceReason: null,
        },
      ]) as never,
    )
    const service = createCountService(testTransport)

    const page = await service.listLines(COUNT_ID, { page: 2, pageSize: 50, onlyVariance: true })

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/lines`,
      params: { page: 2, pageSize: 50, onlyVariance: true },
    })
    expect(page.items).toHaveLength(1)
    expect(page.totalItems).toBe(1)
  })

  it('reads the warehouse freeze status (F9 endpoint)', async () => {
    mockedRequest.mockReturnValue(
      envelope({
        warehouseId: WAREHOUSE_ID,
        isPostingBlocked: true,
        isProvisional: false,
        hasSoftFreezeWarning: true,
        activeCounts: [],
      }) as never,
    )
    const service = createCountService(testTransport)

    const status = await service.getFreezeStatus(WAREHOUSE_ID)

    expect(sentConfig()).toMatchObject({
      url: `/warehouses/${WAREHOUSE_ID}/inventory-freeze-status`,
      method: 'GET',
    })
    expect(status.isPostingBlocked).toBe(true)
  })
})
