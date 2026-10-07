import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import { okJson, okPageJson } from '@/test/msw/envelope'
import { wireInventoryBalance, wireStockMovement } from '@/test/msw/inventory-wire-fixtures'
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
    const movement = wireStockMovement()
    const scope = { kind: 'warehouse' as const, id: movement.warehouseId }
    const balanceQuery = { warehouseId: movement.warehouseId }
    const movementQuery = { movementType: 'Receipt' as const }

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
    const balance = wireInventoryBalance()
    const movement = wireStockMovement()

    server.use(
      http.get(`${API_BASE_URL}/inventory/balances`, () => okPageJson([balance])),
      http.get(`${API_BASE_URL}/inventory/balances/${balance.balanceId}`, () => okJson(balance)),
      http.get(`${API_BASE_URL}/inventory/movements`, () => okPageJson([movement])),
      http.get(`${API_BASE_URL}/inventory/movements/${movement.movementId}`, () =>
        okJson(movement),
      ),
    )

    const listWrapper = createWrapper()
    const balanceList = renderHook(
      () => useInventoryBalancesQuery({ warehouseId: balance.warehouseId }),
      { wrapper: listWrapper.Wrapper },
    )
    const balanceDetail = renderHook(() => useInventoryBalanceQuery(balance.balanceId), {
      wrapper: createWrapper().Wrapper,
    })
    const movementList = renderHook(() => useStockMovementsQuery({ movementType: 'Receipt' }), {
      wrapper: createWrapper().Wrapper,
    })
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
        return okPageJson([wireInventoryBalance()])
      }),
      http.get(`${API_BASE_URL}/inventory/movements`, () => {
        requestCount += 1
        return okPageJson([wireStockMovement()])
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
        return HttpResponse.json(wireInventoryBalance())
      }),
      http.get(`${API_BASE_URL}/inventory/movements/:movementId`, () => {
        requestCount += 1
        return HttpResponse.json(wireStockMovement())
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
