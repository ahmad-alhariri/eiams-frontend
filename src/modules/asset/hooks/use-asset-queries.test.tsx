import { QueryClientProvider } from '@tanstack/react-query'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  Asset,
  AssetCurrentStatusInfo,
  AssetCustodyTimelineRow,
} from '@/modules/asset/types/asset.types'
import { server } from '@/test/msw/server'

import {
  useAssetCustodyTimelineQuery,
  useAssetCurrentStatusQuery,
  useAssetQuery,
  useAssetsQuery,
} from './use-asset-queries'
import { createQueryClient } from '@/shared/services/query.client'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const ASSET_ID = '11111111-1111-4111-8111-111111111111'

/** The LIVE `GET /assets` row: flat, camelCase, no nested references. */
const assetRow: Asset = {
  id: ASSET_ID,
  assetNumber: 'AST-2026-0001',
  serialNumber: 'SN-889900',
  materialId: '22222222-2222-4222-8222-222222222222',
  materialCode: 'IT-HW-PC-001',
  materialNameAr: 'حاسوب مكتبي',
  warehouseId: '33333333-3333-4333-8333-333333333333',
  warehouseCode: 'WH-CENTRAL',
  warehouseName: 'المستودع المركزي',
  currentStatus: 'InStock',
  activeCustodyId: null,
  holderType: null,
  holderId: null,
  acquisitionDate: '2026-01-01',
  warrantyExpiry: null,
  rowVersion: 1,
}

/** The LIVE `GET /assets/{assetId}/current-status` row. */
const currentStatusRow: AssetCurrentStatusInfo = {
  assetId: ASSET_ID,
  materialId: assetRow.materialId,
  warehouseId: assetRow.warehouseId,
  assetNumber: assetRow.assetNumber,
  serialNumber: assetRow.serialNumber,
  currentStatus: 'InCustody',
  activeCustodyId: '44444444-4444-4444-8444-444444444444',
  holderType: 'Employee',
  holderId: '55555555-5555-4555-8555-555555555555',
  custodyKind: 'Personal',
  latestMovementType: 'Issued',
  latestMovementAtUtc: '2026-08-24T10:00:00.000Z',
}

/** The LIVE `GET /assets/{assetId}/custody-timeline` row. */
const timelineRow: AssetCustodyTimelineRow = {
  custodyId: '44444444-4444-4444-8444-444444444444',
  assetId: ASSET_ID,
  holderType: 'Employee',
  holderId: '55555555-5555-4555-8555-555555555555',
  custodyKind: 'Personal',
  issueDocumentId: '66666666-6666-4666-8666-666666666666',
  returnDocumentId: null,
  status: 'Active',
  fromUtc: '2026-08-24T08:00:00.000Z',
  toUtc: null,
  rowVersion: 1,
}

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('asset query hooks', () => {
  it('reads the scoped registry with the live filters and a one-based page', async () => {
    let requestedSearch = ''
    server.use(
      http.get(`${API_BASE_URL}/assets`, ({ request }) => {
        const url = new URL(request.url)
        requestedSearch = url.search
        return okPageJson([assetRow])
      }),
    )

    const { result } = renderHook(
      () => useAssetsQuery({ page: 1, pageSize: 10, status: 'InStock' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(requestedSearch).toContain('status=InStock')
    // The wire page is ONE-based and the snapshot's pageIndex is not sent.
    expect(requestedSearch).toContain('page=1')
    expect(requestedSearch).not.toContain('pageIndex')
    expect(result.current.data?.items[0]?.id).toBe(assetRow.id)
    expect(result.current.data?.items[0]?.materialNameAr).toBe('حاسوب مكتبي')
  })

  it('stays disabled until the session scope is ready', () => {
    activeScope.key = undefined
    server.use(
      http.get(`${API_BASE_URL}/assets`, () => {
        throw new Error('no asset request should fire without an active scope')
      }),
    )

    const { result } = renderHook(() => useAssetsQuery({ page: 1, pageSize: 10 }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('reads one asset, its derived status and its custody timeline by id', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}`, () => okJson(assetRow)),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/current-status`, () => okJson(currentStatusRow)),
      http.get(`${API_BASE_URL}/assets/${ASSET_ID}/custody-timeline`, () => okJson([timelineRow])),
    )

    const detail = renderHook(() => useAssetQuery(ASSET_ID), { wrapper: createWrapper() })
    const status = renderHook(() => useAssetCurrentStatusQuery(ASSET_ID), {
      wrapper: createWrapper(),
    })
    const custody = renderHook(() => useAssetCustodyTimelineQuery(ASSET_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(detail.result.current.data).toBeDefined())
    expect(detail.result.current.data?.assetNumber).toBe(assetRow.assetNumber)
    await waitFor(() => expect(status.result.current.data).toBeDefined())
    expect(status.result.current.data?.currentStatus).toBe('InCustody')
    expect(status.result.current.data?.holderType).toBe('Employee')
    await waitFor(() => expect(custody.result.current.data).toBeDefined())
    expect(custody.result.current.data).toHaveLength(1)
    expect(custody.result.current.data?.[0]?.custodyId).toBe(timelineRow.custodyId)
  })
})
