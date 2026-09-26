import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'
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

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) return

    await queryClient.invalidateQueries({
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'catalog'),
      exact: false,
    })
  }
}

// --- Cache installation helpers ---

/** Install a created/updated unit of measure into the cache. */
function installUnitOfMeasure(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  unitId: string,
  unit: { unitId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'catalog', 'unitsOfMeasure', unitId), unit)
}

/** Install a created/updated material domain into the cache. */
function installMaterialDomain(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  domainId: string,
  domain: { materialDomainId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'catalog', 'materialDomains', domainId), domain)
}

/** Install a created/updated material category into the cache. */
function installMaterialCategory(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  categoryId: string,
  category: { materialCategoryId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'catalog', 'materialCategories', categoryId), category)
}

/** Install a created/updated material family into the cache. */
function installMaterialFamily(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  familyId: string,
  family: { materialFamilyId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'catalog', 'materialFamilies', familyId), family)
}

/** Install a created/updated material into the cache. */
function installMaterial(
  client: ReturnType<typeof useQueryClient>,
  scope: ScopeCacheKey | undefined,
  materialId: string,
  material: { materialId: string },
) {
  if (scope === undefined) return
  client.setQueryData(queryKeys.scoped(scope, 'catalog', 'materials', materialId), material)
}

// --- Mutation hooks ---

export function useCreateMaterialDomainMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: catalogService.createMaterialDomain,
    onSuccess: (result) => {
      installMaterialDomain(queryClient, scope, result.materialDomainId, result)
      void invalidate()
    },
  })
}

export function useUpdateMaterialDomainMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ domainId, request }: UpdateMaterialDomainVariables) =>
      catalogService.updateMaterialDomain(domainId, request),
    onSuccess: (result) => {
      installMaterialDomain(queryClient, scope, result.materialDomainId, result)
      void invalidate()
    },
  })
}

export function useCreateMaterialCategoryMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: catalogService.createMaterialCategory,
    onSuccess: (result) => {
      installMaterialCategory(queryClient, scope, result.materialCategoryId, result)
      void invalidate()
    },
  })
}

export function useUpdateMaterialCategoryMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ categoryId, request }: UpdateMaterialCategoryVariables) =>
      catalogService.updateMaterialCategory(categoryId, request),
    onSuccess: (result) => {
      installMaterialCategory(queryClient, scope, result.materialCategoryId, result)
      void invalidate()
    },
  })
}

export function useCreateMaterialFamilyMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: catalogService.createMaterialFamily,
    onSuccess: (result) => {
      installMaterialFamily(queryClient, scope, result.materialFamilyId, result)
      void invalidate()
    },
  })
}

export function useUpdateMaterialFamilyMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ familyId, request }: UpdateMaterialFamilyVariables) =>
      catalogService.updateMaterialFamily(familyId, request),
    onSuccess: (result) => {
      installMaterialFamily(queryClient, scope, result.materialFamilyId, result)
      void invalidate()
    },
  })
}

export function useCreateMaterialMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: catalogService.createMaterial,
    onSuccess: (result) => {
      installMaterial(queryClient, scope, result.materialId, result)
      void invalidate()
    },
  })
}

export function useUpdateMaterialMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, request }: UpdateMaterialVariables) =>
      catalogService.updateMaterial(materialId, request),
    onSuccess: (result) => {
      installMaterial(queryClient, scope, result.materialId, result)
      void invalidate()
    },
  })
}

export function useCreateMaterialUnitConversionMutation() {
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, request }: CreateMaterialUnitConversionVariables) =>
      catalogService.createMaterialUnitConversion(materialId, request),
    onSuccess: () => {
      if (scope === undefined) return
      void invalidate()
    },
  })
}

export function useUpdateMaterialUnitConversionMutation() {
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, conversionId, request }: UpdateMaterialUnitConversionVariables) =>
      catalogService.updateMaterialUnitConversion(materialId, conversionId, request),
    onSuccess: () => {
      if (scope === undefined) return
      void invalidate()
    },
  })
}

export function useCreateUnitOfMeasureMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: catalogService.createUnitOfMeasure,
    onSuccess: (result) => {
      installUnitOfMeasure(queryClient, scope, result.unitId, result)
      void invalidate()
    },
  })
}

export function useUpdateUnitOfMeasureMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ unitId, request }: UpdateUnitOfMeasureVariables) =>
      catalogService.updateUnitOfMeasure(unitId, request),
    onSuccess: (result) => {
      installUnitOfMeasure(queryClient, scope, result.unitId, result)
      void invalidate()
    },
  })
}
