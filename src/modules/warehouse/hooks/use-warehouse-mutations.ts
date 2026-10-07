import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import type {
  WarehouseCapabilityUpsertRequest,
  WarehouseCreateRequest,
  WarehouseMaterialSettingUpsertRequest,
  WarehouseUpdateRequest,
} from '@/modules/warehouse/types/warehouse.types'
import { toast } from '@/shared/ui/toast-manager'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

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
//
// Create and update are separate request types because the two bodies are
// different: `POST /warehouses` binds `siteId` and `code`, `PUT /warehouses/{id}`
// binds neither and takes `expectedRowVersion`.
//
// Cache invalidation stops at the `warehouses` RESOURCE key, with no trailing
// `{}` query segment. Query keys match by prefix element equality, so a `{}`
// segment only ever matched a query made with exactly `{}` — it never matched a
// real list query (`{ page, pageSize, search, ... }`) nor a per-warehouse
// sub-resource, leaving the list stale after every save. The same idiom
// `catalog/hooks/use-catalog-mutations.ts` uses.

function invalidateWarehouses(client: QueryClient, scope: ScopeCacheKey) {
  return client.invalidateQueries({
    queryKey: queryKeys.scoped(scope, WAREHOUSE_PUBLIC_KEY, 'warehouses'),
  })
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: WarehouseCreateRequest) => warehouseService.createWarehouse(request),
    onSuccess: () => {
      invalidateWarehouses(queryClient, scope ?? { kind: 'enterprise' })
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
      readonly request: WarehouseUpdateRequest
    }) => warehouseService.updateWarehouse(warehouseId, request),
    // `updateWarehouse` resolves with NO body, so nothing may be destructured off
    // the response — the old `onSuccess: ({ warehouseId }) => ...` was a latent
    // crash, not a style nit.
    onSuccess: () => {
      invalidateWarehouses(queryClient, scope ?? { kind: 'enterprise' })
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
    onSuccess: (_data, { warehouseId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          WAREHOUSE_PUBLIC_KEY,
          'warehouses',
          warehouseId,
          'material-settings',
        ),
      })
      toast.success({ title: 'تم حفظ إعداد المادة.' })
    },
  })
}
