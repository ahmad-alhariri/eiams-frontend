import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'

import {
  clearScopedQueries,
  invalidateScopedQueries,
  queryKeys,
  removeScopedQueries,
  type ScopeCacheKey,
} from '@/shared/services/query-keys'
import { apiClient } from '@/shared/services/api.client'
import { server } from '@/test/msw/server'

/**
 * Scope-isolation verification (e24-t06).
 *
 * §7.2 human decision: "frontend scope filter is not a security control —
 * server scope filtering is authoritative." This file therefore proves the
 * frontend never *misrepresents* scope: cache entries are namespaced per scope,
 * a scope switch evicts the former scope's data, and a 403 from a
 * scope-filtered endpoint surfaces as a forbidden error rather than an empty
 * list that reads as "this warehouse has no stock".
 *
 * Frontend scope filtering is a UX aid only. These tests guard what a user can
 * observe — a stale balance or movement row surviving a scope switch — not
 * server-side row security.
 */

const WAREHOUSE_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const WAREHOUSE_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const SITE_A = 'cccccccc-0000-4000-8000-000000000003'

const enterpriseScope: ScopeCacheKey = { kind: 'enterprise' }
const siteScope: ScopeCacheKey = { kind: 'site', id: SITE_A }
const warehouseScope: ScopeCacheKey = { kind: 'warehouse', id: WAREHOUSE_A }
const otherWarehouseScope: ScopeCacheKey = { kind: 'warehouse', id: WAREHOUSE_B }

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  })
}

describe('scope-key namespacing', () => {
  it('produces a different key per warehouse for the same resource', () => {
    const a = queryKeys.scoped(warehouseScope, 'inventoryBalances', { page: 1 })
    const b = queryKeys.scoped(otherWarehouseScope, 'inventoryBalances', { page: 1 })
    expect(a).not.toEqual(b)
  })

  it('separates scope kinds that would otherwise share an id string', () => {
    // Reusing an id across kinds must not let a site entry satisfy a
    // warehouse lookup, or vice versa.
    const asSite = queryKeys.scoped({ kind: 'site', id: SITE_A }, 'audit')
    const asWarehouse = queryKeys.scoped({ kind: 'warehouse', id: SITE_A }, 'audit')
    expect(asSite).not.toEqual(asWarehouse)
  })

  it('keeps the scope kind and id as fixed leading key positions', () => {
    const key = queryKeys.scoped(warehouseScope, 'inventoryMovements')
    expect(key[0]).toBe('scoped')
    expect(key[1]).toBe('warehouse')
    expect(key[2]).toBe(WAREHOUSE_A)
  })

  it('encodes enterprise scope with a null id', () => {
    const key = queryKeys.scoped(enterpriseScope, 'reports')
    expect(key[1]).toBe('enterprise')
    expect(key[2]).toBeNull()
  })

  it('keeps public master data outside the scoped namespace', () => {
    // Catalog and org lookups are reference data; a scope switch must not
    // refetch them, but they must also never be mistaken for scoped rows.
    const publicKey = queryKeys.public('catalogMaterials')
    expect(publicKey[0]).toBe('public')
    expect(publicKey).not.toContain(warehouseScope.kind)
  })
})

describe('a scope switch evicts every scoped entry', () => {
  it('removes the previous scope data instead of leaving it readable', async () => {
    const qc = client()
    const previous = queryKeys.scoped(siteScope, 'inventoryBalances', { materialId: 'M-1' })
    const next = queryKeys.scoped(warehouseScope, 'inventoryBalances', { materialId: 'M-1' })
    const publicKey = queryKeys.public('catalogUnits')

    qc.setQueryData(previous, [{ warehouseId: WAREHOUSE_A, quantity: 500 }])
    qc.setQueryData(next, [{ warehouseId: WAREHOUSE_A, quantity: 12 }])
    qc.setQueryData(publicKey, [{ code: 'PCS' }])

    await clearScopedQueries(qc)

    expect(qc.getQueryData(previous)).toBeUndefined()
    expect(qc.getQueryData(next)).toBeUndefined()
    // Reference data survives, so switching scope is not a full reload.
    expect(qc.getQueryData(publicKey)).toEqual([{ code: 'PCS' }])
  })

  it('is safe to call when nothing was cached', async () => {
    await expect(clearScopedQueries(client())).resolves.toBeUndefined()
  })
})

