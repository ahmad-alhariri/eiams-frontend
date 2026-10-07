import { createAxiosTransport } from '@/shared/api/axios-transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { request: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import { createCustodyService } from './custody.service'

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

const testTransport = createAxiosTransport(apiClient)

const ASSET_ID = '11111111-1111-4111-8111-111111111111'

const HOLDER_ID = '22222222-2222-4222-8222-222222222222'

const ISSUE_DOC_ID = '33333333-3333-4333-8333-333333333333'

const CUSTODY_ID = '44444444-4444-4444-8444-444444444444'

const assignRequest = {
  subjectType: 'Asset',
  assetId: ASSET_ID,
  custodyKind: 'Personal',
  effectiveAt: '2026-08-24T08:00:00.000Z',
  holderId: HOLDER_ID,
  holderType: 'Employee',
  issueDocumentId: ISSUE_DOC_ID,
  rowVersion: 1,
} as const

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('custody.service (e19-t01)', () => {
  it('lists custodies with contract filters as query params', async () => {
    mockedRequest.mockResolvedValue(pagedEnvelope([]))
    const service = createCustodyService(testTransport)

    await service.listCustodies({ status: 'Active', custodyKind: 'Operational' })

    expect(sentConfig()).toMatchObject({
      url: '/custodies',
      method: 'GET',
      params: { status: 'Active', custodyKind: 'Operational' },
    })
  })

  it('posts assignments to /custodies/assign with the Idempotency-Key header', async () => {
    mockedRequest.mockResolvedValue(envelope({}))
    const service = createCustodyService(testTransport)

    await service.assignCustody(assignRequest, 'key-1')

    const { url: path, data: body } = sentConfig()
    expect(path).toBe('/custodies/assign')
    expect(body).toEqual(assignRequest)
    expect(sentConfig().headers).toMatchObject({ 'Idempotency-Key': 'key-1' })
  })

  it('posts transfers to the encoded per-custody path with the idempotency header', async () => {
    mockedRequest.mockResolvedValue(envelope({}))
    const service = createCustodyService(testTransport)

    await service.transferCustody(CUSTODY_ID, assignRequest, 'key-2')

    const { url: path } = sentConfig()
    expect(path).toBe(`/custodies/${CUSTODY_ID}/transfer`)
    expect(sentConfig().headers).toMatchObject({ 'Idempotency-Key': 'key-2' })
  })

  it('encodes unsafe custody ids in the transfer path', async () => {
    mockedRequest.mockResolvedValue(envelope({}))
    const service = createCustodyService(testTransport)

    await service.transferCustody('id/with slash', assignRequest, 'key-3')

    expect(sentConfig().url).toBe('/custodies/id%2Fwith%20slash/transfer')
  })
})
