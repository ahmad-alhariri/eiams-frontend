import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import type {
  WarehouseCapabilityUpsertRequest,
  WarehouseMaterialSettingUpsertRequest,
  WarehouseUpsertRequest,
} from '@/modules/warehouse/types/warehouse.types'
import { toast } from '@/shared/ui/toast-manager'
import { queryKeys } from '@/shared/services/query-keys'

const WAREHOUSE_PUBLIC_KEY = 'warehouse' as const

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

// The warehouse service is a single instance owned by
// services/warehouse.service.ts (9uuf). This file previously kept its own
// private copy plus a `useWarehouseService`/`setWarehouseService` pair whose
// exports had zero importers; the copy is what kept these mutation hooks
// calling an empty transport at runtime. Do not reintroduce a local instance —
// inject through `setWarehouseService` in the service module instead.

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: WarehouseUpsertRequest) => warehouseService.createWarehouse(request),
    onSuccess: () => {
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
    onSuccess: ({ warehouseId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          warehouseId,
        ),
      })
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
      warehouseId,
      request,
    }: {
      readonly warehouseId: string
      readonly request: readonly WarehouseCapabilityUpsertRequest[]
    }) => warehouseService.replaceWarehouseCapabilities(warehouseId, request),
    onSuccess: (_, { warehouseId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          warehouseId,
          'capabilities',
        ),
      })
      toast.success({ title: 'تم حفظ إعدادات القدرات.' })
    },
  })
}

export function useUpsertWarehouseMaterialSettingMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      warehouseId,
      request,
    }: {
      readonly warehouseId: string
      readonly request: WarehouseMaterialSettingUpsertRequest
    }) => warehouseService.upsertWarehouseMaterialSetting(warehouseId, request),
    onSuccess: ({ warehouseId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          warehouseId,
          'material-settings',
          {},
        ),
      })
      toast.success({ title: 'تم حفظ إعداد المادة.' })
    },
  })
}
