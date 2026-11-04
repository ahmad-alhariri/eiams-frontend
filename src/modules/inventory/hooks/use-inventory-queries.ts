import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { inventoryService } from '@/modules/inventory/services/inventory.service'
import type {
  ListInventoryBalancesQuery,
  ListStockMovementsQuery,
} from '@/modules/inventory/types/inventory.types'
import { OPERATIONAL_STALE_TIME } from '@/shared/services/query.client'
import {
  keepPreviousDataInSameScope,
  queryKeys,
  RESOURCES,
  type ScopeCacheKey,
} from '@/shared/services/query-keys'

export const INVENTORY_RESOURCE = RESOURCES.inventory
const EMPTY_QUERY = {} as const

export const inventoryQueryKeys = {
  balances: (scope: ScopeCacheKey, query: ListInventoryBalancesQuery) =>
    queryKeys.scoped(scope, INVENTORY_RESOURCE, 'balances', query),
  balance: (scope: ScopeCacheKey, balanceId: string) =>
    queryKeys.scoped(scope, INVENTORY_RESOURCE, 'balances', balanceId),
  movements: (scope: ScopeCacheKey, query: ListStockMovementsQuery) =>
    queryKeys.scoped(scope, INVENTORY_RESOURCE, 'movements', query),
  movement: (scope: ScopeCacheKey, movementId: string) =>
    queryKeys.scoped(scope, INVENTORY_RESOURCE, 'movements', movementId),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

export function useInventoryBalancesQuery(query: ListInventoryBalancesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    placeholderData: keepPreviousDataInSameScope(scope),
    queryKey:
      scope === undefined
        ? queryKeys.unscoped(INVENTORY_RESOURCE, 'balances', query)
        : inventoryQueryKeys.balances(scope, query),
    queryFn: ({ signal }) => inventoryService.listBalances(query, { signal }),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useInventoryBalanceQuery(balanceId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || balanceId === undefined
        ? queryKeys.unscoped(INVENTORY_RESOURCE, 'balances', balanceId)
        : inventoryQueryKeys.balance(scope, balanceId),
    queryFn: ({ signal }) => inventoryService.getBalance(balanceId ?? '', { signal }),
    enabled: scope !== undefined && balanceId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useStockMovementsQuery(query: ListStockMovementsQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    placeholderData: keepPreviousDataInSameScope(scope),
    queryKey:
      scope === undefined
        ? queryKeys.unscoped(INVENTORY_RESOURCE, 'movements', query)
        : inventoryQueryKeys.movements(scope, query),
    queryFn: ({ signal }) => inventoryService.listMovements(query, { signal }),
    enabled: scope !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}

export function useStockMovementQuery(movementId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || movementId === undefined
        ? queryKeys.unscoped(INVENTORY_RESOURCE, 'movements', movementId)
        : inventoryQueryKeys.movement(scope, movementId),
    queryFn: ({ signal }) => inventoryService.getMovement(movementId ?? '', { signal }),
    enabled: scope !== undefined && movementId !== undefined,
    staleTime: OPERATIONAL_STALE_TIME,
  })
}