describe('the three cache-eviction helpers keep distinct, intended semantics', () => {
  it('invalidate marks a scope stale without dropping its data', async () => {
    // A mutation inside the same scope must not blank the screen; the entry is
    // refetched, and the old value stays available while it is in flight.
    const qc = client()
    const key = queryKeys.scoped(warehouseScope, 'inventoryBalances', { page: 1 })
    qc.setQueryData(key, [{ quantity: 1 }])

    await invalidateScopedQueries(qc, warehouseScope)

    expect(qc.getQueryData(key)).toEqual([{ quantity: 1 }])
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('invalidate touches only the named scope', async () => {
    const qc = client()
    const mine = queryKeys.scoped(warehouseScope, 'inventoryMovements')
    const theirs = queryKeys.scoped(otherWarehouseScope, 'inventoryMovements')
    qc.setQueryData(mine, ['mine'])
    qc.setQueryData(theirs, ['theirs'])

    await invalidateScopedQueries(qc, warehouseScope)

    expect(qc.getQueryState(mine)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(theirs)?.isInvalidated).toBe(false)
    expect(qc.getQueryData(theirs)).toEqual(['theirs'])
  })

  it('removeScopedQueries drops all scopes, for session revocation', async () => {
    const qc = client()
    const a = queryKeys.scoped(warehouseScope, 'audit')
    const b = queryKeys.scoped(siteScope, 'audit')
    const c = queryKeys.scoped(enterpriseScope, 'audit')
    for (const key of [a, b, c]) qc.setQueryData(key, ['seeded'])

    removeScopedQueries(qc)

    expect(qc.getQueryData(a)).toBeUndefined()
    expect(qc.getQueryData(b)).toBeUndefined()
    expect(qc.getQueryData(c)).toBeUndefined()
  })
})

describe('server authority over frontend scope filtering', () => {
  it('surfaces a 403 as a forbidden error rather than an empty result', async () => {
    server.use(
      http.get('/api/v1/inventory/balances', () =>
        HttpResponse.json({ message: 'الوصول إلى هذا المستودع غير مسموح.' }, { status: 403 }),
      ),
    )

    // Reporting "this warehouse has no stock" for a refused request would hide
    // a permissions problem from the user.
    await expect(
      apiClient.get('/inventory/balances', { params: { warehouseId: WAREHOUSE_B } }),
    ).rejects.toMatchObject({ response: { status: 403 } })
  })

  it('does not convert a 403 into a successful empty page', async () => {
    server.use(
      http.get('/api/v1/inventory/movements', () => HttpResponse.json({}, { status: 403 })),
    )

    const outcome = await apiClient
      .get('/inventory/movements')
      .then(() => 'resolved' as const)
      .catch(() => 'rejected' as const)

    expect(outcome).toBe('rejected')
  })

  it('does not retry a scope refusal into a misleading success', async () => {
    let calls = 0
    server.use(
      http.get('/api/v1/reports/warehouse-summary', () => {
        calls += 1
        return HttpResponse.json({ message: 'forbidden' }, { status: 403 })
      }),
    )

    await expect(apiClient.get('/reports/warehouse-summary')).rejects.toBeTruthy()
    expect(calls).toBe(1)
  })
})

describe('scope narrowing on the client never invents rows', () => {
  it('filters a fetched page down without ever adding a row', () => {
    const fetched = [
      { id: '1', warehouseId: WAREHOUSE_A },
      { id: '2', warehouseId: WAREHOUSE_B },
    ]
    const narrowed = fetched.filter((row) => row.warehouseId === WAREHOUSE_A)

    expect(narrowed).toHaveLength(1)
    for (const row of narrowed) expect(fetched).toContain(row)
  })

  it('returns nothing when a fetched page holds no in-scope row', () => {
    // The frontend can only narrow rows it already holds, so a page fetched for
    // another scope yields an empty view rather than a leak.
    const fetched = [{ id: '2', warehouseId: WAREHOUSE_B }]
    expect(fetched.filter((row) => row.warehouseId === WAREHOUSE_A)).toEqual([])
  })
})
