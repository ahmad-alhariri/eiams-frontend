import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import { createCustodyService } from './custody.service'

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
  vi.mocked(apiClient.get).mockClear()
  vi.mocked(apiClient.post).mockClear()
})

describe('custody.service (e19-t01)', () => {
  it('lists custodies with contract filters as query params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], meta: {} } })
    const service = createCustodyService(apiClient as never)

    await service.listCustodies({ status: 'Active', custodyKind: 'Operational' })

    expect(apiClient.get).toHaveBeenCalledWith('/custodies', {
      params: { status: 'Active', custodyKind: 'Operational' },
    })
  })

  it('posts assignments to /custodies/assign with the Idempotency-Key header', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
    const service = createCustodyService(apiClient as never)

    await service.assignCustody(assignRequest, 'key-1')

    const [path, body, config] = vi.mocked(apiClient.post).mock.calls[0]!
    expect(path).toBe('/custodies/assign')
    expect(body).toEqual(assignRequest)
    expect(config?.headers).toMatchObject({ 'Idempotency-Key': 'key-1' })
  })

  it('posts transfers to the encoded per-custody path with the idempotency header', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
    const service = createCustodyService(apiClient as never)

    await service.transferCustody(CUSTODY_ID, assignRequest, 'key-2')

    const [path, , config] = vi.mocked(apiClient.post).mock.calls[0]!
    expect(path).toBe(`/custodies/${CUSTODY_ID}/transfer`)
    expect(config?.headers).toMatchObject({ 'Idempotency-Key': 'key-2' })
  })

  it('encodes unsafe custody ids in the transfer path', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
    const service = createCustodyService(apiClient as never)

    await service.transferCustody('id/with slash', assignRequest, 'key-3')

    expect(vi.mocked(apiClient.post).mock.calls[0]![0]).toBe(
      '/custodies/id%2Fwith%20slash/transfer',
    )
  })
})
