import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createAssetService } from './asset.service'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { request: vi.fn() },
}))

import { createAxiosTransport } from '@/shared/api/axios-transport'
import { apiClient } from '@/shared/services/api.client'

const mockedRequest = vi.mocked(apiClient.request)

// The transport closes over apiClient and calls request at call time, so one
// instance is enough across tests despite the per-test mockClear.
const testTransport = createAxiosTransport(apiClient)

type SentConfig = {
  url?: string
  method?: string
  params?: Record<string, unknown>
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
        page_size: 10,
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
  mockedRequest.mockClear()
})

describe('createAssetService (transport seam)', () => {
  it('lists assets with the contract path and passes query params through', async () => {
    mockedRequest.mockResolvedValueOnce(pagedEnvelope([]))

    const service = createAssetService(testTransport)
    await service.listAssets({ pageIndex: 0, pageSize: 10, status: 'InStock' })

    expect(sentConfig()).toMatchObject({
      url: '/assets',
      method: 'GET',
      params: { pageIndex: 0, pageSize: 10, status: 'InStock' },
    })
  })

  it('returns the documented page view-model rebuilt from the normalized ApiPage', async () => {
    mockedRequest.mockResolvedValueOnce(pagedEnvelope([{ assetId: 'a1' }]))

    const service = createAssetService(testTransport)
    const result = await service.listAssets({ pageIndex: 0, pageSize: 10 })

    // The generated page type described a body the backend never sends on its
    // own, so the service rebuilds it from the transport's normalized `ApiPage`.
    // Asserting the rebuilt shape is what proves the envelope was unwrapped
    // rather than returned verbatim.
    expect(result.items).toEqual([{ assetId: 'a1' }])
    expect(result.meta).toMatchObject({
      pageIndex: 0,
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    })
  })

  it('encodes the asset id into detail paths without double-encoding the template', async () => {
    mockedRequest.mockResolvedValue(envelope([]))

    const service = createAssetService(testTransport)
    await service.getAsset('id/1')
    await service.getAssetCustodyTimeline('id/1')
    await service.listAssetMovements('id/1', { pageIndex: 0, pageSize: 5 })

    expect(sentConfig(0)).toMatchObject({ url: '/assets/id%2F1', method: 'GET' })
    expect(sentConfig(1)).toMatchObject({ url: '/assets/id%2F1/custody', method: 'GET' })
    expect(sentConfig(2)).toMatchObject({
      url: '/assets/id%2F1/movements',
      method: 'GET',
      params: { pageIndex: 0, pageSize: 5 },
    })
  })
})
