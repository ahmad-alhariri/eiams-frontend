import { createAxiosTransport } from '@/shared/api/axios-transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/services/api.client', () => ({
  apiClient: { request: vi.fn() },
}))

import { apiClient } from '@/shared/services/api.client'
import type {
  AssignAssetCustodyRequest,
  TransferCustodyRequest,
} from '@/modules/custody/types/custody.types'
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
        total_count: items.length,
      },
      meta: { request_id: 'r', timestamp: 't' },
    },
  } as never
}

const testTransport = createAxiosTransport(apiClient)

const ASSET_ID = '11111111-1111-4111-8111-111111111111'

const HOLDER_ID = '22222222-2222-4222-8222-222222222222'

const CUSTODY_ID = '44444444-4444-4444-8444-444444444444'

const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

/**
 * Live wire body for `POST /assets/{assetId}/custody-assignment`. The
 * snapshot `CustodyMutationRequest` does not match: the controller accepts
 * `{ employeeId, expectedCustodyRowVersion, note? }` only — no subjectType,
 * no custodyKind, no effectiveAt, no issueDocumentId, no holderType.
 */
const assignRequest: AssignAssetCustodyRequest = {
  employeeId: HOLDER_ID,
  expectedCustodyRowVersion: 1,
  note: 'تكليف شخصي',
}

/**
 * Live wire body for `POST /custodies/{custodyId}/transfer`. Distinct from
 * the assign body — there is no `employeeId` here, only `newHolderId` plus
 * `subjectType` / `newHolderType` / `newCustodyKind` / `expectedRowVersion` /
 * `note?`.
 */
const transferRequest: TransferCustodyRequest = {
  subjectType: 'Asset',
  newHolderType: 'Employee',
  newHolderId: HOLDER_ID,
  newCustodyKind: 'Operational',
  expectedRowVersion: 2,
  note: 'تحويل المسؤولية',
}

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('custody.service', () => {
  it('lists custodies with the live filters as query params', async () => {
    mockedRequest.mockResolvedValue(pagedEnvelope([]))
    const service = createCustodyService(testTransport)

    await service.listCustodies({ page: 1, pageSize: 20, subjectType: 'Asset', status: 'Active' })

    expect(sentConfig()).toMatchObject({
      url: '/custodies',
      method: 'GET',
      params: { page: 1, pageSize: 20, subjectType: 'Asset', status: 'Active' },
    })
  })

  it('never sends the parameters the live endpoint does not bind', async () => {
    mockedRequest.mockResolvedValue(pagedEnvelope([]))
    const service = createCustodyService(testTransport)

    await service.listCustodies({ page: 2, pageSize: 20, subjectType: 'Asset' })

    const params = sentConfig().params ?? {}
    // `pageIndex`, `search` and `custodyKind` are snapshot-era names the
    // server ignores; sending them is how the filters silently stopped
    // applying.
    expect(params).not.toHaveProperty('pageIndex')
    expect(params).not.toHaveProperty('search')
    expect(params).not.toHaveProperty('custodyKind')
    expect(params['page']).toBe(2)
  })

  it('reads the warehouse-scoped pending list', async () => {
    mockedRequest.mockResolvedValue(pagedEnvelope([]))
    const service = createCustodyService(testTransport)

    await service.listPendingCustodies({ warehouseId: WAREHOUSE_ID, page: 1, pageSize: 10 })

    expect(sentConfig()).toMatchObject({
      url: '/custodies/pending',
      method: 'GET',
      params: { warehouseId: WAREHOUSE_ID, page: 1, pageSize: 10 },
    })
  })

  it('posts assignments to /assets/{assetId}/custody-assignment and returns the new custody id', async () => {
    mockedRequest.mockResolvedValue(envelope({ id: 'NEW-CUSTODY-ID' }))
    const service = createCustodyService(testTransport)

    const result = await service.assignCustody(ASSET_ID, assignRequest)

    const { url: path, data: body, headers } = sentConfig()
    expect(path).toBe(`/assets/${ASSET_ID}/custody-assignment`)
    expect(body).toEqual(assignRequest)
    // The live controller does not accept Idempotency-Key (verified against
    // AssignAssetCustodyController.cs) so none must be sent.
    expect(headers).toBeUndefined()
    expect(result).toEqual({ id: 'NEW-CUSTODY-ID' })
  })

  it('drops the note when blank instead of sending an empty string', async () => {
    mockedRequest.mockResolvedValue(envelope({ id: 'NEW-CUSTODY-ID' }))
    const service = createCustodyService(testTransport)

    await service.assignCustody(ASSET_ID, {
      employeeId: HOLDER_ID,
      expectedCustodyRowVersion: 1,
    })

    const { data: body } = sentConfig()
    expect(body).not.toHaveProperty('note')
  })

  it('does not include forbidden snapshot fields in the assign body', async () => {
    // Belt and braces: the snapshot's CustodyMutationRequest carries subjectType,
    // custodyKind, effectiveAt, issueDocumentId, holderType and AssetOnlyId.
    // The live wire does not, and a stray assignment composed against the
    // snapshot would 422 the controller.
    mockedRequest.mockResolvedValue(envelope({ id: 'NEW-CUSTODY-ID' }))
    const service = createCustodyService(testTransport)

    await service.assignCustody(ASSET_ID, assignRequest)

    const { data: body } = sentConfig()
    expect(body).not.toHaveProperty('subjectType')
    expect(body).not.toHaveProperty('custodyKind')
    expect(body).not.toHaveProperty('effectiveAt')
    expect(body).not.toHaveProperty('issueDocumentId')
    expect(body).not.toHaveProperty('holderType')
    expect(body).not.toHaveProperty('assetId')
  })

  it('posts transfers to the encoded per-custody path with the live transfer body', async () => {
    mockedRequest.mockResolvedValue(envelope({}))
    const service = createCustodyService(testTransport)

    await service.transferCustody(CUSTODY_ID, transferRequest)

    const { url: path, data: body, headers } = sentConfig()
    expect(path).toBe(`/custodies/${CUSTODY_ID}/transfer`)
    expect(body).toEqual(transferRequest)
    expect(headers).toBeUndefined()
  })

  it('encodes unsafe custody ids in the transfer path', async () => {
    mockedRequest.mockResolvedValue(envelope({}))
    const service = createCustodyService(testTransport)

    await service.transferCustody('id/with slash', transferRequest)

    expect(sentConfig().url).toBe('/custodies/id%2Fwith%20slash/transfer')
  })
})
