import { QueryClientProvider } from '@tanstack/react-query'
import { okPageJson } from '@/test/msw/envelope'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useCustodiesQuery, usePendingCustodiesQuery } from './use-custody-queries'
import { createQueryClient } from '@/shared/services/query.client'
import type { Custody, PendingCustody } from '@/modules/custody/types/custody.types'
import { server } from '@/test/msw/server'

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

const API_BASE_URL = '/api/v1'
const ASSET_ID = '77777777-7777-4777-8777-777777777777'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

/** The LIVE `GET /custodies` row: flat, camelCase, no nested holder object. */
const custodyRow: Custody = {
  subjectType: 'Asset',
  subjectId: ASSET_ID,
  custodyId: '44444444-4444-4444-8444-444444444444',
  materialId: '22222222-2222-4222-8222-222222222222',
  materialNameAr: 'حاسوب مكتبي',
  materialNameEn: 'Desktop Computer',
  materialCode: 'IT-HW-PC-001',
  materialKind: 'Asset',
  trackingType: 'Serial',
  serialNumber: 'SN-PC-0001',
  assetNumber: 'AST-2024-C01',
  warehouseId: WAREHOUSE_ID,
  warehouseName: 'المستودع المركزي',
  holderType: 'OrganizationalUnit',
  holderId: '55555555-5555-4555-8555-555555555555',
  holderDisplayName: 'مديرية النقل والحراسة',
  custodyKind: 'Operational',
  issuedQuantity: 1,
  activeQuantity: 1,
  returnedQuantity: 0,
  issueDocumentId: '66666666-6666-4666-8666-666666666666',
  systemReferenceNumber: 'ISSUE-2026-0001',
  status: 'Active',
  fromUtc: '2026-08-01T08:00:00.000Z',
  toUtc: null,
  rowVersion: 1,
}

/** The LIVE `GET /custodies/pending` row. */
const pendingRow: PendingCustody = {
  custodyId: custodyRow.custodyId,
  assetId: ASSET_ID,
  assetNumber: 'AST-2024-C01',
  materialId: custodyRow.materialId,
  holderType: 'OrganizationalUnit',
  holderId: custodyRow.holderId,
  issueDocumentId: custodyRow.issueDocumentId,
  fromUtc: '2026-08-01T08:00:00.000Z',
  rowVersion: 1,
}

function createWrapper() {
  const client = createQueryClient()
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useCustodiesQuery', () => {
  it('fetches scoped custody rows with the live filters and exposes them', async () => {
    let requestedParams: URLSearchParams | undefined
    server.use(
      http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
        requestedParams = new URL(request.url).searchParams
        return okPageJson([custodyRow], { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 })
      }),
    )

    const { result } = renderHook(
      () => useCustodiesQuery({ page: 1, pageSize: 20, subjectType: 'Asset', status: 'Active' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(1)
    expect(result.current.data?.items[0]).toMatchObject({
      assetNumber: 'AST-2024-C01',
      custodyKind: 'Operational',
      holderDisplayName: 'مديرية النقل والحراسة',
    })
    // The live parameters and nothing else.
    expect(requestedParams?.get('subjectType')).toBe('Asset')
    expect(requestedParams?.get('status')).toBe('Active')
    expect(requestedParams?.get('page')).toBe('1')
    expect(requestedParams?.has('pageIndex')).toBe(false)
    expect(requestedParams?.has('custodyKind')).toBe(false)
    expect(requestedParams?.has('search')).toBe(false)
  })

  it('reads the warehouse-scoped pending list', async () => {
    let requestedParams: URLSearchParams | undefined
    server.use(
      http.get(`${API_BASE_URL}/custodies/pending`, ({ request }) => {
        requestedParams = new URL(request.url).searchParams
        return okPageJson([pendingRow], { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 })
      }),
    )

    const { result } = renderHook(() => usePendingCustodiesQuery(WAREHOUSE_ID, 1, 10), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requestedParams?.get('warehouseId')).toBe(WAREHOUSE_ID)
    expect(requestedParams?.get('page')).toBe('1')
    expect(result.current.data?.items[0]).toMatchObject({
      custodyId: pendingRow.custodyId,
      assetNumber: 'AST-2024-C01',
      holderType: 'OrganizationalUnit',
    })
  })
})
