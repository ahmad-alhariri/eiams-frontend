import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { InventoryBalance } from '@/shared/types/generated/eiams-v1'
import { createInventoryBalance, createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import { useIssueLineBalances } from './use-issue-line-balances'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(30)

function createBalance(overrides: Partial<InventoryBalance> = {}): InventoryBalance {
  return createInventoryBalance({
    warehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
    ...overrides,
  })
}

function createWrapper(existingClient?: QueryClient) {
  const client = existingClient ?? createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/**
 * `retry: false` so a deliberately failing read settles in a single attempt.
 * The production `createQueryClient()` retries once with the default backoff,
 * which would leave the failure pending for ~1s of real time.
 */
function createDeterministicClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('useIssueLineBalances', () => {
  it('resolves one balance per distinct selected material in the given warehouse', async () => {
    const computers = createBalance({
      material: { id: fixtureUuid(24), displayName: 'حاسوب مكتبي' },
      quantity: 15,
    })
    const paper = createBalance({
      material: { id: fixtureUuid(27), displayName: 'ورق طباعة' },
      quantity: 12,
    })
    const requestedQueries: string[] = []
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        requestedQueries.push(new URL(request.url).search)
        const materialId = new URL(request.url).searchParams.get('materialId')
        const row = [computers, paper].find((item) => item.material.id === materialId)
        return HttpResponse.json(createPage(row === undefined ? [] : [row]))
      }),
    )

    const { result } = renderHook(
      () => useIssueLineBalances(WAREHOUSE_ID, [computers.material.id, paper.material.id]),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.balanceByMaterialId.get(computers.material.id)).toBe(15)
    expect(result.current.balanceByMaterialId.get(paper.material.id)).toBe(12)
    // Exactly one query per distinct material.
    expect(requestedQueries).toHaveLength(2)
  })

  it('deduplicates repeated materials into a single lookup', async () => {
    const row = createBalance({ quantity: 3 })
    let callCount = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        callCount += 1
        return HttpResponse.json(createPage([row]))
      }),
    )

    const { result } = renderHook(
      () => useIssueLineBalances(WAREHOUSE_ID, [row.material.id, row.material.id]),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.balanceByMaterialId.size).toBe(1))
    expect(callCount).toBe(1)
  })

  it('maps a material without any balance row to null (no stock held)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => HttpResponse.json(createPage([]))),
    )

    const { result } = renderHook(() => useIssueLineBalances(WAREHOUSE_ID, [fixtureUuid(99)]), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect([...result.current.balanceByMaterialId.values()][0]).toBeNull()
  })

  it('ignores empty-string material ids and skips lookups entirely when nothing is selected', () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        throw new Error('no lookup should fire for an empty selection')
      }),
    )

    const { result } = renderHook(() => useIssueLineBalances(WAREHOUSE_KEY(), ['', '']), {
      wrapper: createWrapper(),
    })
    expect(result.current.balanceByMaterialId.size).toBe(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('issues no queries before a warehouse is chosen', () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        throw new Error('no lookup should fire without a warehouse')
      }),
    )

    const { result } = renderHook(() => useIssueLineBalances(undefined, [fixtureUuid(99)]), {
      wrapper: createWrapper(),
    })
    expect(result.current.balanceByMaterialId.size).toBe(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('issues no queries before the session scope is ready', () => {
    activeScope.key = undefined
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        throw new Error('no lookup should fire outside an active scope')
      }),
    )

    const { result } = renderHook(() => useIssueLineBalances(WAREHOUSE_ID, [fixtureUuid(99)]), {
      wrapper: createWrapper(),
    })
    expect(result.current.balanceByMaterialId.size).toBe(0)
    expect(result.current.isLoading).toBe(false)
  })

  // e24-t10 / B3. `null` in this map means "the server says no stock is held",
  // so a failed read must never produce one. Before the fix the loop only
  // checked `isLoading`, so an errored query fell through to
  // `set(materialId, null)` and both outbound forms printed "quantity exceeds
  // the available balance (0)" — a claim about inventory the server never
  // made.
  it('leaves a failed lookup unknown instead of mapping it to zero stock, and retries it on demand', async () => {
    const materialId = fixtureUuid(24)
    let balanceRequests = 0
    let shouldFail = true
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        balanceRequests += 1
        if (shouldFail) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json(createPage([createBalance({ quantity: 40 })]))
      }),
    )

    const { result } = renderHook(() => useIssueLineBalances(WAREHOUSE_ID, [materialId]), {
      wrapper: createWrapper(createDeterministicClient()),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isLoading).toBe(false)
    // Unknown, not zero: the key must be ABSENT, not present-and-null.
    expect(result.current.balanceByMaterialId.has(materialId)).toBe(false)
    expect(result.current.balanceByMaterialId.get(materialId)).toBeUndefined()
    expect(balanceRequests).toBe(1)

    shouldFail = false
    act(() => {
      result.current.retry()
    })

    await waitFor(() => expect(result.current.balanceByMaterialId.get(materialId)).toBe(40))
    expect(result.current.isError).toBe(false)
    expect(balanceRequests).toBe(2)
  })

  it('reports the failure without disturbing the lookups that succeeded', async () => {
    const good = createBalance({ quantity: 7 })
    const failingMaterialId = fixtureUuid(25)
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, ({ request }) => {
        const materialId = new URL(request.url).searchParams.get('materialId')
        if (materialId === failingMaterialId) {
          return new HttpResponse(null, { status: 503 })
        }
        return HttpResponse.json(createPage([good]))
      }),
    )

    const { result } = renderHook(
      () => useIssueLineBalances(WAREHOUSE_ID, [good.material.id, failingMaterialId]),
      { wrapper: createWrapper(createDeterministicClient()) },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.balanceByMaterialId.get(good.material.id)).toBe(7)
    expect(result.current.balanceByMaterialId.has(failingMaterialId)).toBe(false)
  })

  it('keeps a cached balance when a background refetch of that same material fails', async () => {
    const materialId = fixtureUuid(26)
    let balanceRequests = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        balanceRequests += 1
        return balanceRequests === 1
          ? HttpResponse.json(createPage([createBalance({ quantity: 9 })]))
          : new HttpResponse(null, { status: 500 })
      }),
    )

    const client = createDeterministicClient()
    const { result } = renderHook(() => useIssueLineBalances(WAREHOUSE_ID, [materialId]), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => expect(result.current.balanceByMaterialId.get(materialId)).toBe(9))
    // Stale the cached row, then let the next refetch fail. The server's last
    // authoritative answer is still 9, so the form must not degrade into an
    // unexplained block (the e24-t09 F-1 precedent).
    await act(async () => {
      await client.invalidateQueries({ predicate: () => true })
    })

    await waitFor(() => expect(balanceRequests).toBeGreaterThan(1))
    expect(result.current.balanceByMaterialId.get(materialId)).toBe(9)
    expect(result.current.isError).toBe(false)
  })
})

/** Keeps the scope-key literal out of the hoisted mock boundary. */
function WAREHOUSE_KEY(): string {
  return WAREHOUSE_ID
}
