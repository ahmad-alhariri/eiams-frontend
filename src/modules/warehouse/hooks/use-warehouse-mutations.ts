import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import { queryKeys } from '@/shared/services/query-keys'
import type {
  WarehouseCapabilityUpsertRequest,
  WarehouseMaterialSettingUpsertRequest,
  WarehouseUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

type UpdateWarehouseVariables = { warehouseId: string; request: WarehouseUpsertRequest }
type ReplaceWarehouseCapabilitiesVariables = {
  warehouseId: string
  request: readonly WarehouseCapabilityUpsertRequest[]
}
type UpsertWarehouseMaterialSettingVariables = {
  warehouseId: string
  request: WarehouseMaterialSettingUpsertRequest
}

function useInvalidateWarehouses() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) return

    await queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'warehouse'),
      exact: false,
    })
  }
}

export function useCreateWarehouseMutation() {
  const invalidate = useInvalidateWarehouses()
  return useMutation({ mutationFn: warehouseService.createWarehouse, onSuccess: invalidate })
}

export function useUpdateWarehouseMutation() {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: ({ warehouseId, request }: UpdateWarehouseVariables) =>
      warehouseService.updateWarehouse(warehouseId, request),
    onSuccess: invalidate,
  })
}

export function useReplaceWarehouseCapabilitiesMutation() {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: ({ warehouseId, request }: ReplaceWarehouseCapabilitiesVariables) =>
      warehouseService.replaceWarehouseCapabilities(warehouseId, request),
    onSuccess: invalidate,
  })
}

export function useUpsertWarehouseMaterialSettingMutation() {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: ({ warehouseId, request }: UpsertWarehouseMaterialSettingVariables) =>
      warehouseService.upsertWarehouseMaterialSetting(warehouseId, request),
    onSuccess: invalidate,
  })
}
