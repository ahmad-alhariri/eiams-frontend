import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { createWarehouseService } from '@/modules/warehouse/services/warehouse.service'
import type {
  WarehouseCapabilityUpsertRequest,
  WarehouseMaterialSettingUpsertRequest,
  WarehouseUpsertRequest,
} from '@/modules/warehouse/types/warehouse.types'
import { toast } from '@/shared/ui/toast-manager'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const WAREHOUSE_PUBLIC_KEY = 'warehouse' as const

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

let warehouseService: ReturnType<typeof createWarehouseService> = createWarehouseService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {} as any,
)

export function useWarehouseService() {
  return warehouseService
}

export function setWarehouseService(transport: Parameters<typeof createWarehouseService>[0]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warehouseService = createWarehouseService(transport as any)
}

/**
 * Installs an authoritative mutation result into the cache so the UI reflects
 * the server-returned state without waiting for a stale refetch.
 */
function installWarehouse(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  warehouseId: string,
  warehouse: { warehouseId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, WAREHOUSE_PUBLIC_KEY, 'warehouses', warehouseId), warehouse)
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: WarehouseUpsertRequest) => warehouseService.createWarehouse(request),
    onSuccess: (result) => {
      installWarehouse(queryClient, scope, result.warehouseId, result)
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          {},
        ),
      })
      toast.success({ title: 'تمت إضافة المستودع.' })
    },
  })
}

export function useUpdateWarehouseMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      warehouseId,
      request,
    }: {
      readonly warehouseId: string
      readonly request: WarehouseUpsertRequest
    }) => warehouseService.updateWarehouse(warehouseId, request),
    onSuccess: (result) => {
      installWarehouse(queryClient, scope, result.warehouseId, result)
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          {},
        ),
      })
      toast.success({ title: 'تم حفظ تعديلات المستودع.' })
    },
  })
}

export function useReplaceWarehouseCapabilitiesMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      capability,
    }: {
      readonly capability: WarehouseCapabilityUpsertRequest
    }) => warehouseService.createWarehouseCapability(capability),
    onSuccess: () => {
      if (scope === undefined) return
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope,
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          {},
          'capabilities',
        ),
      })
      toast.success({ title: 'تم حفظ إعدادات القدرات.' })
    },
  })
}

export function useDeleteWarehouseCapabilityMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (capabilityId: string) => warehouseService.deleteWarehouseCapability(capabilityId),
    onSuccess: () => {
      if (scope === undefined) return
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope,
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          {},
          'capabilities',
        ),
      })
    },
  })
}

export function useUpsertWarehouseMaterialSettingMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: WarehouseMaterialSettingUpsertRequest) =>
      warehouseService.createWarehouseMaterialSetting(request),
    onSuccess: () => {
      if (scope === undefined) return
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope,
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          {},
          'material-settings',
          {},
        ),
      })
      toast.success({ title: 'تم حفظ إعداد المادة.' })
    },
  })
}
