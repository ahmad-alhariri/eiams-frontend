import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import { queryKeys } from '@/shared/services/query-keys'
import type {
  MaterialCategoryUpsertRequest,
  MaterialDomainUpsertRequest,
  MaterialFamilyUpsertRequest,
  MaterialUnitConversionUpsertRequest,
  MaterialUpsertRequest,
  UnitOfMeasureUpsertRequest,
} from '@/modules/catalog/types/catalog.types'

type UpdateMaterialDomainVariables = { domainId: string; request: MaterialDomainUpsertRequest }
type UpdateMaterialCategoryVariables = {
  categoryId: string
  request: MaterialCategoryUpsertRequest
}
type UpdateMaterialFamilyVariables = { familyId: string; request: MaterialFamilyUpsertRequest }
type UpdateMaterialVariables = { materialId: string; request: MaterialUpsertRequest }
type CreateMaterialUnitConversionVariables = {
  materialId: string
  request: MaterialUnitConversionUpsertRequest
}
type UpdateMaterialUnitConversionVariables = {
  materialId: string
  conversionId: string
  request: MaterialUnitConversionUpsertRequest
}
type UpdateUnitOfMeasureVariables = { unitId: string; request: UnitOfMeasureUpsertRequest }

function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) return

    await queryClient.invalidateQueries({
      // Hierarchy names and units are embedded in downstream catalog responses.
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'catalog'),
      exact: false,
    })
  }
}

export function useCreateMaterialDomainMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterialDomain, onSuccess: invalidate })
}

export function useUpdateMaterialDomainMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ domainId, request }: UpdateMaterialDomainVariables) =>
      catalogService.updateMaterialDomain(domainId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialCategoryMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterialCategory, onSuccess: invalidate })
}

export function useUpdateMaterialCategoryMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ categoryId, request }: UpdateMaterialCategoryVariables) =>
      catalogService.updateMaterialCategory(categoryId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialFamilyMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterialFamily, onSuccess: invalidate })
}

export function useUpdateMaterialFamilyMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ familyId, request }: UpdateMaterialFamilyVariables) =>
      catalogService.updateMaterialFamily(familyId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterial, onSuccess: invalidate })
}

export function useUpdateMaterialMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, request }: UpdateMaterialVariables) =>
      catalogService.updateMaterial(materialId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialUnitConversionMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, request }: CreateMaterialUnitConversionVariables) =>
      catalogService.createMaterialUnitConversion(materialId, request),
    onSuccess: invalidate,
  })
}

export function useUpdateMaterialUnitConversionMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, conversionId, request }: UpdateMaterialUnitConversionVariables) =>
      catalogService.updateMaterialUnitConversion(materialId, conversionId, request),
    onSuccess: invalidate,
  })
}

export function useCreateUnitOfMeasureMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createUnitOfMeasure, onSuccess: invalidate })
}

export function useUpdateUnitOfMeasureMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ unitId, request }: UpdateUnitOfMeasureVariables) =>
      catalogService.updateUnitOfMeasure(unitId, request),
    onSuccess: invalidate,
  })
}
