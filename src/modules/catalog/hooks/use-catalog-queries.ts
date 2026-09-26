import { catalogService } from '@/modules/catalog/services/catalog.service'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type {
  ListUnitsOfMeasureQuery,
  ListMaterialDomainsQuery,
  ListMaterialCategoriesQuery,
  ListMaterialFamiliesQuery,
  ListMaterialsQuery,
  ListMaterialUnitConversionsQuery,
  UnitOfMeasureUpsertRequest,
  MaterialDomainUpsertRequest,
  MaterialCategoryUpsertRequest,
  MaterialFamilyUpsertRequest,
  MaterialUpsertRequest,
  MaterialUnitConversionUpsertRequest,
} from '@/modules/catalog/types/catalog.api-types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const CATALOG_RESOURCE = 'catalog'

export const catalogQueryKeys = {
  unitsOfMeasure: (scope: ScopeCacheKey, query: ListUnitsOfMeasureQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'unitsOfMeasure', query),
  unitOfMeasure: (scope: ScopeCacheKey, unitId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'unitsOfMeasure', unitId),
  materialDomains: (scope: ScopeCacheKey, query: ListMaterialDomainsQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialDomains', query),
  materialDomain: (scope: ScopeCacheKey, materialDomainId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialDomains', materialDomainId),
  materialCategories: (scope: ScopeCacheKey, query: ListMaterialCategoriesQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialCategories', query),
  materialCategory: (scope: ScopeCacheKey, materialCategoryId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialCategories', materialCategoryId),
  materialFamilies: (scope: ScopeCacheKey, query: ListMaterialFamiliesQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialFamilies', query),
  materialFamily: (scope: ScopeCacheKey, materialFamilyId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materialFamilies', materialFamilyId),
  materials: (scope: ScopeCacheKey, query: ListMaterialsQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', query),
  material: (scope: ScopeCacheKey, materialId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', materialId),
  materialUnitConversions: (
    scope: ScopeCacheKey,
    materialId: string,
    query: ListMaterialUnitConversionsQuery,
  ) => queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', materialId, 'unitConversions', query),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

export function useUnitsOfMeasureQuery(
  query: ListUnitsOfMeasureQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'unitsOfMeasure',
      query,
    ),
    queryFn: () => catalogService.listUnitsOfMeasure(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useUnitOfMeasureQuery(unitId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'unitsOfMeasure',
      unitId,
    ),
    queryFn: () => catalogService.getUnitOfMeasure(unitId ?? ''),
    enabled: scope !== undefined && unitId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialDomainsQuery(
  query: ListMaterialDomainsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialDomains',
      query,
    ),
    queryFn: () => catalogService.listMaterialDomains(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialDomainQuery(materialDomainId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialDomains',
      materialDomainId,
    ),
    queryFn: () => catalogService.getMaterialDomain(materialDomainId ?? ''),
    enabled: scope !== undefined && materialDomainId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialCategoriesQuery(
  query: ListMaterialCategoriesQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialCategories',
      query,
    ),
    queryFn: () => catalogService.listMaterialCategories(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialCategoryQuery(materialCategoryId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialCategories',
      materialCategoryId,
    ),
    queryFn: () => catalogService.getMaterialCategory(materialCategoryId ?? ''),
    enabled: scope !== undefined && materialCategoryId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialFamiliesQuery(
  query: ListMaterialFamiliesQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialFamilies',
      query,
    ),
    queryFn: () => catalogService.listMaterialFamilies(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialFamilyQuery(materialFamilyId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materialFamilies',
      materialFamilyId,
    ),
    queryFn: () => catalogService.getMaterialFamily(materialFamilyId ?? ''),
    enabled: scope !== undefined && materialFamilyId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialsQuery(
  query: ListMaterialsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materials',
      query,
    ),
    queryFn: () => catalogService.listMaterials(query),
    enabled: options.enabled !== undefined ? options.enabled : scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialQuery(materialId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materials',
      materialId,
    ),
    queryFn: () => catalogService.getMaterial(materialId ?? ''),
    enabled: scope !== undefined && materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialUnitConversionsQuery(
  materialId: string | undefined,
  query: ListMaterialUnitConversionsQuery = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey: queryKeys.scoped(
      scope ?? { kind: 'enterprise' },
      CATALOG_RESOURCE,
      'materials',
      materialId,
      'unitConversions',
      query,
    ),
    queryFn: () => catalogService.listMaterialUnitConversions(materialId ?? '', query),
    enabled:
      (options.enabled !== undefined ? options.enabled : scope !== undefined) &&
      materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useUpdateUnitOfMeasureMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      unitId,
      request,
    }: {
      readonly unitId: string
      readonly request: UnitOfMeasureUpsertRequest
    }) => catalogService.updateUnitOfMeasure(unitId, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'unitsOfMeasure',
          variables.unitId,
        ),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'unitsOfMeasure',
          {},
        ),
      })
    },
  })
}

export function useUpdateMaterialDomainMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      materialDomainId,
      request,
    }: {
      readonly materialDomainId: string
      readonly request: MaterialDomainUpsertRequest
    }) => catalogService.updateMaterialDomain(materialDomainId, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materialDomains',
          variables.materialDomainId,
        ),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materialDomains',
          {},
        ),
      })
    },
  })
}

export function useUpdateMaterialCategoryMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      materialCategoryId,
      request,
    }: {
      readonly materialCategoryId: string
      readonly request: MaterialCategoryUpsertRequest
    }) => catalogService.updateMaterialCategory(materialCategoryId, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materialCategories',
          variables.materialCategoryId,
        ),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materialCategories',
          {},
        ),
      })
    },
  })
}

export function useUpdateMaterialFamilyMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      materialFamilyId,
      request,
    }: {
      readonly materialFamilyId: string
      readonly request: MaterialFamilyUpsertRequest
    }) => catalogService.updateMaterialFamily(materialFamilyId, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materialFamilies',
          variables.materialFamilyId,
        ),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materialFamilies',
          {},
        ),
      })
    },
  })
}

export function useUpdateMaterialMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      materialId,
      request,
    }: {
      readonly materialId: string
      readonly request: MaterialUpsertRequest
    }) => catalogService.updateMaterial(materialId, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materials',
          variables.materialId,
        ),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materials',
          {},
        ),
      })
    },
  })
}

export function useUpdateMaterialUnitConversionMutation() {
  const queryClient = useQueryClient()
  const scope = useActiveScopeCacheKey()
  return useMutation({
    mutationFn: ({
      materialId,
      materialUnitConversionId,
      request,
    }: {
      readonly materialId: string
      readonly materialUnitConversionId: string
      readonly request: MaterialUnitConversionUpsertRequest
    }) =>
      catalogService.updateMaterialUnitConversion(materialId, materialUnitConversionId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoped(
          scope ?? { kind: 'enterprise' },
          CATALOG_RESOURCE,
          'materials',
          {},
          'unitConversions',
          {},
        ),
      })
    },
  })
}
