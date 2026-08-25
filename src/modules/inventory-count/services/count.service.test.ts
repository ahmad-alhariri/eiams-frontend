import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import { createCountService } from './count.service'

const mockedGet = vi.mocked(apiClient.get)
const mockedPost = vi.mocked(apiClient.post)
const mockedPut = vi.mocked(apiClient.put)

const COUNT_ID = '123e4567-e89b-42d3-a456-426614174001'

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

describe('createCountService (e20-t01)', () => {
  it('lists counts with status and warehouse filters as query params', async () => {
    mockedGet.mockReturnValue(pagedResponse([]) as never)
    const service = createCountService(apiClient)

    await service.listCounts({
      pageIndex: 1,
      pageSize: 10,
      status: 'InProgress',
      warehouseId: 'abc',
    })

    expect(mockedGet).toHaveBeenCalledWith('/inventory-counts', {
      params: { pageIndex: 1, pageSize: 10, status: 'InProgress', warehouseId: 'abc' },
    })
  })

  it('plans a count with an Idempotency-Key header and returns the session', async () => {
    const session = { countId: COUNT_ID, status: 'Planned' }
    mockedPost.mockReturnValue({ data: session } as never)
    const service = createCountService(apiClient)

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
    const [, , config] = mockedPost.mock.calls[0] as unknown as readonly [
      string,
      unknown,
      { headers: Record<string, string> },
    ]
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-key-1')
  })

  it('starts a count with RowVersionAction semantics', async () => {
    mockedPost.mockReturnValue({ data: { countId: COUNT_ID, status: 'InProgress' } } as never)
    const service = createCountService(apiClient)

    await service.startCount(COUNT_ID, 3)

    expect(mockedPost).toHaveBeenCalledWith(`/inventory-counts/${COUNT_ID}/start`, {
      rowVersion: 3,
    })
  })

  it('batches line updates through PUT', async () => {
    mockedPut.mockReturnValue({ data: { items: [], meta: {} } } as never)
    const service = createCountService(apiClient)

    const request = {
      countRowVersion: 4,
      lines: [{ countLineId: VALID_UUID(), actualQuantity: 5, rowVersion: 2 }],
    }
    await service.updateLines(COUNT_ID, request)

    expect(mockedPut).toHaveBeenCalledWith(`/inventory-counts/${COUNT_ID}/lines`, request)
  })

  it('completes a count idempotently and closes with row version', async () => {
    mockedPost.mockReturnValue({ data: { countId: COUNT_ID, status: 'Completed' } } as never)
    const service = createCountService(apiClient)

    await service.completeCount(COUNT_ID, 5, 'idem-complete')

    const [, completeBody, completeConfig] = mockedPost.mock.calls[0] as unknown as readonly [
      string,
      unknown,
      { headers: Record<string, string> },
    ]
    expect(completeBody).toEqual({ rowVersion: 5 })
    expect(completeConfig?.headers?.['Idempotency-Key']).toBe('idem-complete')

    mockedPost.mockReturnValue({ data: { countId: COUNT_ID, status: 'Closed' } } as never)
    await service.closeCount(COUNT_ID, 6)
    expect(mockedPost).toHaveBeenLastCalledWith(`/inventory-counts/${COUNT_ID}/close`, {
      rowVersion: 6,
    })
  })
})

function VALID_UUID(): string {
  return '999e4567-e89b-42d3-a456-426614174009'
}
