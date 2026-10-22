import { QueryClientProvider } from '@tanstack/react-query'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useAssignCustodyMutation,
  useCustodiesQuery,
  custodyQueryKeys,
} from './use-custody-queries'
import { useCustodyRowQuery } from './use-custody-row-query'
import { assetQueryKeys } from '@/modules/asset/hooks/use-asset-queries'
import { authSessionLifecycle } from '@/modules/auth/services/auth-session-runtime'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { queryClient } from '@/shared/services/query.client'
import type { ScopeCacheKey } from '@/shared/services/query-keys'
import type { Custody } from '@/modules/custody/types/custody.types'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const CUSTODY_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_CUSTODY_ID = '99999999-9999-4999-8999-999999999999'
const ASSET_ID = '77777777-7777-4777-8777-777777777777'
const WAREHOUSE_SCOPE: ScopeCacheKey = {
  kind: 'warehouse',
  id: '33333333-3333-4333-8333-333333333333',
}

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: WAREHOUSE_SCOPE }),
}))

/** The LIVE `GET /custodies` row: flat, camelCase, no nested holder object. */
const custodyRow: Custody = {
  subjectType: 'Asset',
  subjectId: ASSET_ID,
  custodyId: CUSTODY_ID,
  materialId: '22222222-2222-4222-8222-222222222222',
  materialNameAr: 'حاسوب مكتبي',
  materialNameEn: null,
  materialCode: 'IT-HW-PC-001',
  materialKind: 'Asset',
  trackingType: 'Serial',
  serialNumber: 'SN-PC-0001',
  assetNumber: 'AST-2024-C01',
  warehouseId: '33333333-3333-4333-8333-333333333333',
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

/** Another Asset-subject row, so a page can be scanned without a hit. */
const otherCustodyRow: Custody = { ...custodyRow, custodyId: OTHER_CUSTODY_ID }

/**
 * The custody row key used to be a hand-rolled
 * `['custody', 'row', scope, custodyId]`. Nothing matched it: not
 * `clearProtectedAuthCache`/`clearScopedQueries` (the `scoped` namespace only),
 * not `useCustodyInvalidation` (which invalidates `queryKeys.scoped`), and not
 * the active-scope context. A row fetched under one user's authorization
 * therefore survived sign-out and a scope change. These tests pin the rebuilt
 * key to the shared factory and to the two paths that must reach it.
 */
function seedCustodyEndpoints() {
  server.use(
    http.get(`${API_BASE_URL}/custodies`, () =>
      okPageJson([custodyRow], { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 }),
    ),
    // Live `POST /assets/{assetId}/custody-assignment` answers 201
    // `ApiResponse<ResourceIdResponse>` — `{ id }` only, never the full row.
    http.post(`${API_BASE_URL}/assets/${ASSET_ID}/custody-assignment`, () =>
      okJson({ id: CUSTODY_ID }),
    ),
  )

  return custodyRow
}

function createWrapper() {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  act(() => {
    queryClient.clear()
    useAuthSessionStore.setState({ status: 'initializing' })
  })
})

