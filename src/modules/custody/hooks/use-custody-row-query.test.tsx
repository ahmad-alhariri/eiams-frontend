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
import { createAssetCustody, createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const CUSTODY_ID = fixtureUuid(52)
const ASSET_ID = fixtureUuid(230)
const WAREHOUSE_SCOPE: ScopeCacheKey = { kind: 'warehouse', id: fixtureUuid(200) }

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: WAREHOUSE_SCOPE }),
}))

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
  const row = createAssetCustody({ custodyId: CUSTODY_ID, assetId: ASSET_ID })
  server.use(
    http.get(`${API_BASE_URL}/custodies`, () =>
      okPageJson([row], { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 }),
    ),
    http.post(`${API_BASE_URL}/custodies/assign`, () => okJson(row)),
  )

  return row
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

    const listKey = custodyQueryKeys.custodies(WAREHOUSE_SCOPE, { status: 'Active' })
    const rowKey = custodyQueryKeys.row(WAREHOUSE_SCOPE, CUSTODY_ID)
    const assetKey = assetQueryKeys.asset(WAREHOUSE_SCOPE, ASSET_ID)
    act(() => {
      queryClient.setQueryData(listKey, createPage([]))
      queryClient.setQueryData(
        rowKey,
        createAssetCustody({ custodyId: CUSTODY_ID, assetId: ASSET_ID }),
      )
      queryClient.setQueryData(assetKey, { assetId: ASSET_ID })
    })

    const { result } = renderHook(
      () => ({
        assign: useAssignCustodyMutation(),
        list: useCustodiesQuery({ status: 'Active' }),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    await act(async () => {
      await result.current.assign.mutateAsync({
        request: {
          assetId: ASSET_ID,
          custodyKind: 'Operational',
          holderType: 'OrganizationalUnit',
          holderId: fixtureUuid(21),
        } as never,
        idempotencyKey: 'idempotency-custody-row',
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
