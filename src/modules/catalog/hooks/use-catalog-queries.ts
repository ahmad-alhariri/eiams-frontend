import { useQuery } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import type {
  ListMaterialCategoriesQuery,
  ListMaterialDomainsQuery,
  ListMaterialFamiliesQuery,
  ListMaterialsQuery,
} from '@/modules/catalog/types/catalog.types'
import { MASTER_DATA_STALE_TIME } from '@/shared/services/query.client'
import { queryKeys, type ScopeCacheKey } from '@/shared/services/query-keys'

const CATALOG_RESOURCE = 'catalog'
const EMPTY_QUERY = {} as const

export const catalogQueryKeys = {
  materialDomains: (scope: ScopeCacheKey, query: ListMaterialDomainsQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'material-domains', query),
  materialDomain: (scope: ScopeCacheKey, domainId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'material-domains', domainId),
  materialCategories: (scope: ScopeCacheKey, query: ListMaterialCategoriesQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'material-categories', query),
  materialCategory: (scope: ScopeCacheKey, categoryId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'material-categories', categoryId),
  materialFamilies: (scope: ScopeCacheKey, query: ListMaterialFamiliesQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'material-families', query),
  materialFamily: (scope: ScopeCacheKey, familyId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'material-families', familyId),
  materials: (scope: ScopeCacheKey, query: ListMaterialsQuery) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', query),
  material: (scope: ScopeCacheKey, materialId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', materialId),
  materialUnitConversions: (scope: ScopeCacheKey, materialId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'materials', materialId, 'unit-conversions'),
  materialUnitConversion: (scope: ScopeCacheKey, materialId: string, conversionId: string) =>
    queryKeys.scoped(
      scope,
      CATALOG_RESOURCE,
      'materials',
      materialId,
      'unit-conversions',
      conversionId,
    ),
  unitsOfMeasure: (scope: ScopeCacheKey) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'units-of-measure'),
  unitOfMeasure: (scope: ScopeCacheKey, unitId: string) =>
    queryKeys.scoped(scope, CATALOG_RESOURCE, 'units-of-measure', unitId),
}

function useActiveScopeCacheKey() {
  return useActiveScopeContext().activeScopeCacheKey
}

export function useMaterialDomainsQuery(query: ListMaterialDomainsQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'material-domains', query)
        : catalogQueryKeys.materialDomains(scope, query),
    queryFn: () => catalogService.listMaterialDomains(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialDomainQuery(domainId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || domainId === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'material-domains', domainId)
        : catalogQueryKeys.materialDomain(scope, domainId),
    queryFn: () => catalogService.getMaterialDomain(domainId ?? ''),
    enabled: scope !== undefined && domainId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialCategoriesQuery(query: ListMaterialCategoriesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'material-categories', query)
        : catalogQueryKeys.materialCategories(scope, query),
    queryFn: () => catalogService.listMaterialCategories(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialCategoryQuery(categoryId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || categoryId === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'material-categories', categoryId)
        : catalogQueryKeys.materialCategory(scope, categoryId),
    queryFn: () => catalogService.getMaterialCategory(categoryId ?? ''),
    enabled: scope !== undefined && categoryId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialFamiliesQuery(query: ListMaterialFamiliesQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'material-families', query)
        : catalogQueryKeys.materialFamilies(scope, query),
    queryFn: () => catalogService.listMaterialFamilies(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialFamilyQuery(familyId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || familyId === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'material-families', familyId)
        : catalogQueryKeys.materialFamily(scope, familyId),
    queryFn: () => catalogService.getMaterialFamily(familyId ?? ''),
    enabled: scope !== undefined && familyId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialsQuery(query: ListMaterialsQuery = EMPTY_QUERY) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'materials', query)
        : catalogQueryKeys.materials(scope, query),
    queryFn: () => catalogService.listMaterials(query),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialQuery(materialId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || materialId === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'materials', materialId)
        : catalogQueryKeys.material(scope, materialId),
    queryFn: () => catalogService.getMaterial(materialId ?? ''),
    enabled: scope !== undefined && materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

/** Material-specific alternative units; a shared unit name never implies a global factor. */
export function useMaterialUnitConversionsQuery(materialId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || materialId === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'materials', materialId, 'unit-conversions')
        : catalogQueryKeys.materialUnitConversions(scope, materialId),
    queryFn: () => catalogService.listMaterialUnitConversions(materialId ?? ''),
    enabled: scope !== undefined && materialId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useMaterialUnitConversionQuery(
  materialId: string | undefined,
  conversionId: string | undefined,
) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || materialId === undefined || conversionId === undefined
        ? queryKeys.public(
            CATALOG_RESOURCE,
            'materials',
            materialId,
            'unit-conversions',
            conversionId,
          )
        : catalogQueryKeys.materialUnitConversion(scope, materialId, conversionId),
    queryFn: () => catalogService.getMaterialUnitConversion(materialId ?? '', conversionId ?? ''),
    enabled: scope !== undefined && materialId !== undefined && conversionId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useUnitsOfMeasureQuery() {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'units-of-measure')
        : catalogQueryKeys.unitsOfMeasure(scope),
    queryFn: () => catalogService.listUnitsOfMeasure(),
    enabled: scope !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}

export function useUnitOfMeasureQuery(unitId: string | undefined) {
  const scope = useActiveScopeCacheKey()
  return useQuery({
    queryKey:
      scope === undefined || unitId === undefined
        ? queryKeys.public(CATALOG_RESOURCE, 'units-of-measure', unitId)
        : catalogQueryKeys.unitOfMeasure(scope, unitId),
    queryFn: () => catalogService.getUnitOfMeasure(unitId ?? ''),
    enabled: scope !== undefined && unitId !== undefined,
    staleTime: MASTER_DATA_STALE_TIME,
  })
}
