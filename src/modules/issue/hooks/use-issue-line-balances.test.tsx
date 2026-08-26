import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
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

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
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
})

/** Keeps the scope-key literal out of the hoisted mock boundary. */
function WAREHOUSE_KEY(): string {
  return WAREHOUSE_ID
}
