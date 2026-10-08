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

// The warehouse service is a single instance owned by
// services/warehouse.service.ts (9uuf). This file previously kept its own
// private copy plus a `useWarehouseService`/`setWarehouseService` pair whose
// exports had zero importers; the copy is what kept these query hooks calling
// an empty transport at runtime. Do not reintroduce a local instance — inject
// through `setWarehouseService` in the service module instead.
//
// CANCELLATION. Every `queryFn` below destructures the `signal` TanStack Query
// supplies and forwards it to the service as a `RequestContext`. Querying used
// to discard that signal, so a warehouse list kept resolving after the page
// that wanted it was gone. This is the tracer pattern the other module hooks
// copy: reads forward the signal, mutations never do.

export function useWarehousesQuery(query: ListWarehousesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(WAREHOUSE_RESOURCE, 'warehouses', query)
        : warehouseQueryKeys.warehouses(scope, query),
    queryFn: ({ signal }) => warehouseService.listWarehouses(query, { signal }),
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
    queryFn: ({ signal }) => warehouseService.getWarehouse(warehouseId ?? '', { signal }),
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
    queryFn: ({ signal }) =>
      warehouseService.getWarehouseCapabilities(warehouseId ?? '', { signal }),
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
    queryFn: ({ signal }) =>
      warehouseService.listWarehouseMaterialSettings(warehouseId ?? '', query, { signal }),
    enabled: scope !== undefined && warehouseId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}