describe('custody row cache key (e24-t10 review)', () => {
  it('stores the detail row under the shared scoped key factory', async () => {
    const row = seedCustodyEndpoints()
    const wrapper = createWrapper()

    const { result } = renderHook(() => useCustodyRowQuery(CUSTODY_ID), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ custodyId: CUSTODY_ID })

    const scopedKey = custodyQueryKeys.row(WAREHOUSE_SCOPE, CUSTODY_ID)
    expect(scopedKey[0]).toBe('scoped')
    expect(queryClient.getQueryData(scopedKey)).toMatchObject({ custodyId: CUSTODY_ID })
    expect(queryClient.getQueryData(scopedKey)).not.toBeNull()
    expect(row.custodyId).toBe(CUSTODY_ID)
  })

  it('evicts the detail row on logout so the next user cannot read it from memory', async () => {
    seedCustodyEndpoints()
    server.use(http.post(`${API_BASE_URL}/auth/logout`, () => okJson({})))
    const wrapper = createWrapper()

    act(() => {
      useAuthSessionStore.setState({ status: 'authenticated' })
    })
    const { result, unmount } = renderHook(() => useCustodyRowQuery(CUSTODY_ID), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const rowKey = custodyQueryKeys.row(WAREHOUSE_SCOPE, CUSTODY_ID)
    expect(queryClient.getQueryData(rowKey)).toMatchObject({ custodyId: CUSTODY_ID })
    unmount()

    await act(async () => {
      await authSessionLifecycle.logout()
    })

    expect(queryClient.getQueryData(rowKey)).toBeUndefined()
    expect(useAuthSessionStore.getState().status).toBe('unauthenticated')
  })

  it('removes the detail row when the server cannot be reached on logout', async () => {
    seedCustodyEndpoints()
    server.use(http.post(`${API_BASE_URL}/auth/logout`, () => HttpResponse.error()))
    const wrapper = createWrapper()

    act(() => {
      useAuthSessionStore.setState({ status: 'authenticated' })
    })
    const { result, unmount } = renderHook(() => useCustodyRowQuery(CUSTODY_ID), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const rowKey = custodyQueryKeys.row(WAREHOUSE_SCOPE, CUSTODY_ID)
    expect(queryClient.getQueryData(rowKey)).toMatchObject({ custodyId: CUSTODY_ID })
    unmount()

    await act(async () => {
      await expect(authSessionLifecycle.logout()).rejects.toBeTruthy()
    })

    expect(queryClient.getQueryData(rowKey)).toBeUndefined()
    expect(useAuthSessionStore.getState().status).toBe('unauthenticated')
  })

  it('reaches the detail row and the asset registry when a custody mutation invalidates its scope', async () => {
    seedCustodyEndpoints()
    const wrapper = createWrapper()

    const listQuery = { page: 1, pageSize: 20, subjectType: 'Asset' as const }
    const listKey = custodyQueryKeys.custodies(WAREHOUSE_SCOPE, listQuery)
    const rowKey = custodyQueryKeys.row(WAREHOUSE_SCOPE, CUSTODY_ID)
    const assetKey = assetQueryKeys.asset(WAREHOUSE_SCOPE, ASSET_ID)
    act(() => {
      queryClient.setQueryData(listKey, {
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      })
      queryClient.setQueryData(rowKey, custodyRow)
      queryClient.setQueryData(assetKey, { id: ASSET_ID })
    })

    const { result } = renderHook(
      () => ({
        assign: useAssignCustodyMutation(),
        list: useCustodiesQuery(listQuery),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    await act(async () => {
      await result.current.assign.mutateAsync({
        assetId: ASSET_ID,
        request: {
          employeeId: '55555555-5555-4555-8555-555555555555',
          expectedCustodyRowVersion: 1,
        },
      })
    })

    // The row key lives under the invalidated `scoped` namespace root, so the
    // detail page open beside the assign dialog refetches with the list.
    expect(queryClient.getQueryState(rowKey)?.isInvalidated).toBe(true)
    // The asset fragment used to be the bare `['asset']`, which matched no real
    // key: every asset key is `['scoped', kind, id, 'asset', ...]`.
    expect(queryClient.getQueryState(assetKey)?.isInvalidated).toBe(true)
    expect(assetKey[0]).toBe('scoped')
  })
})

/**
 * The live API has no `GET /custodies/{id}` and no `custodyId` filter, so the
 * hook resolves the row by scanning the ONE-based pages of the Asset-scoped
 * list. It used to look at page 1 only: a row past the first hundred entries
 * resolved to `null` and the detail page reported a load failure for a row
 * that exists and is reachable from /custody/active.
 */
describe('custody row resolution across the Asset-scoped pages', () => {
  it('resolves a row that sits on page 2 of a two-page list', async () => {
    const requested: URLSearchParams[] = []
    server.use(
      http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
        const params = new URL(request.url).searchParams
        requested.push(params)
        const page = Number(params.get('page'))
        return page === 2
          ? okPageJson([custodyRow], { page: 2, pageSize: 100, totalCount: 101, totalPages: 2 })
          : okPageJson([otherCustodyRow], {
              page: 1,
              pageSize: 100,
              totalCount: 101,
              totalPages: 2,
            })
      }),
    )
    const wrapper = createWrapper()

    const { result } = renderHook(() => useCustodyRowQuery(CUSTODY_ID), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ custodyId: CUSTODY_ID })
    // The scan walks the pages in order and stops at the first hit.
    expect(requested.map((params) => params.get('page'))).toEqual(['1', '2'])
    // The wire carries the ONE-based page, the bound page size and the
    // subject filter — and nothing the server does not bind.
    expect(requested.map((params) => params.get('pageSize'))).toEqual(['100', '100'])
    expect(requested.map((params) => params.get('subjectType'))).toEqual(['Asset', 'Asset'])
    expect(requested.every((params) => !params.has('pageIndex'))).toBe(true)
  })

  it('returns null and stops at the last page when no page holds the row', async () => {
    const requestedPages: (string | null)[] = []
    server.use(
      http.get(`${API_BASE_URL}/custodies`, ({ request }) => {
        const params = new URL(request.url).searchParams
        requestedPages.push(params.get('page'))
        const page = Number(params.get('page'))
        return okPageJson([otherCustodyRow], {
          page,
          pageSize: 100,
          totalCount: 101,
          totalPages: 2,
        })
      }),
    )
    const wrapper = createWrapper()

    const { result } = renderHook(() => useCustodyRowQuery(CUSTODY_ID), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
    // The scan stops when the server's totalPages is exhausted.
    expect(requestedPages).toEqual(['1', '2'])
  })
})
