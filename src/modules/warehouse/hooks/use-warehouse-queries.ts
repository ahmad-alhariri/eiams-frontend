import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import type {
  ListWarehouseMaterialSettingsQuery,
  ListWarehousesQuery,
} from '@/modules/warehouse/types/warehouse.types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const WAREHOUSE_RESOURCE = 'warehouse'
const EMPTY_QUERY = {} as const

export const warehouseQueryKeys = {
  warehouses: (scope: ScopeCacheKey, query: ListWarehousesQuery) =>
    queryKeys.scoped(scope, WAREHOUSE_RESOURCE, 'warehouses', query),
  warehouse: (scope: ScopeCacheKey, warehouseId: string) =>
    queryKeys.scoped(scope, WAREHOUSE_RESOURCE, 'warehouses', warehouseId),
  capabilities: (scope: ScopeCacheKey, warehouseId: string) =>
    queryKeys.scoped(scope, WAREHOUSE_RESOURCE, 'warehouses', warehouseId, 'capabilities'),
  materialSettings: (
    scope: ScopeCacheKey,
    warehouseId: string,
    query: ListWarehouseMaterialSettingsQuery,
  ) =>
    queryKeys.scoped(
      scope,
      WAREHOUSE_RESOURCE,
      'warehouses',
      warehouseId,
      'material-settings',
      query,
    ),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

export function useWarehousesQuery(query: ListWarehousesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(WAREHOUSE_RESOURCE, 'warehouses', query)
        : warehouseQueryKeys.warehouses(scope, query),
    queryFn: () => warehouseService.listWarehouses(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useWarehouseQuery(warehouseId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || warehouseId === undefined
        ? queryKeys.public(WAREHOUSE_RESOURCE, 'warehouses', warehouseId)
        : warehouseQueryKeys.warehouse(scope, warehouseId),
    queryFn: () => warehouseService.getWarehouse(warehouseId ?? ''),
    enabled: scope !== undefined && warehouseId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useWarehouseCapabilitiesQuery(warehouseId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || warehouseId === undefined
        ? queryKeys.public(WAREHOUSE_RESOURCE, 'warehouses', warehouseId, 'capabilities')
        : warehouseQueryKeys.capabilities(scope, warehouseId),
    queryFn: () => warehouseService.getWarehouseCapabilities(warehouseId ?? ''),
    enabled: scope !== undefined && warehouseId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useWarehouseMaterialSettingsQuery(
  warehouseId: string | undefined,
  query: ListWarehouseMaterialSettingsQuery = EMPTY_QUERY,
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || warehouseId === undefined
        ? queryKeys.public(
            WAREHOUSE_RESOURCE,
            'warehouses',
            warehouseId,
            'material-settings',
            query,
          )
        : warehouseQueryKeys.materialSettings(scope, warehouseId, query),
    queryFn: () => warehouseService.listWarehouseMaterialSettings(warehouseId ?? '', query),
    enabled: scope !== undefined && warehouseId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}
