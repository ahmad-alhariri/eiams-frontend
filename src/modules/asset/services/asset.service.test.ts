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
function pagedEnvelope(items: readonly unknown[], page = 1) {
  return {
    data: {
      success: true,
      data: items,
      pagination: {
        page,
        page_size: 10,
        total_items: items.length,
        total_pages: 1,
        has_previous_page: page > 1,
        has_next_page: false,
        total_count: items.length,
      },
      meta: { request_id: 'r', timestamp: 't' },
    },
  } as never
}

beforeEach(() => {
  mockedRequest.mockClear()
})

describe('createAssetService (transport seam)', () => {
  it('lists assets with the live path and the live query parameters', async () => {
    mockedRequest.mockResolvedValueOnce(pagedEnvelope([]))

    const service = createAssetService(testTransport)
    await service.listAssets({ page: 1, pageSize: 10, status: 'InStock' })

    expect(sentConfig()).toMatchObject({
      url: '/assets',
      method: 'GET',
      params: { page: 1, pageSize: 10, status: 'InStock' },
    })
  })

  it('sends the one-based page the server binds, never the snapshot pageIndex', async () => {
    mockedRequest.mockResolvedValueOnce(pagedEnvelope([]))

    const service = createAssetService(testTransport)
    await service.listAssets({ page: 3, pageSize: 25 })

    const params = sentConfig().params ?? {}
    expect(params['page']).toBe(3)
    expect(params).not.toHaveProperty('pageIndex')
  })

  it('returns the normalized page the transport produced', async () => {
    mockedRequest.mockResolvedValueOnce(pagedEnvelope([{ id: 'a1' }], 2))

    const service = createAssetService(testTransport)
    const result = await service.listAssets({ page: 2, pageSize: 10 })

    expect(result.items).toEqual([{ id: 'a1' }])
    expect(result.page).toBe(2)
    expect(result.totalItems).toBe(1)
    expect(result.totalPages).toBe(1)
  })

  it('encodes the asset id into detail paths without double-encoding the template', async () => {
    mockedRequest.mockResolvedValue(envelope([]))

    const service = createAssetService(testTransport)
    await service.getAsset('id/1')
    await service.getAssetCurrentStatus('id/1')
    await service.getAssetCustodyTimeline('id/1')
    await service.listAssetMovements('id/1', { page: 1, pageSize: 5 })

    expect(sentConfig(0)).toMatchObject({ url: '/assets/id%2F1', method: 'GET' })
    // The derived status projection has its own live endpoint.
    expect(sentConfig(1)).toMatchObject({
      url: '/assets/id%2F1/current-status',
      method: 'GET',
    })
    // GET /assets/{assetId}/custody is gone in the live API: replaced by
    // GET /assets/{assetId}/custody-timeline (D-INT-02).
    expect(sentConfig(2)).toMatchObject({
      url: '/assets/id%2F1/custody-timeline',
      method: 'GET',
    })
    expect(sentConfig(3)).toMatchObject({
      url: '/assets/id%2F1/movements',
      method: 'GET',
      params: { page: 1, pageSize: 5 },
    })
  })

  it('requests the custody timeline at the server maximum page size', async () => {
    mockedRequest.mockResolvedValue(envelope([]))

    const service = createAssetService(testTransport)
    const result = await service.getAssetCustodyTimeline('asset-1')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([])
    expect(sentConfig()).toMatchObject({
      url: '/assets/asset-1/custody-timeline',
      method: 'GET',
      params: { page: 1, pageSize: 100 },
    })
  })
})
