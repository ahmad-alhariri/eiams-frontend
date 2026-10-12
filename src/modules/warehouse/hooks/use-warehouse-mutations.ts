import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import type {
  AddWarehouseCapabilityOperationRequest,
  CapabilityOperation,
  CreateWarehouseMaterialSettingRequest,
  GrantWarehouseCapabilityRequest,
  SetWarehouseMaterialSettingStatusRequest,
  UpdateWarehouseMaterialSettingRequest,
  WarehouseCreateRequest,
  WarehouseUpdateRequest,
} from '@/modules/warehouse/types/warehouse.types'
// The int-ordinal encoding of `CapabilityOperation` lives in ONE place,
// `warehouse.api-types`, and is consumed here via `operationOrdinal`. The
// add/remove wire asymmetry (POST binds the int ordinal, DELETE binds the enum
// NAME) is therefore encoded exactly once and pinned by a test there rather
// than duplicated into a second map that could drift.
import { operationOrdinal } from '@/modules/warehouse/types/warehouse.types'
import { toast } from '@/shared/ui/toast-manager'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const WAREHOUSE_PUBLIC_KEY = 'warehouse' as const

function useActiveScopeCacheKey(): ScopeCacheKey | undefined {
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

function invalidateWarehouseCapabilities(
  client: QueryClient,
  scope: ScopeCacheKey,
  warehouseId: string,
) {
  return client.invalidateQueries({
    queryKey: queryKeys.scoped(
      scope,
      WAREHOUSE_PUBLIC_KEY,
      'warehouses',
      warehouseId,
      'capabilities',
    ),
  })
}

function invalidateWarehouseMaterialSettings(
  client: QueryClient,
  scope: ScopeCacheKey,
  warehouseId: string,
) {
  return client.invalidateQueries({
    queryKey: queryKeys.scoped(
      scope,
      WAREHOUSE_PUBLIC_KEY,
      'warehouses',
      warehouseId,
      'material-settings',
    ),
  })
}

function resolveScope(scope: ScopeCacheKey | undefined): ScopeCacheKey {
  return scope ?? { kind: 'enterprise' }
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: WarehouseCreateRequest) => warehouseService.createWarehouse(request),
    onSuccess: () => {
      invalidateWarehouses(queryClient, resolveScope(scope))
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
      invalidateWarehouses(queryClient, resolveScope(scope))
      toast.success({ title: 'تم حفظ تعديلات المستودع.' })
    },
  })
}

export function useGrantWarehouseCapabilityMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: GrantWarehouseCapabilityRequest) =>
      warehouseService.grantWarehouseCapability(request),
    onSuccess: (_, { warehouseId }) => {
      invalidateWarehouseCapabilities(queryClient, resolveScope(scope), warehouseId)
      toast.success({ title: 'تم منح القدرة للمستودع.' })
    },
  })
}

export function useRevokeWarehouseCapabilityMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      warehouseId,
      capabilityId,
    }: {
      readonly warehouseId: string
      readonly capabilityId: string
    }) => {
      // `warehouseId` is accepted for caller ergonomics and cache key
      // symmetry with the grant / operation mutations; the service
      // only needs `capabilityId` because revoke is a per-capability
      // DELETE on the standalone resource. Suppress the unused-arg
      // warning explicitly so the symmetry stays readable.
      void warehouseId
      return warehouseService.revokeWarehouseCapability(capabilityId)
    },
    onSuccess: (_, { warehouseId }) => {
      // Revoke is a SOFT delete: the row remains in the read with status
      // Inactive, so invalidating the list is the right key.
      invalidateWarehouseCapabilities(queryClient, resolveScope(scope), warehouseId)
      toast.success({ title: 'تم إبطال القدرة.' })
    },
  })
}

export function useAddWarehouseCapabilityOperationMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      capabilityId,
      operation,
    }: {
      readonly warehouseId: string
      readonly capabilityId: string
      readonly operation: CapabilityOperation
    }) => {
      const request: AddWarehouseCapabilityOperationRequest = {
        operationType: operationOrdinal(operation),
      }
      return warehouseService.addWarehouseCapabilityOperation(capabilityId, request)
    },
    onSuccess: (_, variables) => {
      // `warehouseId` is supplied by the caller for cache invalidation;
      // it's the only way the editor knows which capability list to
      // refresh without re-deriving it from the capability id.
      invalidateWarehouseCapabilities(queryClient, resolveScope(scope), variables.warehouseId)
    },
  })
}

export function useRemoveWarehouseCapabilityOperationMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      capabilityId,
      operation,
    }: {
      readonly warehouseId: string
      readonly capabilityId: string
      readonly operation: CapabilityOperation
    }) => warehouseService.removeWarehouseCapabilityOperation(capabilityId, operation),
    onSuccess: (_, variables) => {
      invalidateWarehouseCapabilities(queryClient, resolveScope(scope), variables.warehouseId)
    },
  })
}

export function useCreateWarehouseMaterialSettingMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: (request: CreateWarehouseMaterialSettingRequest) =>
      warehouseService.createWarehouseMaterialSetting(request),
    onSuccess: (_, { warehouseId }) => {
      invalidateWarehouseMaterialSettings(queryClient, resolveScope(scope), warehouseId)
      toast.success({ title: 'تمت إضافة إعداد المادة.' })
    },
  })
}

export function useUpdateWarehouseMaterialSettingMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      settingId,
      request,
    }: {
      readonly warehouseId: string
      readonly settingId: string
      readonly request: UpdateWarehouseMaterialSettingRequest
    }) => warehouseService.updateWarehouseMaterialSetting(settingId, request),
    onSuccess: (_, { warehouseId }) => {
      invalidateWarehouseMaterialSettings(queryClient, resolveScope(scope), warehouseId)
      toast.success({ title: 'تم حفظ تعديل إعداد المادة.' })
    },
  })
}

export function useSetWarehouseMaterialSettingStatusMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      settingId,
      request,
    }: {
      readonly warehouseId: string
      readonly settingId: string
      readonly request: SetWarehouseMaterialSettingStatusRequest
    }) => warehouseService.setWarehouseMaterialSettingStatus(settingId, request),
    onSuccess: (_, { warehouseId }) => {
      invalidateWarehouseMaterialSettings(queryClient, resolveScope(scope), warehouseId)
    },
  })
}
