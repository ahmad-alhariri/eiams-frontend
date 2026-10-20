import { createAxiosTransport } from '@/shared/api/axios-transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { request: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import { createReturnService } from './return.service'

const mockedRequest = vi.mocked(apiClient.request)

type SentConfig = {
  url?: string
  method?: string
  params?: Record<string, unknown>
}

function sentConfig(call = 0): SentConfig {
  return (mockedRequest.mock.calls[call]?.[0] ?? {}) as SentConfig
}

/** A wire paged envelope, which is what transport.requestPage reads. */
function pagedEnvelope(items: readonly unknown[]) {
  return {
    data: {
      success: true,
      data: items,
      pagination: {
        page: 1,
        page_size: 100,
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

const ISSUE_DOC_ID = '33333333-3333-4333-8333-333333333333'
const ASSET_ID = '11111111-1111-4111-8111-111111111111'

const ELIGIBLE_ASSET = {
  subjectType: 'Asset',
  subjectId: ASSET_ID,
  materialId: '44444444-4444-4444-8444-444444444444',
  materialNameAr: 'حاسوب مكتبي',
  materialNameEn: 'Desktop Computer',
  materialCode: 'IT-HW-PC-001',
  materialKind: 'Asset',
  trackingType: 'Serial',
  serialNumber: 'SN-889900',
  assetNumber: 'AST-2026-0001',
  availableQuantity: 1,
  issuedQuantity: 1,
} as const

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('return.service (FIX-R2 / D-INT-02 handwritten contract)', () => {
  it('lists eligible items with the original-issue id as a query param', async () => {
    mockedRequest.mockResolvedValue(pagedEnvelope([ELIGIBLE_ASSET]))
    const service = createReturnService(testTransport)

    const page = await service.listEligibleItems(ISSUE_DOC_ID)

    expect(sentConfig()).toMatchObject({
      url: '/returns/eligible-items',
      method: 'GET',
      params: { originalIssueDocumentId: ISSUE_DOC_ID, page: 1, pageSize: 100 },
    })
    expect(page.items[0]).toEqual(ELIGIBLE_ASSET)
  })

  it('sends one-based page and clamps pageSize into the backend [1,100] range', async () => {
    mockedRequest.mockResolvedValue(pagedEnvelope([]))
    const service = createReturnService(testTransport)

    await service.listEligibleItems(ISSUE_DOC_ID, 2, 150)
    expect(sentConfig().params).toEqual({
      originalIssueDocumentId: ISSUE_DOC_ID,
      page: 2,
      pageSize: 100,
    })

    await service.listEligibleItems(ISSUE_DOC_ID, 0, 0)
    expect(sentConfig(1).params).toEqual({
      originalIssueDocumentId: ISSUE_DOC_ID,
      page: 1,
      pageSize: 1,
    })
  })
})
