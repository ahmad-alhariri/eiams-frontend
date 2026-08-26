import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type { StockMovement } from '@/shared/types/generated/eiams-v1'
import {
  createInventoryBalance,
  createNamedReference,
  createPage,
  fixtureUuid,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  inventoryQueryKeys,
  useInventoryBalanceQuery,
  useInventoryBalancesQuery,
  useStockMovementQuery,
  useStockMovementsQuery,
} from './use-inventory-queries'

const API_BASE_URL = '/api/v1'

function createStockMovement(): StockMovement {
  return {
    documentId: fixtureUuid(60),
    documentLineId: fixtureUuid(61),
    documentReference: 'RCP-2026-0001',
    material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
    movementId: fixtureUuid(70),
    movementType: 'Receipt',
    postedAt: '2026-08-21T10:00:00.000Z',
    postedBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدير المستودع' }),
    quantityDelta: 5,
    warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
  }
}

function createWrapper() {
  const client = createQueryClient()
  return {
    client,
    Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    },
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('inventory query hooks', () => {
  it('uses scope-isolated keys that retain every server filter and sort selection', () => {
    const scope = { kind: 'warehouse' as const, id: fixtureUuid(30) }
    const balanceQuery = { lowStockState: 'Low' as const, sortBy: 'Quantity' as const }
    const movementQuery = { movementType: 'Receipt' as const, sortBy: 'PostedAt' as const }

    expect(inventoryQueryKeys.balances(scope, balanceQuery)).toEqual([
      'scoped',
      'warehouse',
      scope.id,
      'inventory',
      'balances',
      balanceQuery,
    ])
    expect(inventoryQueryKeys.balance(scope, 'balance-1')).toEqual([
      'scoped',
      'warehouse',
      scope.id,
      'inventory',
      'balances',
      'balance-1',
    ])
    expect(inventoryQueryKeys.movements(scope, movementQuery)).toEqual([
      'scoped',
      'warehouse',
      scope.id,
      'inventory',
      'movements',
      movementQuery,
    ])
    expect(inventoryQueryKeys.movement(scope, 'movement-1')).toEqual([
      'scoped',
      'warehouse',
      scope.id,
      'inventory',
      'movements',
      'movement-1',
    ])
  })

  it('reads every inventory resource through scoped operational queries', async () => {
    const balance = createInventoryBalance()
    const movement = createStockMovement()

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () =>
        HttpResponse.json(createPage([balance])),
      ),
      http.get(`${API_BASE_URL}/inventory/balances/${balance.balanceId}`, () =>
        HttpResponse.json(balance),
      ),
      http.get(`${API_BASE_URL}/inventory/movements`, () =>
        HttpResponse.json(createPage([movement])),
      ),
      http.get(`${API_BASE_URL}/inventory/movements/${movement.movementId}`, () =>
        HttpResponse.json(movement),
      ),
    )

    const listWrapper = createWrapper()
    const balanceList = renderHook(
      () => useInventoryBalancesQuery({ lowStockState: 'Low', sortBy: 'Quantity' }),
      { wrapper: listWrapper.Wrapper },
    )
    const balanceDetail = renderHook(() => useInventoryBalanceQuery(balance.balanceId), {
      wrapper: createWrapper().Wrapper,
    })
    const movementList = renderHook(
      () => useStockMovementsQuery({ movementType: 'Receipt', sortBy: 'PostedAt' }),
      { wrapper: createWrapper().Wrapper },
    )
    const movementDetail = renderHook(() => useStockMovementQuery(movement.movementId), {
      wrapper: createWrapper().Wrapper,
    })

    await waitFor(() => {
      expect(balanceList.result.current.isSuccess).toBe(true)
      expect(balanceDetail.result.current.isSuccess).toBe(true)
      expect(movementList.result.current.isSuccess).toBe(true)
      expect(movementDetail.result.current.isSuccess).toBe(true)
    })

    expect(balanceList.result.current.data?.items).toEqual([balance])
    expect(balanceDetail.result.current.data).toEqual(balance)
    expect(movementList.result.current.data?.items).toEqual([movement])
    expect(movementDetail.result.current.data).toEqual(movement)
  })

  it('does not request inventory data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createInventoryBalance()]))
      }),
      http.get(`${API_BASE_URL}/inventory/movements`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createStockMovement()]))
      }),
    )

    const balance = renderHook(() => useInventoryBalancesQuery(), {
      wrapper: createWrapper().Wrapper,
    })
    const movement = renderHook(() => useStockMovementsQuery(), {
      wrapper: createWrapper().Wrapper,
    })

    await waitFor(() => {
      expect(balance.result.current.fetchStatus).toBe('idle')
      expect(movement.result.current.fetchStatus).toBe('idle')
    })
    expect(requestCount).toBe(0)
  })

  it('does not request detail resources without their contract identifiers', async () => {
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/inventory/balances/:balanceId`, () => {
        requestCount += 1
        return HttpResponse.json(createInventoryBalance())
      }),
      http.get(`${API_BASE_URL}/inventory/movements/:movementId`, () => {
        requestCount += 1
        return HttpResponse.json(createStockMovement())
      }),
    )

    const balance = renderHook(() => useInventoryBalanceQuery(undefined), {
      wrapper: createWrapper().Wrapper,
    })
    const movement = renderHook(() => useStockMovementQuery(undefined), {
      wrapper: createWrapper().Wrapper,
    })

    await waitFor(() => {
      expect(balance.result.current.fetchStatus).toBe('idle')
      expect(movement.result.current.fetchStatus).toBe('idle')
    })
    expect(requestCount).toBe(0)
  })
})
