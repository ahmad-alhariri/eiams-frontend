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

/** A wire paged envelope, which is what transport.requestPage reads. */
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

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('createCountService (e20-t01)', () => {
  it('lists counts with status and warehouse filters as query params', async () => {
    mockedRequest.mockReturnValue(pagedEnvelope([]) as never)
    const service = createCountService(testTransport)

    await service.listCounts({
      pageIndex: 1,
      pageSize: 10,
      status: 'InProgress',
      warehouseId: 'abc',
    })

    expect(sentConfig()).toMatchObject({
      url: '/inventory-counts',
      params: { pageIndex: 1, pageSize: 10, status: 'InProgress', warehouseId: 'abc' },
    })
  })

  it('plans a count with an Idempotency-Key header and returns the session', async () => {
    const session = { countId: COUNT_ID, status: 'Planned' }
    mockedRequest.mockReturnValue({ data: session } as never)
    const service = createCountService(testTransport)

    const result = await service.planCount(
      {
        warehouseId: VALID_UUID(),
        countType: 'Full',
        freezePolicy: 'SoftFreeze',
        rowVersion: 0,
        scope: { scopeIds: [], scopeType: 'AllMaterials' },
      },
      'idem-key-1',
    )

    expect(result).toEqual(session)
    expect(sentConfig().headers?.['Idempotency-Key']).toBe('idem-key-1')
  })

  it('starts a count with RowVersionAction semantics', async () => {
    mockedRequest.mockReturnValue(envelope({ countId: COUNT_ID, status: 'InProgress' }))
    const service = createCountService(testTransport)

    await service.startCount(COUNT_ID, 3)

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/start`,
      data: { rowVersion: 3 },
    })
  })

  it('batches line updates through PUT', async () => {
    mockedRequest.mockReturnValue(pagedEnvelope([]))
    const service = createCountService(testTransport)

    const request = {
      countRowVersion: 4,
      lines: [{ countLineId: VALID_UUID(), actualQuantity: 5, rowVersion: 2 }],
    }
    await service.updateLines(COUNT_ID, request)

    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/lines`,
      data: request,
    })
  })

  it('completes a count idempotently and closes with row version', async () => {
    mockedRequest.mockReturnValue(envelope({ countId: COUNT_ID, status: 'Completed' }))
    const service = createCountService(testTransport)

    await service.completeCount(COUNT_ID, 5, 'idem-complete')

    const completeConfig = sentConfig()
    expect(completeConfig.data).toEqual({ rowVersion: 5 })
    expect(completeConfig.headers?.['Idempotency-Key']).toBe('idem-complete')

    mockedRequest.mockReturnValue(envelope({ countId: COUNT_ID, status: 'Closed' }))
    await service.closeCount(COUNT_ID, 6)
    expect(sentConfig()).toMatchObject({
      url: `/inventory-counts/${COUNT_ID}/close`,
      data: { rowVersion: 6 },
    })
  })
})

function VALID_UUID(): string {
  return '999e4567-e89b-42d3-a456-426614174009'
}
