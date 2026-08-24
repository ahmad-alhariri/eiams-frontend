import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createAssetService } from './asset.service'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { get: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'

const mockedGet = vi.mocked(apiClient.get)

beforeEach(() => {
  mockedGet.mockClear()
})

describe('createAssetService (transport seam)', () => {
  it('lists assets with the contract path and passes query params through', async () => {
    const page = { items: [], meta: { page: 0, pageSize: 10, total: 0 } }
    mockedGet.mockResolvedValueOnce({ data: page })

    const service = createAssetService(apiClient)
    const result = await service.listAssets({
      pageIndex: 0,
      pageSize: 10,
      status: 'InStock',
    })

    expect(mockedGet).toHaveBeenCalledWith('/assets', {
      params: { pageIndex: 0, pageSize: 10, status: 'InStock' },
    })
    expect(result).toBe(page)
  })

  it('encodes the asset id into detail paths without double-encoding the template', async () => {
    mockedGet.mockResolvedValue({ data: {} })

    const service = createAssetService(apiClient)
    await service.getAsset('id/1')
    await service.getAssetCustodyTimeline('id/1')
    await service.listAssetMovements('id/1', { pageIndex: 0, pageSize: 5 })

    expect(mockedGet).toHaveBeenNthCalledWith(1, '/assets/id%2F1')
    expect(mockedGet).toHaveBeenNthCalledWith(2, '/assets/id%2F1/custody')
    expect(mockedGet).toHaveBeenNthCalledWith(3, '/assets/id%2F1/movements', {
      params: { pageIndex: 0, pageSize: 5 },
    })
  })
})
